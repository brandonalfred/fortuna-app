"use client";

import { ArrowUp, Square, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
	onSend: (message: string) => void;
	onStop: () => void;
	onQueue: (message: string) => void;
	onClearQueue: () => void;
	isLoading: boolean;
	queuedMessage: string | null;
	disabled?: boolean;
}

export function ChatInput({
	onSend,
	onStop,
	onQueue,
	onClearQueue,
	isLoading,
	queuedMessage,
	disabled,
}: ChatInputProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSubmit = useCallback(() => {
		if (!value.trim() || disabled) return;
		if (isLoading) {
			// Queue the message to send after current response completes
			onQueue(value);
		} else {
			onSend(value);
		}
		setValue("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [value, disabled, isLoading, onSend, onQueue]);

	const handleClearQueue = useCallback(() => {
		onClearQueue();
	}, [onClearQueue]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	const handleInput = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setValue(e.target.value);
			const textarea = e.target;
			textarea.style.height = "auto";
			textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
		},
		[],
	);

	return (
		<div className="border-t border-border-subtle bg-bg-primary p-4">
			<div className="mx-auto max-w-3xl">
				{queuedMessage && (
					<div className="mb-2 flex items-center gap-2 rounded-md bg-accent-primary/10 border border-accent-primary/30 px-3 py-2 text-sm text-text-secondary">
						<span className="flex-1 truncate">
							<span className="text-accent-primary font-medium">Queued:</span>{" "}
							{queuedMessage}
						</span>
						<button
							type="button"
							onClick={handleClearQueue}
							className="shrink-0 rounded p-1 hover:bg-accent-primary/20 transition-colors"
							aria-label="Clear queued message"
						>
							<X className="h-4 w-4 text-text-tertiary" />
						</button>
					</div>
				)}
				<div
					className={cn(
						"relative flex items-end gap-2 overflow-hidden rounded-lg",
						"border border-border-default bg-bg-input",
						"focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus",
					)}
				>
					<Textarea
						ref={textareaRef}
						value={value}
						onChange={handleInput}
						onKeyDown={handleKeyDown}
						placeholder="Ask about odds, matchups, trends..."
						disabled={disabled}
						rows={1}
						className={cn(
							"min-h-[44px] max-h-[200px] resize-none pr-12",
							"border-0 rounded-none bg-transparent shadow-none",
							"text-text-primary placeholder:text-text-tertiary",
							"focus-visible:ring-0 focus-visible:border-0",
							"font-body text-sm",
						)}
					/>
					<Button
						onClick={isLoading ? onStop : handleSubmit}
						disabled={disabled || (!isLoading && !value.trim())}
						size="icon"
						className={cn(
							"absolute right-2 bottom-2 h-8 w-8 shrink-0",
							"bg-accent-primary hover:bg-accent-hover",
							"text-text-inverse",
							"transition-all duration-200",
							"disabled:opacity-50",
						)}
					>
						{isLoading ? (
							<Square className="h-4 w-4" />
						) : (
							<ArrowUp className="h-4 w-4" />
						)}
					</Button>
				</div>
				<p className="mt-2 text-center text-xs text-text-tertiary">
					Fortuna can make mistakes. Verify important information.
				</p>
			</div>
		</div>
	);
}
