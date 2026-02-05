"use client";

import {
	Brain,
	ChevronDown,
	ChevronRight,
	Clock,
	Loader2,
	X,
} from "lucide-react";
import { useState } from "react";
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
		case "Bash": {
			const cmd = obj.command as string | undefined;
			return cmd ? truncate(cmd) : null;
		}
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

const PROSE_CLASSES =
	"prose prose-invert prose-sm max-w-none font-body leading-relaxed prose-headings:text-text-primary prose-headings:font-heading prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-text-primary prose-code:text-accent-primary prose-code:bg-bg-tertiary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border-subtle prose-a:text-accent-primary prose-a:no-underline hover:prose-a:underline";

interface MessageItemProps {
	message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
	const isUser = message.role === "user";
	const hasSegments = message.segments && message.segments.length > 0;

	return (
		<div
			className={cn(
				"animate-message-in flex w-full",
				isUser ? "justify-end" : "justify-start",
			)}
		>
			<div
				className={cn(
					"max-w-[85%] rounded-lg px-4 py-3",
					isUser ? "bg-accent-muted text-text-primary" : "text-text-primary",
				)}
			>
				<div className={PROSE_CLASSES}>
					{isUser ? (
						<p>{message.content}</p>
					) : hasSegments ? (
						message.segments!.map((segment, idx) => (
							<SegmentRenderer
								key={getSegmentKey(segment, idx)}
								segment={segment}
							/>
						))
					) : (
						<Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
					)}
				</div>
			</div>
		</div>
	);
}

interface StreamingMessageItemProps {
	segments: ContentSegment[];
	isStreaming?: boolean;
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
}: StreamingMessageItemProps) {
	return (
		<div className="animate-message-in flex w-full justify-start">
			<div className="max-w-[85%] rounded-lg px-4 py-3 text-text-primary">
				<div className={PROSE_CLASSES}>
					{segments.map((segment, idx) => (
						<SegmentRenderer
							key={getSegmentKey(segment, idx)}
							segment={segment}
						/>
					))}
					{isStreaming && <LoadingIndicator />}
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

function LoadingIndicator() {
	return (
		<span className="ml-1 inline-flex items-center">
			<Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
		</span>
	);
}

interface SegmentRendererProps {
	segment: ContentSegment;
}

function SegmentRenderer({ segment }: SegmentRendererProps) {
	switch (segment.type) {
		case "thinking":
			return (
				<div className="my-2">
					<ThinkingBlock thinking={segment.thinking} />
				</div>
			);
		case "text":
			return <Markdown remarkPlugins={[remarkGfm]}>{segment.text}</Markdown>;
		case "tool_use":
			return (
				<div className="my-2">
					<ToolUsePill tool={segment.tool} />
				</div>
			);
		default:
			return null;
	}
}

interface ToolUsePillProps {
	tool: ToolUse;
}

function ToolUsePill({ tool }: ToolUsePillProps) {
	const label = getToolLabel(tool.name);
	const summary = getToolSummary(tool.name, tool.input);

	return (
		<div className="inline-block">
			<div
				className={cn(
					"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-mono",
					"bg-tool-bg border border-tool-border text-tool-text",
					tool.status === "running" && "animate-subtle-pulse",
				)}
			>
				<span>{label}</span>
				{tool.status === "running" && (
					<span className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse" />
				)}
			</div>
			{summary && (
				<p className="mt-0.5 text-[11px] text-text-tertiary font-mono truncate max-w-xs">
					{summary}
				</p>
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
				{expanded ? (
					<ChevronDown className="h-4 w-4 text-text-muted shrink-0" />
				) : (
					<ChevronRight className="h-4 w-4 text-text-muted shrink-0" />
				)}
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
