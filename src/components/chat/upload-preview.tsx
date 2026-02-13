"use client";

import type { LucideIcon } from "lucide-react";
import {
	AlertCircle,
	FileSpreadsheet,
	FileText,
	Loader2,
	X,
} from "lucide-react";
import Image from "next/image";
import type { PendingUpload } from "@/hooks/use-file-upload";
import { cn, formatFileSize } from "@/lib/utils";

interface UploadPreviewProps {
	uploads: PendingUpload[];
	onRemove: (id: string) => void;
}

function getFileIcon(mimeType: string): LucideIcon {
	if (mimeType === "text/csv") return FileSpreadsheet;
	return FileText;
}

interface UploadCardProps {
	upload: PendingUpload;
	onRemove: () => void;
}

function UploadCard({ upload, onRemove }: UploadCardProps) {
	const isImage = upload.previewUrl && upload.status !== "error";
	const isError = upload.status === "error";
	const isUploading = upload.status === "uploading";
	const FileIcon = getFileIcon(upload.mimeType);

	return (
		<div
			className={cn(
				"group relative flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border overflow-hidden",
				isError
					? "border-error/50 bg-error-subtle/30"
					: "border-border-subtle bg-bg-tertiary",
				isUploading && "animate-subtle-pulse",
			)}
		>
			{isImage ? (
				<Image
					unoptimized
					src={upload.previewUrl!}
					alt={upload.filename}
					width={64}
					height={64}
					className="h-full w-full object-cover"
				/>
			) : isError ? (
				<div className="flex flex-col items-center gap-0.5">
					<AlertCircle className="h-4 w-4 text-error" />
					<span className="text-[9px] text-error px-1 text-center leading-tight truncate max-w-[56px]">
						{upload.error}
					</span>
				</div>
			) : (
				<div className="flex flex-col items-center gap-0.5">
					<FileIcon className="h-5 w-5 text-text-tertiary" />
					<span className="text-[9px] text-text-tertiary px-1 truncate max-w-[56px]">
						{formatFileSize(upload.size)}
					</span>
				</div>
			)}

			{isUploading && (
				<div className="absolute inset-0 flex items-center justify-center bg-bg-primary/60">
					<Loader2 className="h-4 w-4 animate-spin text-accent-primary" />
				</div>
			)}

			<button
				type="button"
				onClick={onRemove}
				className={cn(
					"absolute -top-1.5 -right-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full",
					"bg-bg-secondary border border-border-subtle text-text-tertiary",
					"opacity-0 transition-opacity group-hover:opacity-100",
					"hover:bg-bg-tertiary hover:text-text-primary",
				)}
				aria-label={`Remove ${upload.filename}`}
			>
				<X className="h-3 w-3" />
			</button>

			{!isImage && !isError && (
				<span className="absolute bottom-0 left-0 right-0 truncate bg-bg-primary/80 px-1 py-0.5 text-[9px] text-text-secondary text-center">
					{upload.filename}
				</span>
			)}
		</div>
	);
}

export function UploadPreview({ uploads, onRemove }: UploadPreviewProps) {
	if (uploads.length === 0) return null;

	return (
		<div className="flex gap-2 overflow-x-auto pb-1 px-1">
			{uploads.map((upload) => (
				<UploadCard
					key={upload.id}
					upload={upload}
					onRemove={() => onRemove(upload.id)}
				/>
			))}
		</div>
	);
}
