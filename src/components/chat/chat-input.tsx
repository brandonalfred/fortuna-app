"use client";

import { ArrowUp, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ChatInputProps {
	onSend: (message: string) => void;
	onStop: () => void;
	onQueue: (message: string) => void;
	isLoading: boolean;
	disabled?: boolean;
	placeholder?: string;
	variant?: "bottom" | "centered";
}

export function ChatInput({
	onSend,
	onStop,
	onQueue,
	isLoading,
	disabled,
	placeholder = "Ask about odds, matchups, trends...",
	variant = "bottom",
}: ChatInputProps) {
	const [value, setValue] = useState("");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const handleSubmit = useCallback(() => {
		if (!value.trim() || disabled) return;
		if (isLoading) {
			onQueue(value);
		} else {
			onSend(value);
		}
		setValue("");
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [value, disabled, isLoading, onSend, onQueue]);

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

	const inputBox = (
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
				placeholder={placeholder}
				disabled={disabled}
				enterKeyHint="send"
				rows={1}
				className={cn(
					"min-h-[44px] max-h-[200px] resize-none py-3 pr-12",
					"border-0 rounded-none bg-transparent shadow-none",
					"text-text-primary placeholder:text-text-tertiary",
					"focus-visible:ring-0 focus-visible:border-0",
					"font-body",
				)}
			/>
			<Button
				onClick={isLoading ? onStop : handleSubmit}
				disabled={disabled || (!isLoading && !value.trim())}
				size="icon"
				className={cn(
					"absolute right-1.5 bottom-1.5 h-9 w-9 sm:right-2 sm:bottom-2 sm:h-8 sm:w-8 shrink-0",
					"bg-accent-primary hover:bg-accent-hover",
					"text-text-inverse",
					"transition-all duration-200",
					"disabled:opacity-50",
				)}
			>
				{isLoading ? (
					<Square className="h-5 w-5 sm:h-4 sm:w-4" />
				) : (
					<ArrowUp className="h-5 w-5 sm:h-4 sm:w-4" />
				)}
			</Button>
		</div>
	);

	const disclaimer = (
		<p className="mt-2 text-center text-xs text-text-tertiary">
			Fortuna can make mistakes. Verify important information.
		</p>
	);

	if (variant === "centered") {
		return (
			<div className="w-full max-w-2xl">
				{inputBox}
				{disclaimer}
			</div>
		);
	}

	return (
		<div className="border-t border-border-subtle bg-bg-primary p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
			<div className="mx-auto max-w-3xl">
				{inputBox}
				{disclaimer}
			</div>
		</div>
	);
}
