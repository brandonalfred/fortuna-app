export interface Chat {
	id: string;
	title: string;
	sessionId: string;
	isProcessing?: boolean;
	storageVersion?: number;
	lastSequenceNum?: number;
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
	attachments?: Attachment[];
	createdAt: string;
}

export interface ToolUse {
	name: string;
	input: unknown;
	status?: "pending" | "running" | "complete" | "interrupted";
}

export interface SubAgentUsage {
	total_tokens: number;
	tool_uses: number;
	duration_ms: number;
}

export interface SubAgent {
	taskId: string;
	description: string;
	status: "running" | "complete" | "failed" | "stopped";
	summary?: string;
	usage?: SubAgentUsage;
}

export type ContentSegment =
	| { type: "text"; text: string }
	| { type: "tool_use"; tool: ToolUse }
	| { type: "thinking"; thinking: string; isComplete?: boolean }
	| { type: "stop_notice"; stopReason: string; subtype?: string }
	| { type: "subagent_group"; agents: SubAgent[] };

export interface StreamEvent {
	type:
		| "init"
		| "delta"
		| "tool_use"
		| "result"
		| "done"
		| "error"
		| "thinking"
		| "thinking_delta"
		| "turn_complete"
		| "status"
		| "chat_created"
		| "subagent_start"
		| "subagent_complete";
	data: unknown;
}

export interface StatusEvent {
	stage: string;
	message: string;
}

export interface ThinkingEvent {
	thinking: string;
}

export interface ThinkingDeltaEvent {
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

export interface SubAgentStartEvent {
	taskId: string;
	description: string;
	taskType?: string;
}

export interface SubAgentCompleteEvent {
	taskId: string;
	status: "completed" | "failed" | "stopped";
	summary: string;
	usage?: SubAgentUsage;
}

export interface StreamingMessage {
	segments: ContentSegment[];
	isStreaming: boolean;
}

export interface ConversationToolUse {
	toolUseId?: string;
	name: string;
	input: unknown;
}

export interface ConversationToolResult {
	toolUseId: string;
	content: string;
	isError: boolean;
}

export interface ConversationMessage {
	role: "user" | "assistant";
	content: string;
	thinking?: string | null;
	tools?: ConversationToolUse[];
	toolResults?: ConversationToolResult[];
	attachments?: Attachment[];
}

export interface Attachment {
	key: string;
	filename: string;
	mimeType: string;
	size: number;
	url?: string;
}

export interface TodoItem {
	status: "pending" | "in_progress" | "completed";
	content: string;
	activeForm: string;
}

export interface QueuedMessage {
	id: string;
	content: string;
	attachments?: Attachment[];
}
