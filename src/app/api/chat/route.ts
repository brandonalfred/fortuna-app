import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Query } from "@/lib/agent/client";
import {
	createLocalAgentQuery,
	extractThinkingFromMessage,
	streamAgentResponse,
} from "@/lib/agent/client";
import { getOrCreateWorkspace } from "@/lib/agent/workspace";
import {
	badRequest,
	getAuthenticatedUser,
	serverError,
	unauthorized,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { sendMessageSchema } from "@/lib/validations/chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) {
			return unauthorized();
		}

		const body = await req.json();
		const parsed = sendMessageSchema.safeParse(body);

		if (!parsed.success) {
			return badRequest("Invalid request", parsed.error.flatten());
		}

		const { message, chatId, timezone } = parsed.data;

		const existingChat = chatId
			? await prisma.chat.findUnique({
					where: { id: chatId, userId: user.id },
				})
			: null;

		const existingMessages = existingChat
			? await prisma.message.findMany({
					where: { chatId: existingChat.id },
					orderBy: { createdAt: "asc" },
				})
			: [];

		const sessionId = existingChat?.sessionId || randomUUID();
		const workspacePath = await getOrCreateWorkspace(sessionId);

		const conversationHistory = existingMessages.map((m) => ({
			role: m.role as "user" | "assistant",
			content: m.content,
			thinking: m.thinking,
		}));

		const chat =
			existingChat ||
			(await prisma.chat.create({
				data: {
					sessionId,
					title: message.length > 50 ? `${message.slice(0, 50)}...` : message,
					userId: user.id,
				},
			}));

		await prisma.message.create({
			data: {
				chatId: chat.id,
				role: "user",
				content: message,
			},
		});

		const encoder = new TextEncoder();
		const abortController = new AbortController();

		const agentOptions = {
			prompt: message,
			workspacePath,
			chatId: chat.id,
			conversationHistory,
			abortController,
			timezone,
		};

		const isLocal = !process.env.VERCEL;
		// Local: Query object with interrupt() support for graceful shutdown
		// Vercel: async generator only — interrupt() not available (TODO: add sandbox interrupt support)
		const agentQuery: Query | null = isLocal
			? createLocalAgentQuery(agentOptions)
			: null;
		const agentStream = agentQuery ?? streamAgentResponse(agentOptions);

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
				let fullThinkingContent = "";
				const toolUses: Array<{ name: string; input: unknown }> = [];
				let lastEventWasToolUse = false;
				const sentThinkingIds = new Set<string>();

				let savedToDb = false;
				async function saveAssistantMessage(): Promise<void> {
					if (savedToDb) return;
					if (!fullAssistantContent && toolUses.length === 0) return;
					await prisma.message.create({
						data: {
							chatId: chat.id,
							role: "assistant",
							content: fullAssistantContent,
							thinking: fullThinkingContent || null,
							toolName: toolUses[0]?.name,
							toolInput:
								toolUses.length > 0
									? (toolUses as unknown as Prisma.InputJsonValue)
									: undefined,
						},
					});
					savedToDb = true;
				}

				try {
					console.log("[Chat API] Starting agent stream...");

					for await (const msg of agentStream) {
						console.log("[Chat API] Received message type:", msg.type);

						if (
							lastEventWasToolUse &&
							(msg.type === "assistant" ||
								(msg.type === "stream_event" &&
									msg.event.type === "message_start"))
						) {
							sendEvent("turn_complete", {});
							sendEvent("delta", { text: "\n\n" });
							fullAssistantContent += "\n\n";
							lastEventWasToolUse = false;
						}

						switch (msg.type) {
							case "assistant": {
								const messageId = msg.message.id;
								if (!sentThinkingIds.has(messageId)) {
									const thinking = extractThinkingFromMessage(msg);
									if (thinking) {
										sendEvent("thinking", { thinking });
										sentThinkingIds.add(messageId);
										fullThinkingContent +=
											(fullThinkingContent ? "\n\n" : "") + thinking;
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

					console.log(
						"[Chat API] Stream loop completed, content length:",
						fullAssistantContent.length,
						"tool uses:",
						toolUses.length,
					);

					await saveAssistantMessage();
					sendEvent("done", { chatId: chat.id, sessionId });
				} catch (error) {
					if (!abortController.signal.aborted) {
						console.error("[Chat API] Stream error:", error);
						const errorMessage =
							error instanceof Error ? error.message : "Unknown error";
						try {
							sendEvent("error", { message: errorMessage });
						} catch {
							/* stream closed */
						}
					}
				} finally {
					try {
						await saveAssistantMessage();
					} catch (e) {
						console.error("[Chat API] Failed to save partial response:", e);
					}
					try {
						controller.close();
					} catch {
						/* stream closed */
					}
				}
			},
			cancel() {
				if (agentQuery) {
					agentQuery.interrupt().catch(() => {
						/* best-effort */
					});
				}
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
		return serverError(error);
	}
}
