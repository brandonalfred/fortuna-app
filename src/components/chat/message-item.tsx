"use client";

import {
	AlertTriangle,
	Ban,
	Brain,
	ChevronDown,
	ChevronRight,
	Clock,
	Info,
	Loader2,
	X,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentSegment, Message, ToolUse } from "@/lib/types";
import { cn } from "@/lib/utils";

const TOOL_LABEL_MAP: Record<string, string> = {
	Skill: "Analyzing",
	WebSearch: "Researching",
	WebFetch: "Reading source",
	Bash: "Running script",
	Read: "Reading file",
	Write: "Writing file",
	Edit: "Editing file",
	Glob: "Searching files",
	Grep: "Searching",
	TodoWrite: "Updating TODOs",
	TodoRead: "Checking TODOs",
};

function getToolLabel(name: string): string {
	return TOOL_LABEL_MAP[name] ?? name;
}

function truncate(text: string, maxLength = 60): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 3)}...`;
}

function getToolSummary(name: string, input: unknown): string | null {
	if (!input || typeof input !== "object") return null;
	const obj = input as Record<string, unknown>;

	switch (name) {
		case "Skill": {
			const skill = obj.skill as string | undefined;
			if (skill?.includes("odds")) return "Checking odds data";
			if (skill?.includes("sport")) return "Pulling player & team stats";
			return "Running analysis";
		}
		case "WebSearch": {
			const query = obj.query as string | undefined;
			return query ? truncate(query) : null;
		}
		case "WebFetch": {
			const url = obj.url as string | undefined;
			if (!url) return null;
			try {
				return new URL(url).hostname;
			} catch {
				return null;
			}
		}
		case "Bash":
			return null;
		case "Read":
		case "Write":
		case "Edit": {
			const filePath = obj.file_path as string | undefined;
			if (!filePath) return null;
			return filePath.split("/").pop() ?? null;
		}
		case "Grep":
		case "Glob": {
			const pattern = obj.pattern as string | undefined;
			return pattern ?? null;
		}
		default:
			return null;
	}
}

interface CollapsibleToolUse extends ToolUse {
	_groupCount?: number;
}

function findLastNonWhitespaceSegment(
	segments: ContentSegment[],
): ContentSegment | undefined {
	for (let i = segments.length - 1; i >= 0; i--) {
		const seg = segments[i];
		if (seg.type !== "text" || seg.text.trim() !== "") return seg;
	}
	return undefined;
}

const COLLAPSIBLE_TOOLS = new Set(["Bash", "TodoWrite"]);

function collapseToolSegments(segments: ContentSegment[]): ContentSegment[] {
	const result: ContentSegment[] = [];
	for (const seg of segments) {
		if (seg.type === "tool_use" && COLLAPSIBLE_TOOLS.has(seg.tool.name)) {
			const prev = findLastNonWhitespaceSegment(result);
			if (prev?.type === "tool_use" && prev.tool.name === seg.tool.name) {
				const target = prev.tool as CollapsibleToolUse;
				target._groupCount = (target._groupCount ?? 1) + 1;
				if (seg.tool.status === "running") target.status = "running";
				const prevIdx = result.lastIndexOf(prev);
				result.splice(prevIdx + 1);
				continue;
			}
		}

		if (seg.type === "tool_use") {
			result.push({ type: "tool_use", tool: { ...seg.tool } });
		} else {
			result.push(seg);
		}
	}
	return result;
}

const PROSE_CLASSES =
	"prose prose-invert prose-sm max-w-none font-body leading-relaxed prose-headings:text-text-primary prose-headings:font-heading prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-text-primary prose-code:text-accent-primary prose-code:bg-bg-tertiary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border-subtle prose-a:text-accent-primary prose-a:no-underline hover:prose-a:underline";

interface MessageItemProps {
	message: Message;
	animate?: boolean;
}

function renderMessageContent(message: Message): ReactNode {
	if (message.role === "user") {
		return <p>{message.content}</p>;
	}

	if (message.segments && message.segments.length > 0) {
		return collapseToolSegments(message.segments).map((segment, idx) => (
			<SegmentRenderer key={getSegmentKey(segment, idx)} segment={segment} />
		));
	}

	return (
		<>
			<Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
			{message.stopReason && message.stopReason !== "end_turn" && (
				<StopNoticeBanner stopReason={message.stopReason} />
			)}
		</>
	);
}

export function MessageItem({ message, animate = true }: MessageItemProps) {
	const isUser = message.role === "user";

	return (
		<div
			className={cn(
				"flex w-full",
				animate && "animate-message-in",
				isUser ? "justify-end" : "justify-start",
			)}
		>
			<div
				className={cn(
					"max-w-[85%] rounded-lg px-4 py-3",
					isUser ? "bg-accent-muted text-text-primary" : "text-text-primary",
				)}
			>
				<div className={PROSE_CLASSES}>{renderMessageContent(message)}</div>
			</div>
		</div>
	);
}

interface StreamingMessageItemProps {
	segments: ContentSegment[];
	isStreaming?: boolean;
	statusMessage?: string | null;
}

function getSegmentKey(segment: ContentSegment, idx: number): string {
	if (segment.type === "tool_use") {
		return `tool-${segment.tool.name}-${idx}`;
	}
	return `${segment.type}-${idx}`;
}

export function StreamingMessageItem({
	segments,
	isStreaming,
	statusMessage,
}: StreamingMessageItemProps) {
	return (
		<div className="animate-message-in flex w-full justify-start">
			<div className="max-w-[85%] rounded-lg px-4 py-3 text-text-primary">
				<div className={PROSE_CLASSES}>
					{collapseToolSegments(segments).map((segment, idx) => (
						<SegmentRenderer
							key={getSegmentKey(segment, idx)}
							segment={segment}
						/>
					))}
					{isStreaming && <LoadingIndicator statusMessage={statusMessage} />}
				</div>
			</div>
		</div>
	);
}

interface QueuedMessageItemProps {
	content: string;
	onCancel: () => void;
}

export function QueuedMessageItem({
	content,
	onCancel,
}: QueuedMessageItemProps) {
	return (
		<div className="animate-message-in flex w-full justify-end">
			<div className="group relative max-w-[85%] rounded-lg px-4 py-3 bg-accent-muted/60 border border-dashed border-accent-primary/30">
				<p className="font-body text-sm text-text-secondary">{content}</p>
				<div className="mt-1.5 flex items-center gap-1.5">
					<Clock className="h-3 w-3 text-text-tertiary" />
					<span className="text-xs text-text-tertiary">Queued</span>
					<span className="text-text-tertiary/40 text-xs">·</span>
					<button
						type="button"
						onClick={onCancel}
						className="flex items-center gap-0.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors"
						aria-label="Cancel queued message"
					>
						<X className="h-3 w-3" />
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}

interface LoadingIndicatorProps {
	statusMessage?: string | null;
}

function LoadingIndicator({ statusMessage }: LoadingIndicatorProps) {
	return (
		<span className="ml-1 inline-flex items-center gap-2">
			<Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
			{statusMessage && (
				<span className="text-xs text-text-secondary animate-subtle-pulse">
					{statusMessage}
				</span>
			)}
		</span>
	);
}

interface StopNoticeBannerProps {
	stopReason: string;
	subtype?: string;
}

const STOP_NOTICE_CONFIG: Record<
	string,
	{ icon: typeof Ban; message: string; variant: "error" | "warning" | "info" }
> = {
	refusal: {
		icon: Ban,
		message: "The model declined this request.",
		variant: "error",
	},
	max_tokens: {
		icon: AlertTriangle,
		message: "Response was truncated due to length limits.",
		variant: "warning",
	},
	error_max_turns: {
		icon: AlertTriangle,
		message: "Reached the maximum number of tool-use turns.",
		variant: "warning",
	},
	error_max_budget_usd: {
		icon: AlertTriangle,
		message: "Analysis stopped due to budget limits.",
		variant: "warning",
	},
	error_during_execution: {
		icon: AlertTriangle,
		message: "An error occurred during analysis.",
		variant: "error",
	},
};

const VARIANT_CLASSES = {
	error: "bg-error-subtle/50 border-error/30 text-error",
	warning: "bg-warning-subtle/50 border-warning/30 text-warning",
	info: "bg-bg-tertiary/50 border-border-subtle text-text-secondary",
};

function StopNoticeBanner({ stopReason, subtype }: StopNoticeBannerProps) {
	const key = subtype && subtype !== "success" ? subtype : stopReason;
	const config = STOP_NOTICE_CONFIG[key];
	const Icon = config?.icon ?? Info;
	const message = config?.message ?? `Response ended: ${stopReason}`;
	const variant = config?.variant ?? "info";

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-lg border px-3 py-2 text-xs my-2",
				VARIANT_CLASSES[variant],
			)}
		>
			<Icon className="h-3.5 w-3.5 shrink-0" />
			<span>{message}</span>
		</div>
	);
}

interface SegmentRendererProps {
	segment: ContentSegment;
}

function SegmentRenderer({ segment }: SegmentRendererProps) {
	switch (segment.type) {
		case "thinking":
			return <ThinkingBlock thinking={segment.thinking} />;
		case "text":
			return <Markdown remarkPlugins={[remarkGfm]}>{segment.text}</Markdown>;
		case "tool_use":
			return (
				<div className="my-2">
					<ToolUsePill tool={segment.tool} />
				</div>
			);
		case "stop_notice":
			return (
				<StopNoticeBanner
					stopReason={segment.stopReason}
					subtype={segment.subtype}
				/>
			);
		default:
			return null;
	}
}

interface ToolUsePillProps {
	tool: ToolUse;
}

function formatToolInput(input: unknown): string {
	if (typeof input === "string") return input;
	return JSON.stringify(input, null, 2);
}

function ToolUsePill({ tool }: ToolUsePillProps) {
	const [expanded, setExpanded] = useState(false);
	const groupCount = (tool as CollapsibleToolUse)._groupCount;
	const baseLabel = getToolLabel(tool.name);
	const label =
		groupCount && groupCount > 1 ? `${baseLabel} (${groupCount})` : baseLabel;
	const summary = getToolSummary(tool.name, tool.input);
	const isRunning = tool.status === "running";
	const Chevron = expanded ? ChevronDown : ChevronRight;

	return (
		<div className="inline-block">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className={cn(
					"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-mono",
					"bg-tool-bg border border-tool-border text-tool-text",
					"transition-colors hover:bg-tool-bg/80 cursor-pointer",
					isRunning && "animate-subtle-pulse",
				)}
			>
				<Chevron className="h-3 w-3 shrink-0" />
				<span>{label}</span>
				{isRunning && (
					<span className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse" />
				)}
			</button>
			{summary && !expanded && (
				<p className="mt-0.5 text-[11px] text-text-tertiary font-mono truncate max-w-xs">
					{summary}
				</p>
			)}
			{expanded && tool.input != null && (
				<pre className="mt-2 rounded-lg border border-border-subtle bg-bg-tertiary/30 p-3 text-xs text-text-secondary font-mono overflow-x-auto max-w-lg whitespace-pre-wrap break-words">
					{formatToolInput(tool.input)}
				</pre>
			)}
		</div>
	);
}

interface ThinkingBlockProps {
	thinking: string;
}

function generateThinkingSummary(thinking: string): string {
	const firstLine = thinking.split("\n")[0].trim();
	return truncate(firstLine);
}

function ThinkingBlock({ thinking }: ThinkingBlockProps) {
	const [expanded, setExpanded] = useState(false);
	const summary = generateThinkingSummary(thinking);
	const Chevron = expanded ? ChevronDown : ChevronRight;

	return (
		<div className="my-2">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className={cn(
					"flex items-center gap-2 rounded-lg px-3 py-2 text-sm w-full text-left",
					"bg-bg-tertiary/50 border border-border-subtle",
					"transition-colors hover:bg-bg-tertiary",
				)}
			>
				<Brain className="h-4 w-4 text-text-muted shrink-0" />
				<span className="text-text-secondary flex-1 truncate">
					{expanded ? "Reasoning" : summary}
				</span>
				<Chevron className="h-4 w-4 text-text-muted shrink-0" />
			</button>
			{expanded && (
				<div className="mt-2 rounded-lg border border-border-subtle bg-bg-tertiary/30 p-3">
					<div className="text-sm text-text-secondary whitespace-pre-wrap font-body leading-relaxed">
						{thinking}
					</div>
				</div>
			)}
		</div>
	);
}
