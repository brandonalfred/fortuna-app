/**
 * SDK Event Translator
 *
 * Standalone ESM module that translates Claude Agent SDK messages into SSE events.
 * Runs inside the Vercel Sandbox (Node.js 22) — must be self-contained with no
 * TypeScript or app imports.
 */

// --- Inlined helpers from message-extraction.ts ---

function isContentBlock(value) {
	return typeof value === "object" && value !== null && "type" in value;
}

function extractTextParts(content) {
	if (typeof content === "string") return [content];
	if (!Array.isArray(content)) return [];

	const parts = [];
	for (const inner of content) {
		if (isContentBlock(inner) && inner.type === "text" && inner.text) {
			parts.push(inner.text);
		}
	}
	return parts;
}

function extractToolResultContent(msg) {
	const content = msg.message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	const parts = [];
	for (const block of content) {
		if (!isContentBlock(block)) continue;
		if (block.type === "tool_result") {
			parts.push(...extractTextParts(block.content));
		} else if (block.type === "text" && block.text) {
			parts.push(block.text);
		}
	}
	return parts.join("\n");
}

function extractIsError(content) {
	if (!Array.isArray(content)) return false;
	return content.some(
		(block) =>
			isContentBlock(block) &&
			block.type === "tool_result" &&
			block.is_error === true,
	);
}

function extractThinkingFromMessage(message) {
	if (message.type !== "assistant") return null;

	const content = message.message.content;
	const thinkingTexts = content
		.filter((block) => block.type === "thinking")
		.map((block) => block.thinking);

	return thinkingTexts.length > 0 ? thinkingTexts.join("\n\n") : null;
}

// --- SDK Event Translator ---

export class SDKEventTranslator {
	constructor() {
		this._content = "";
		this._thinking = "";
		this._toolUses = [];
		this._stopReason = null;
		this._sessionId = null;
		this._pendingThinking = "";
		this._inThinkingBlock = false;
		this._lastEventWasToolUse = false;
		this._sentThinkingIds = new Set();
	}

	get content() {
		return this._content;
	}
	get thinking() {
		return this._thinking;
	}
	get toolUses() {
		return this._toolUses;
	}
	get stopReason() {
		return this._stopReason;
	}
	get sessionId() {
		return this._sessionId;
	}

	reset() {
		this._content = "";
		this._thinking = "";
		this._toolUses = [];
		this._stopReason = null;
		this._pendingThinking = "";
		this._inThinkingBlock = false;
		this._lastEventWasToolUse = false;
		this._sentThinkingIds = new Set();
	}

	translate(msg) {
		const events = [];

		if (
			this._lastEventWasToolUse &&
			(msg.type === "assistant" ||
				(msg.type === "stream_event" &&
					msg.event.type === "message_start"))
		) {
			events.push({ type: "turn_complete", data: {} });
			events.push({ type: "delta", data: { text: "\n\n" } });
			this._content += "\n\n";
			this._lastEventWasToolUse = false;
		}

		switch (msg.type) {
			case "assistant": {
				const messageId = msg.message.id;
				if (
					!this._thinking &&
					!this._sentThinkingIds.has(messageId) &&
					!this._inThinkingBlock &&
					!this._pendingThinking
				) {
					const thinking = extractThinkingFromMessage(msg);
					if (thinking) {
						this._sentThinkingIds.add(messageId);
						this._recordThinking(thinking, events);
					}
				}

				for (const block of msg.message.content) {
					if (block.type === "text") {
						this._content += block.text;
					} else if (block.type === "tool_use") {
						this._lastEventWasToolUse = true;
						const { id: toolUseId, name, input } = block;
						this._toolUses.push({ toolUseId, name, input });
						if (name !== "Task") {
							events.push({
								type: "tool_use",
								data: { toolUseId, name, input },
							});
						}
					}
				}
				break;
			}
			case "system": {
				if (msg.subtype === "task_started") {
					events.push({
						type: "subagent_start",
						data: {
							taskId: msg.task_id,
							description: msg.description,
							taskType: msg.task_type,
						},
					});
				} else if (msg.subtype === "task_notification") {
					events.push({
						type: "subagent_complete",
						data: {
							taskId: msg.task_id,
							status: msg.status,
							summary: msg.summary,
							usage: msg.usage,
						},
					});
				}
				break;
			}
			case "stream_event": {
				const event = msg.event;
				if (
					event.type === "content_block_start" &&
					"content_block" in event
				) {
					if (this._inThinkingBlock && this._pendingThinking) {
						this._recordThinking(this._pendingThinking, events);
						this._pendingThinking = "";
					}
					const block = event.content_block;
					this._inThinkingBlock = block.type === "thinking";
				} else if (
					event.type === "content_block_delta" &&
					"delta" in event
				) {
					const delta = event.delta;
					if (delta.type === "text_delta" && delta.text) {
						events.push({
							type: "delta",
							data: { text: delta.text },
						});
						this._content += delta.text;
					} else if (
						delta.type === "thinking_delta" &&
						delta.thinking
					) {
						this._pendingThinking += delta.thinking;
						events.push({
							type: "thinking_delta",
							data: { thinking: delta.thinking },
						});
					}
				} else if (
					event.type === "content_block_stop" &&
					this._inThinkingBlock &&
					this._pendingThinking
				) {
					this._recordThinking(this._pendingThinking, events);
					this._pendingThinking = "";
					this._inThinkingBlock = false;
				}
				break;
			}
			case "result": {
				this._stopReason =
					"stop_reason" in msg ? msg.stop_reason : null;
				if (msg.session_id) {
					this._sessionId = msg.session_id;
				}
				events.push({
					type: "result",
					data: {
						subtype: msg.subtype,
						stop_reason: this._stopReason,
						duration_ms: msg.duration_ms,
						session_id: msg.session_id,
						...("cost_usd" in msg && { cost_usd: msg.cost_usd }),
					},
				});
				break;
			}
			case "user": {
				if (!msg.parent_tool_use_id) break;
				const text = extractToolResultContent(msg);
				if (!text) break;
				events.push({
					type: "tool_result",
					data: {
						toolUseId: msg.parent_tool_use_id,
						content: text,
						isError: extractIsError(msg.message.content),
					},
				});
				break;
			}
		}

		return events;
	}

	finalize() {
		const events = [];
		if (this._inThinkingBlock && this._pendingThinking) {
			this._recordThinking(this._pendingThinking, events);
			this._pendingThinking = "";
			this._inThinkingBlock = false;
		}
		if (this._lastEventWasToolUse) {
			events.push({ type: "turn_complete", data: {} });
			this._lastEventWasToolUse = false;
		}
		return events;
	}

	_recordThinking(thinking, events) {
		events.push({ type: "thinking", data: { thinking } });
		this._thinking += this._thinking
			? `\n\n${thinking}`
			: thinking;
	}
}
