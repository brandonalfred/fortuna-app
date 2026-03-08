"use client";

import {
	AlertTriangle,
	Ban,
	Check,
	ChevronDown,
	ChevronRight,
	Clock,
	Info,
	Loader2,
	X,
} from "lucide-react";
import Image from "next/image";
import { memo, type ReactNode, useMemo, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ImageLightbox } from "@/components/chat/image-lightbox";
import { getFileIcon } from "@/components/chat/upload-preview";
import {
	formatToolLabel,
	getToolLabel,
	getToolSummary,
	isInternalTool,
	truncate,
} from "@/lib/tool-labels";
import type {
	Attachment,
	ContentSegment,
	Message,
	SubAgent,
	SubAgentToolCall,
	ToolUse,
} from "@/lib/types";
import { cn, formatFileSize } from "@/lib/utils";
import { IMAGE_MIME_TYPES } from "@/lib/validations/chat";

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

const REMARK_PLUGINS = [remarkGfm];
const HIDDEN_TOOLS = new Set(["TodoWrite", "TodoRead"]);
const COLLAPSIBLE_TOOLS = new Set(["Bash"]);

function collapseToolSegments(segments: ContentSegment[]): ContentSegment[] {
	const result: ContentSegment[] = [];
	for (const seg of segments) {
		if (seg.type === "tool_use" && HIDDEN_TOOLS.has(seg.tool.name)) continue;
		if (seg.type === "tool_use" && COLLAPSIBLE_TOOLS.has(seg.tool.name)) {
			const prev = findLastNonWhitespaceSegment(result);
			if (prev?.type === "tool_use" && prev.tool.name === seg.tool.name) {
				const prevIdx = result.lastIndexOf(prev);
				const updatedTool: CollapsibleToolUse = {
					...prev.tool,
					_groupCount: ((prev.tool as CollapsibleToolUse)._groupCount ?? 1) + 1,
					...(seg.tool.status === "running" && { status: "running" }),
				};
				result[prevIdx] = { type: "tool_use", tool: updatedTool };
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
	"prose prose-invert prose-sm max-w-none font-body leading-relaxed prose-headings:text-text-primary prose-headings:font-heading prose-headings:mt-4 prose-headings:mb-2 prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-strong:text-text-primary prose-code:text-accent-primary prose-code:bg-bg-tertiary prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-bg-tertiary prose-pre:border prose-pre:border-border-subtle prose-pre:overflow-x-auto prose-a:text-accent-primary prose-a:no-underline hover:prose-a:underline";

type AttachmentWithUrl = Attachment & { url: string };

function hasUrl(a: Attachment): a is AttachmentWithUrl {
	return !!a.url;
}

function MessageAttachments({ attachments }: { attachments: Attachment[] }) {
	const [lightboxOpen, setLightboxOpen] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);

	if (attachments.length === 0) return null;

	const withUrls = attachments.filter(hasUrl);
	const images = withUrls.filter((a) => IMAGE_MIME_TYPES.has(a.mimeType));
	const documents = withUrls.filter((a) => !IMAGE_MIME_TYPES.has(a.mimeType));
	const lightboxImages = images.map((a) => ({
		url: a.url,
		filename: a.filename,
	}));

	return (
		<>
			<div className="mb-2 flex flex-wrap gap-2">
				{images.map((att, i) => (
					<button
						key={att.key}
						type="button"
						onClick={() => {
							setSelectedIndex(i);
							setLightboxOpen(true);
						}}
						className="block overflow-hidden rounded-lg border border-border-subtle hover:border-accent-primary/50 transition-colors cursor-pointer"
					>
						<Image
							unoptimized
							src={att.url}
							alt={att.filename}
							width={200}
							height={200}
							className="h-[200px] max-w-[200px] object-cover"
						/>
					</button>
				))}
				{documents.map((att) => {
					const Icon = getFileIcon(att.mimeType);
					return (
						<a
							key={att.key}
							href={att.url}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-2 rounded-lg border border-border-subtle bg-bg-tertiary px-3 py-2 text-xs hover:border-accent-primary/50 transition-colors"
						>
							<Icon className="h-4 w-4 text-text-tertiary shrink-0" />
							<span className="truncate max-w-[150px] text-text-secondary">
								{att.filename}
							</span>
							<span className="text-text-tertiary">
								{formatFileSize(att.size)}
							</span>
						</a>
					);
				})}
			</div>
			{lightboxImages.length > 0 && (
				<ImageLightbox
					images={lightboxImages}
					initialIndex={selectedIndex}
					open={lightboxOpen}
					onOpenChange={setLightboxOpen}
				/>
			)}
		</>
	);
}

interface MessageItemProps {
	message: Message;
	animate?: boolean;
}

function MessageContent({ message }: { message: Message }): ReactNode {
	const collapsed = useMemo(
		() =>
			message.segments && message.segments.length > 0
				? collapseToolSegments(message.segments)
				: null,
		[message.segments],
	);

	if (message.role === "user") {
		return (
			<>
				{message.attachments && message.attachments.length > 0 && (
					<MessageAttachments attachments={message.attachments} />
				)}
				<p>{message.content}</p>
			</>
		);
	}

	if (collapsed) {
		return collapsed.map((segment, idx) => (
			<SegmentRenderer key={getSegmentKey(segment, idx)} segment={segment} />
		));
	}

	return (
		<>
			<Markdown remarkPlugins={REMARK_PLUGINS}>{message.content}</Markdown>
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
					"max-w-[85%] min-w-0 rounded-lg px-4 py-3",
					isUser ? "bg-accent-muted text-text-primary" : "text-text-primary",
				)}
			>
				<div className={PROSE_CLASSES}>
					<MessageContent message={message} />
				</div>
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
	const collapsed = useMemo(() => collapseToolSegments(segments), [segments]);
	const lastSeg = collapsed[collapsed.length - 1];
	const isThinking =
		lastSeg?.type === "thinking" && lastSeg.isComplete === false;

	return (
		<div className="animate-message-in flex w-full justify-start">
			<div className="max-w-[85%] min-w-0 rounded-lg px-4 py-3 text-text-primary">
				<div className={PROSE_CLASSES}>
					{collapsed.map((segment, idx) => (
						<SegmentRenderer
							key={getSegmentKey(segment, idx)}
							segment={segment}
						/>
					))}
					{isStreaming && !isThinking && (
						<LoadingIndicator statusMessage={statusMessage} />
					)}
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
	user_stopped: {
		icon: Ban,
		message: "You stopped the response.",
		variant: "info",
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

function SubAgentStatusIcon({ status }: { status: SubAgent["status"] }) {
	if (status === "running") {
		return (
			<span className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse shrink-0" />
		);
	}
	if (status === "complete") {
		return <Check className="h-3 w-3 text-accent-primary shrink-0" />;
	}
	return <AlertTriangle className="h-3 w-3 text-warning shrink-0" />;
}

const MAX_VISIBLE_TOOLS = 8;

function SubAgentToolLine({ tool }: { tool: SubAgentToolCall }) {
	return (
		<div className="flex items-center gap-1.5 text-[11px] font-mono text-text-tertiary py-0.5">
			{tool.status === "complete" ? (
				<Check className="h-2.5 w-2.5 text-text-tertiary shrink-0" />
			) : (
				<span className="h-2 w-2 rounded-full bg-accent-primary animate-pulse shrink-0" />
			)}
			<span>{formatToolLabel(tool.name, tool.summary)}</span>
		</div>
	);
}

function SubAgentCard({ agent }: { agent: SubAgent }) {
	const [showSummary, setShowSummary] = useState(false);
	const isRunning = agent.status === "running";
	const hasTools = agent.tools.length > 0;
	const visibleTools = agent.tools.slice(0, MAX_VISIBLE_TOOLS);
	const overflowCount = agent.tools.length - MAX_VISIBLE_TOOLS;
	const Chevron = showSummary ? ChevronDown : ChevronRight;

	return (
		<div className="ml-3 my-1 border-l-2 border-border-subtle pl-3">
			<button
				type="button"
				onClick={() =>
					!isRunning && agent.summary && setShowSummary(!showSummary)
				}
				className={cn(
					"flex items-center gap-2 text-xs font-mono transition-colors",
					!isRunning && agent.summary
						? "cursor-pointer hover:text-text-secondary"
						: "cursor-default",
				)}
			>
				<SubAgentStatusIcon status={agent.status} />
				<span className="text-text-muted">{agent.description}</span>
				{!isRunning && agent.summary && (
					<Chevron className="h-3 w-3 text-text-muted shrink-0" />
				)}
			</button>
			{isRunning && agent.currentToolLabel && (
				<p className="mt-0.5 ml-5 text-[11px] text-accent-primary font-mono animate-subtle-pulse truncate">
					{agent.currentToolLabel}
				</p>
			)}
			{hasTools && (
				<div className="mt-0.5 ml-5">
					{visibleTools.map((tool, i) => (
						<SubAgentToolLine key={`${tool.name}-${i}`} tool={tool} />
					))}
					{overflowCount > 0 && (
						<span className="text-[11px] text-text-tertiary font-mono py-0.5">
							+{overflowCount} more
						</span>
					)}
				</div>
			)}
			{showSummary && agent.summary && (
				<p className="mt-1 ml-5 text-xs text-text-secondary whitespace-pre-wrap break-words">
					{truncate(agent.summary, 300)}
				</p>
			)}
		</div>
	);
}

function SubAgentGroup({ agents }: { agents: SubAgent[] }) {
	const allDone = agents.every((a) => a.status !== "running");
	const runningCount = agents.filter((a) => a.status === "running").length;

	return (
		<div className="my-2">
			<div className="flex items-center gap-1.5 text-xs font-mono text-text-muted">
				<span>
					{allDone
						? `Ran ${agents.length} agent${agents.length > 1 ? "s" : ""}`
						: `Running ${runningCount} agent${runningCount > 1 ? "s" : ""}...`}
				</span>
				{!allDone && (
					<Loader2 className="h-3 w-3 animate-spin text-accent-primary" />
				)}
			</div>
			<div className="mt-1">
				{agents.map((agent) => (
					<SubAgentCard key={agent.taskId} agent={agent} />
				))}
			</div>
		</div>
	);
}

interface SegmentRendererProps {
	segment: ContentSegment;
}

const SegmentRenderer = memo(function SegmentRenderer({
	segment,
}: SegmentRendererProps) {
	switch (segment.type) {
		case "thinking":
			if (segment.isComplete === false) {
				return <ThinkingIndicator />;
			}
			return <ThinkingBlock thinking={segment.thinking} />;
		case "text":
			return <Markdown remarkPlugins={REMARK_PLUGINS}>{segment.text}</Markdown>;
		case "tool_use":
			if (HIDDEN_TOOLS.has(segment.tool.name)) return null;
			if (isInternalTool(segment.tool.name)) return null;
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
		case "subagent_group":
			return <SubAgentGroup agents={segment.agents} />;
		default:
			return null;
	}
});

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
	const isInterrupted = tool.status === "interrupted";
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
					isInterrupted && "opacity-60 border-border-subtle",
				)}
			>
				<Chevron className="h-3 w-3 shrink-0" />
				<span>{label}</span>
				{isRunning && (
					<span className="h-1.5 w-1.5 rounded-full bg-accent-primary animate-pulse" />
				)}
				{isInterrupted && (
					<span className="text-text-tertiary text-[10px]">stopped</span>
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
		<div className="my-1">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex items-center gap-2 py-1 text-sm transition-colors hover:text-text-secondary"
			>
				<Chevron className="h-3.5 w-3.5 text-text-muted shrink-0" />
				<span className="text-text-muted truncate">
					{expanded ? "Reasoning" : summary}
				</span>
			</button>
			{expanded && (
				<div className="mt-2 rounded-lg border border-border-subtle bg-bg-tertiary/30 p-3">
					<div className="text-sm text-text-secondary whitespace-pre-wrap break-words font-body leading-relaxed">
						{thinking}
					</div>
				</div>
			)}
		</div>
	);
}

function ThinkingIndicator() {
	return (
		<div className="my-1 flex items-center gap-2 py-1 text-sm">
			<Loader2 className="h-3.5 w-3.5 animate-spin text-accent-primary shrink-0" />
			<span className="text-text-muted animate-thinking-pulse italic">
				Thinking...
			</span>
		</div>
	);
}
