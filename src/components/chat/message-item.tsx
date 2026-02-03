"use client";

import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentSegment, Message, ToolUse } from "@/lib/types";
import { cn } from "@/lib/utils";

const PROSE_CLASSES =
	"prose prose-invert prose-sm max-w-none font-body leading-relaxed prose-headings:text-text-primary prose-headings:font-heading prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-text-primary prose-code:text-accent-primary prose-code:bg-bg-tertiary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border-subtle prose-a:text-accent-primary prose-a:no-underline hover:prose-a:underline";

interface MessageItemProps {
	message: Message;
	isStreaming?: boolean;
}

function getToolUses(toolInput: unknown): ToolUse[] {
	if (!toolInput || !Array.isArray(toolInput)) {
		return [];
	}
	return toolInput as ToolUse[];
}

export function MessageItem({ message, isStreaming }: MessageItemProps) {
	const isUser = message.role === "user";
	const toolUses = getToolUses(message.toolInput);

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
				{toolUses.length > 0 && (
					<div className="mb-2 space-y-1">
						{toolUses.map((tool, idx) => (
							<ToolUsePill key={`${tool.name}-${idx}`} tool={tool} />
						))}
					</div>
				)}
				<div className={PROSE_CLASSES}>
					{isUser ? (
						<p>{message.content}</p>
					) : (
						<Markdown remarkPlugins={[remarkGfm]}>{message.content}</Markdown>
					)}
					{isStreaming && <BlinkingCursor />}
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
					{isStreaming && <BlinkingCursor />}
				</div>
			</div>
		</div>
	);
}

function BlinkingCursor() {
	return (
		<span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-accent-primary" />
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
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="inline-block">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className={cn(
					"inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-mono",
					"bg-tool-bg border border-tool-border text-tool-text",
					"transition-colors hover:bg-bg-tertiary",
					tool.status === "running" && "animate-subtle-pulse",
				)}
			>
				{expanded ? (
					<ChevronDown className="h-3 w-3" />
				) : (
					<ChevronRight className="h-3 w-3" />
				)}
				<span>{tool.name}</span>
				{tool.status === "running" && (
					<span className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse" />
				)}
			</button>
			{expanded && (
				<div className="mt-1 rounded border border-tool-border bg-tool-bg p-2 text-xs font-mono text-text-secondary">
					<pre className="overflow-x-auto">
						{JSON.stringify(tool.input, null, 2)}
					</pre>
				</div>
			)}
		</div>
	);
}

interface ThinkingBlockProps {
	thinking: string;
}

function generateThinkingSummary(thinking: string): string {
	const firstLine = thinking.split("\n")[0].trim();
	return firstLine.length <= 60 ? firstLine : `${firstLine.slice(0, 57)}...`;
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
