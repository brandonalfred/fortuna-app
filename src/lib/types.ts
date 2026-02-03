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
	createdAt: string;
}

export interface ToolUse {
	name: string;
	input: unknown;
	status?: "pending" | "running" | "complete";
}

export interface StreamEvent {
	type: "init" | "text" | "delta" | "tool_use" | "result" | "done" | "error";
	data: unknown;
}

export interface ChatInitEvent {
	chatId: string;
	sessionId: string;
}

export interface TextEvent {
	text: string;
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
