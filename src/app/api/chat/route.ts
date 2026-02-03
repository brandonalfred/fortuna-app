import { randomUUID } from "node:crypto";
import {
	extractThinkingFromMessage,
	streamAgentResponse,
} from "@/lib/agent/client";
import { getOrCreateWorkspace } from "@/lib/agent/workspace";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema } from "@/lib/validations/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
	try {
		const body = await req.json();
		const parsed = sendMessageSchema.safeParse(body);

		if (!parsed.success) {
			return Response.json(
				{ error: "Invalid request", details: parsed.error.flatten() },
				{ status: 400 },
			);
		}

		const { message, chatId } = parsed.data;

		// Fetch existing chat if chatId provided
		const existingChat = chatId
			? await prisma.chat.findUnique({ where: { id: chatId } })
			: null;

		// Fetch conversation history separately
		const existingMessages = existingChat
			? await prisma.message.findMany({
					where: { chatId: existingChat.id },
					orderBy: { createdAt: "asc" },
				})
			: [];

		const sessionId = existingChat?.sessionId || randomUUID();
		const workspacePath = await getOrCreateWorkspace(sessionId);

		// Build conversation history from existing messages
		const conversationHistory = existingMessages.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
		}));

		const chat =
			existingChat ||
			(await prisma.chat.create({
				data: {
					sessionId,
					title: message.length > 50 ? `${message.slice(0, 50)}...` : message,
				},
			}));

		// Save user message
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
						encoder.encode(
							`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
						),
					);
				};

				sendEvent("init", { chatId: chat.id, sessionId });

				let fullAssistantContent = "";
				const toolUses: Array<{ name: string; input: unknown }> = [];
				let lastEventWasToolUse = false;
				const sentThinkingIds = new Set<string>();

				try {
					for await (const msg of streamAgentResponse({
						prompt: message,
						workspacePath,
						conversationHistory,
						abortController,
					})) {
						switch (msg.type) {
							case "assistant": {
								const messageId = msg.message.id;
								if (!sentThinkingIds.has(messageId)) {
									const thinking = extractThinkingFromMessage(msg);
									if (thinking) {
										sendEvent("thinking", { thinking });
										sentThinkingIds.add(messageId);
									}
								}

								for (const block of msg.message.content) {
									if (block.type === "text") {
										fullAssistantContent += block.text;
									} else if (block.type === "tool_use") {
										lastEventWasToolUse = true;
										const { name, input } = block;
										toolUses.push({ name, input });
										sendEvent("tool_use", { name, input });
									}
								}
								break;
							}
							case "stream_event": {
								const event = msg.event;
								if (event.type === "message_start" && lastEventWasToolUse) {
									sendEvent("delta", { text: "\n\n" });
									fullAssistantContent += "\n\n";
									lastEventWasToolUse = false;
								} else if (
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
								toolName: toolUses[0]?.name,
								toolInput: toolUses.length > 0 ? toolUses : undefined,
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
	} catch (error) {
		console.error("Chat API error:", error);
		return Response.json(
			{
				error: error instanceof Error ? error.message : "Internal server error",
			},
			{ status: 500 },
		);
	}
}
