"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Attachment } from "@/lib/types";
import {
	IMAGE_MIME_TYPES,
	isAllowedMimeType,
	MAX_FILE_SIZE,
	MAX_FILES_PER_MESSAGE,
} from "@/lib/validations/chat";

export interface PendingUpload {
	id: string;
	file: File;
	filename: string;
	mimeType: string;
	size: number;
	status: "pending" | "uploading" | "complete" | "error";
	progress: number;
	previewUrl?: string;
	attachment?: Attachment;
	error?: string;
}

export interface UseFileUploadReturn {
	pendingUploads: PendingUpload[];
	addFiles: (files: FileList | File[]) => void;
	removeUpload: (id: string) => void;
	clearUploads: () => void;
	uploadAll: (chatId?: string) => Promise<Attachment[]>;
	isUploading: boolean;
	hasFiles: boolean;
}

export function useFileUpload(): UseFileUploadReturn {
	const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
	const [isUploading, setIsUploading] = useState(false);
	const previewUrlsRef = useRef<string[]>([]);
	const pendingUploadsRef = useRef(pendingUploads);
	pendingUploadsRef.current = pendingUploads;

	useEffect(() => {
		return () => {
			for (const url of previewUrlsRef.current) {
				URL.revokeObjectURL(url);
			}
		};
	}, []);

	const addFiles = useCallback((files: FileList | File[]) => {
		const fileArray = Array.from(files);
		const remaining = MAX_FILES_PER_MESSAGE - pendingUploadsRef.current.length;

		if (remaining <= 0) return;

		const newUploads: PendingUpload[] = fileArray
			.slice(0, remaining)
			.map((file) => {
				const base = {
					id: crypto.randomUUID(),
					file,
					filename: file.name,
					mimeType: file.type,
					size: file.size,
					progress: 0,
				};

				if (!isAllowedMimeType(file.type)) {
					return {
						...base,
						status: "error" as const,
						error: "Unsupported file type",
					};
				}

				if (file.size > MAX_FILE_SIZE) {
					return {
						...base,
						status: "error" as const,
						error: "File too large (max 10MB)",
					};
				}

				let previewUrl: string | undefined;
				if (IMAGE_MIME_TYPES.has(file.type)) {
					previewUrl = URL.createObjectURL(file);
					previewUrlsRef.current.push(previewUrl);
				}

				return { ...base, status: "pending" as const, previewUrl };
			});

		setPendingUploads((prev) => [...prev, ...newUploads]);
	}, []);

	const removeUpload = useCallback((id: string) => {
		setPendingUploads((prev) => {
			const upload = prev.find((u) => u.id === id);
			if (upload?.previewUrl) {
				URL.revokeObjectURL(upload.previewUrl);
				previewUrlsRef.current = previewUrlsRef.current.filter(
					(url) => url !== upload.previewUrl,
				);
			}
			return prev.filter((u) => u.id !== id);
		});
	}, []);

	const clearUploads = useCallback(() => {
		for (const url of previewUrlsRef.current) {
			URL.revokeObjectURL(url);
		}
		previewUrlsRef.current = [];
		setPendingUploads([]);
	}, []);

	const uploadAll = useCallback(
		async (chatId?: string): Promise<Attachment[]> => {
			const valid = pendingUploadsRef.current.filter(
				(u) => u.status === "pending",
			);
			if (valid.length === 0) return [];

			setIsUploading(true);

			try {
				const presignResponse = await fetch("/api/uploads/presign", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						files: valid.map((u) => ({
							filename: u.filename,
							mimeType: u.mimeType,
							size: u.size,
						})),
						chatId,
					}),
				});

				if (!presignResponse.ok) {
					throw new Error("Failed to get upload URLs");
				}

				const { files: presigned } = (await presignResponse.json()) as {
					files: Array<{
						key: string;
						uploadUrl: string;
						downloadUrl: string;
						filename: string;
						mimeType: string;
						size: number;
					}>;
				};

				setPendingUploads((prev) =>
					prev.map((u) =>
						valid.some((v) => v.id === u.id)
							? { ...u, status: "uploading" as const }
							: u,
					),
				);

				const results = await Promise.all(
					valid.map(async (upload, idx) => {
						const presignedFile = presigned[idx];

						const response = await fetch(presignedFile.uploadUrl, {
							method: "PUT",
							headers: { "Content-Type": upload.mimeType },
							body: upload.file,
						});

						if (!response.ok) {
							throw new Error(`Upload failed for ${upload.filename}`);
						}

						const attachment: Attachment = {
							key: presignedFile.key,
							filename: upload.filename,
							mimeType: upload.mimeType,
							size: upload.size,
							url: presignedFile.downloadUrl,
						};

						setPendingUploads((prev) =>
							prev.map((u) =>
								u.id === upload.id
									? {
											...u,
											status: "complete" as const,
											progress: 100,
											attachment,
										}
									: u,
							),
						);

						return attachment;
					}),
				);

				return results;
			} catch (error) {
				setPendingUploads((prev) =>
					prev.map((u) =>
						valid.some((v) => v.id === u.id)
							? {
									...u,
									status: "error" as const,
									error:
										error instanceof Error ? error.message : "Upload failed",
								}
							: u,
					),
				);
				throw error;
			} finally {
				setIsUploading(false);
			}
		},
		[],
	);

	return {
		pendingUploads,
		addFiles,
		removeUpload,
		clearUploads,
		uploadAll,
		isUploading,
		hasFiles: pendingUploads.some((u) => u.status === "pending"),
	};
}
