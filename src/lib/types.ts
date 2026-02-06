export interface Chat {
	id: string;
	title: string;
	sessionId: string;
	createdAt: string;
	updatedAt: string;
	messages?: Message[];
}

export interface Message {
	id: string;
	chatId: string;
	role: "user" | "assistant" | "tool_use" | "tool_result";
	content: string;
	toolName?: string | null;
	toolInput?: unknown;
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
	| { type: "thinking"; thinking: string; isComplete?: boolean };

export interface StreamEvent {
	type:
		| "init"
		| "delta"
		| "tool_use"
		| "result"
		| "done"
		| "error"
		| "thinking"
		| "turn_complete";
	data: unknown;
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
