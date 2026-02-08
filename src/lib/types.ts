export interface Chat {
	id: string;
	title: string;
	sessionId: string;
	storageVersion?: number;
	createdAt: string;
	updatedAt: string;
	messages?: Message[];
}

export interface Message {
	id: string;
	chatId: string;
	role: "user" | "assistant" | "tool_use" | "tool_result";
	content: string;
	thinking?: string | null;
	toolName?: string | null;
	toolInput?: unknown;
	stopReason?: string | null;
	segments?: ContentSegment[];
	createdAt: string;
}

export interface ToolUse {
	name: string;
	input: unknown;
	status?: "pending" | "running" | "complete";
}

export type ContentSegment =
	| { type: "text"; text: string }
	| { type: "tool_use"; tool: ToolUse }
	| { type: "thinking"; thinking: string; isComplete?: boolean }
	| { type: "stop_notice"; stopReason: string; subtype?: string };

export interface StreamEvent {
	type:
		| "init"
		| "delta"
		| "tool_use"
		| "result"
		| "done"
		| "error"
		| "thinking"
		| "turn_complete"
		| "status";
	data: unknown;
}

export interface StatusEvent {
	stage: string;
	message: string;
}

export interface ThinkingEvent {
	thinking: string;
}

export interface ChatInitEvent {
	chatId: string;
	sessionId: string;
}

export interface DeltaEvent {
	text: string;
}

export interface ToolUseEvent {
	name: string;
	input: unknown;
}

export interface ResultEvent {
	subtype: string;
	stop_reason?: string | null;
	duration_ms: number;
	cost_usd?: number;
	session_id: string;
}

export interface DoneEvent {
	chatId: string;
	sessionId: string;
}

export interface ErrorEvent {
	message: string;
}

export interface StreamingMessage {
	segments: ContentSegment[];
	isStreaming: boolean;
}

export interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
	thinking?: string | null;
	tools?: Array<{ name: string; input: unknown }>;
}

export interface QueuedMessage {
	id: string;
	content: string;
}
