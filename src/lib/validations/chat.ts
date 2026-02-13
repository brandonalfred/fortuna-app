import { z } from "zod";

const ALLOWED_MIME_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"application/pdf",
	"text/csv",
	"text/plain",
] as const;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_MESSAGE = 5;

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE, MAX_FILES_PER_MESSAGE };

const ALLOWED_MIME_SET = new Set<string>(ALLOWED_MIME_TYPES);

export function isAllowedMimeType(type: string): boolean {
	return ALLOWED_MIME_SET.has(type);
}

export const attachmentSchema = z.object({
	key: z.string().min(1),
	filename: z.string().min(1).max(255),
	mimeType: z.enum(ALLOWED_MIME_TYPES),
	size: z.number().int().positive().max(MAX_FILE_SIZE),
});

export const sendMessageSchema = z.object({
	message: z.string().min(1).max(10000),
	chatId: z.string().uuid().nullish(),
	sessionId: z.string().nullish(),
	timezone: z.string().min(1).max(100).optional(),
	attachments: z.array(attachmentSchema).max(MAX_FILES_PER_MESSAGE).optional(),
});

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
