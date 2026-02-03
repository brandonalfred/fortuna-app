import { randomUUID } from "node:crypto";
import { streamAgentResponse } from "@/lib/agent/client";
import { getOrCreateWorkspace } from "@/lib/agent/workspace";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema } from "@/lib/validations/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	const body = await req.json();
	const parsed = sendMessageSchema.safeParse(body);

	if (!parsed.success) {
		return Response.json(
			{ error: "Invalid request", details: parsed.error.flatten() },
			{ status: 400 },
		);
	}

	const { message, chatId, sessionId: existingSessionId } = parsed.data;

	const sessionId = existingSessionId || randomUUID();
	const workspacePath = await getOrCreateWorkspace(sessionId);

	let chat = chatId
		? await prisma.chat.findUnique({ where: { id: chatId } })
		: null;

	if (!chat) {
		chat = await prisma.chat.create({
			data: {
				sessionId,
				title: message.slice(0, 50) + (message.length > 50 ? "..." : ""),
			},
		});
	}

	await prisma.message.create({
		data: {
			chatId: chat.id,
			role: "user",
			content: message,
		},
	});

	const encoder = new TextEncoder();
	const abortController = new AbortController();

	const stream = new ReadableStream({
		async start(controller) {
			const sendEvent = (event: string, data: unknown) => {
				controller.enqueue(
					encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
				);
			};

			sendEvent("init", { chatId: chat.id, sessionId });

			let fullAssistantContent = "";
			const toolUses: Array<{ name: string; input: unknown }> = [];

			try {
				for await (const msg of streamAgentResponse({
					prompt: message,
					workspacePath,
					resumeSessionId: existingSessionId,
					abortController,
				})) {
					switch (msg.type) {
						case "assistant": {
							const content = msg.message.content;
							for (const block of content) {
								if (block.type === "text") {
									fullAssistantContent += block.text;
									sendEvent("text", { text: block.text });
								} else if (block.type === "tool_use") {
									const toolBlock = block as {
										type: "tool_use";
										name: string;
										input: unknown;
									};
									toolUses.push({
										name: toolBlock.name,
										input: toolBlock.input,
									});
									sendEvent("tool_use", {
										name: toolBlock.name,
										input: toolBlock.input,
									});
								}
							}
							break;
						}
						case "stream_event": {
							const event = msg.event;
							if (
								event.type === "content_block_delta" &&
								"delta" in event &&
								event.delta.type === "text_delta"
							) {
								const delta = event.delta as { text: string };
								sendEvent("delta", { text: delta.text });
							}
							break;
						}
						case "result": {
							const resultData: Record<string, unknown> = {
								subtype: msg.subtype,
								duration_ms: msg.duration_ms,
								session_id: msg.session_id,
							};
							if ("cost_usd" in msg) {
								resultData.cost_usd = msg.cost_usd;
							}
							sendEvent("result", resultData);
							break;
						}
					}
				}

				if (fullAssistantContent || toolUses.length > 0) {
					await prisma.message.create({
						data: {
							chatId: chat.id,
							role: "assistant",
							content: fullAssistantContent,
							toolName: toolUses.length > 0 ? toolUses[0].name : undefined,
							toolInput:
								toolUses.length > 0
									? JSON.parse(JSON.stringify(toolUses))
									: undefined,
						},
					});
				}

				sendEvent("done", { chatId: chat.id, sessionId });
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				sendEvent("error", { message: errorMessage });
			} finally {
				controller.close();
			}
		},
		cancel() {
			abortController.abort();
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
