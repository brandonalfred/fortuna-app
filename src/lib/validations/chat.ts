import { z } from "zod";

export const ALLOWED_MIME_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"application/pdf",
	"text/csv",
	"text/plain",
] as const;

type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_FILES_PER_MESSAGE = 5;

export const MIME_TO_EXT: Record<AllowedMimeType, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
	"application/pdf": "pdf",
	"text/csv": "csv",
	"text/plain": "txt",
};

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_MIME_TYPES);

export const IMAGE_MIME_TYPES = new Set<string>(
	ALLOWED_MIME_TYPES.filter((t) => t.startsWith("image/")),
);

export const TEXT_MIME_TYPES = new Set<string>(
	ALLOWED_MIME_TYPES.filter((t) => t.startsWith("text/")),
);

export function isAllowedMimeType(type: string): boolean {
	return ALLOWED_MIME_SET.has(type);
}

export const attachmentSchema = z.object({
	key: z.string().min(1),
	filename: z.string().min(1).max(255),
	mimeType: z.enum(ALLOWED_MIME_TYPES),
	size: z.number().int().positive().max(MAX_FILE_SIZE),
});

export const sendMessageSchema = z
	.object({
		message: z.string().max(10000).default(""),
		chatId: z.string().uuid().nullish(),
		sessionId: z.string().nullish(),
		timezone: z.string().min(1).max(100).optional(),
		attachments: z
			.array(attachmentSchema)
			.max(MAX_FILES_PER_MESSAGE)
			.optional(),
	})
	.refine(
		(data) =>
			data.message.trim().length > 0 || (data.attachments?.length ?? 0) > 0,
		{
			message: "Message or attachments required",
		},
	);

export const presignRequestSchema = z.object({
	files: z
		.array(
			z.object({
				filename: z.string().min(1).max(255),
				mimeType: z.enum(ALLOWED_MIME_TYPES),
				size: z.number().int().positive().max(MAX_FILE_SIZE),
			}),
		)
		.min(1)
		.max(MAX_FILES_PER_MESSAGE),
	chatId: z.string().uuid().optional(),
});

export const createChatSchema = z.object({
	title: z.string().min(1).max(200).optional(),
});

export const updateChatSchema = z.object({
	title: z.string().min(1).max(200),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateChatInput = z.infer<typeof createChatSchema>;
export type UpdateChatInput = z.infer<typeof updateChatSchema>;
