"use client";

import { ArrowUp, Paperclip, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { UploadPreview } from "@/components/chat/upload-preview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useFileUpload } from "@/hooks/use-file-upload";
import type { Attachment } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ALLOWED_MIME_TYPES } from "@/lib/validations/chat";

interface ChatInputProps {
	onSend: (message: string, attachments?: Attachment[]) => void;
	onStop: () => void;
	onQueue: (message: string, attachments?: Attachment[]) => void;
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
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const {
		pendingUploads,
		addFiles,
		removeUpload,
		clearUploads,
		uploadAll,
		isUploading,
		hasFiles,
	} = useFileUpload();

	const handleSubmit = useCallback(async () => {
		if ((!value.trim() && !hasFiles) || disabled || isUploading) return;

		let attachments: Attachment[] | undefined;
		if (hasFiles) {
			try {
				attachments = await uploadAll();
			} catch {
				return;
			}
		}

		const text = value.trim();
		if (!text && !attachments?.length) return;

		if (isLoading) {
			onQueue(text, attachments);
		} else {
			onSend(text, attachments);
		}

		setValue("");
		clearUploads();
		if (textareaRef.current) {
			textareaRef.current.style.height = "auto";
		}
	}, [
		value,
		disabled,
		isLoading,
		isUploading,
		hasFiles,
		onSend,
		onQueue,
		uploadAll,
		clearUploads,
	]);

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

	const handlePaste = useCallback(
		(e: React.ClipboardEvent<HTMLTextAreaElement>) => {
			const files = e.clipboardData.files;
			if (files.length > 0) {
				e.preventDefault();
				addFiles(files);
			}
		},
		[addFiles],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			if (!isDragOver) setIsDragOver(true);
		},
		[isDragOver],
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			if (e.dataTransfer.files.length > 0) {
				addFiles(e.dataTransfer.files);
			}
		},
		[addFiles],
	);

	const handleFileInputChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files && e.target.files.length > 0) {
				addFiles(e.target.files);
				e.target.value = "";
			}
		},
		[addFiles],
	);

	const inputBox = (
		// biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target wrapping interactive textarea
		<div
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={handleDrop}
			className={cn(
				"relative flex flex-col overflow-hidden rounded-lg",
				"border bg-bg-input",
				isDragOver
					? "border-accent-primary ring-1 ring-accent-primary"
					: "border-border-default",
				"focus-within:border-border-focus focus-within:ring-1 focus-within:ring-border-focus",
			)}
		>
			{pendingUploads.length > 0 && (
				<div className="px-3 pt-3">
					<UploadPreview uploads={pendingUploads} onRemove={removeUpload} />
				</div>
			)}

			<div className="relative flex items-end gap-2">
				<input
					ref={fileInputRef}
					type="file"
					multiple
					accept={ALLOWED_MIME_TYPES.join(",")}
					onChange={handleFileInputChange}
					className="hidden"
				/>

				<button
					type="button"
					onClick={() => fileInputRef.current?.click()}
					disabled={disabled}
					className={cn(
						"absolute left-2.5 bottom-2.5 flex h-7 w-7 items-center justify-center rounded-md",
						"text-text-tertiary hover:text-text-secondary hover:bg-bg-tertiary",
						"transition-colors",
						"disabled:opacity-50",
					)}
					aria-label="Attach files"
				>
					<Paperclip className="h-4 w-4" />
				</button>

				<Textarea
					ref={textareaRef}
					value={value}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					onPaste={handlePaste}
					placeholder={placeholder}
					disabled={disabled}
					enterKeyHint="send"
					rows={1}
					className={cn(
						"min-h-[44px] max-h-[200px] resize-none py-3 pl-10 pr-12",
						"border-0 rounded-none bg-transparent shadow-none",
						"text-text-primary placeholder:text-text-tertiary",
						"focus-visible:ring-0 focus-visible:border-0",
						"font-body",
					)}
				/>
				<Button
					onClick={isLoading ? onStop : handleSubmit}
					disabled={
						disabled ||
						isUploading ||
						(!isLoading && !value.trim() && !hasFiles)
					}
					size="icon"
					className={cn(
						"absolute right-2.5 bottom-2.5 h-7 w-7 shrink-0",
						"bg-accent-primary hover:bg-accent-hover",
						"text-text-inverse",
						"transition-all duration-200",
						"disabled:opacity-50",
					)}
				>
					{isLoading ? (
						<Square className="h-3.5 w-3.5" />
					) : (
						<ArrowUp className="h-3.5 w-3.5" />
					)}
				</Button>
			</div>
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
