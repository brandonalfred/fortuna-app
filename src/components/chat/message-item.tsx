"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Message, ToolUse } from "@/lib/types";
import { cn } from "@/lib/utils";

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
				<div className="whitespace-pre-wrap font-body text-sm leading-relaxed">
					{message.content}
					{isStreaming && (
						<span className="ml-0.5 inline-block h-4 w-0.5 animate-blink bg-accent-primary" />
					)}
				</div>
			</div>
		</div>
	);
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
