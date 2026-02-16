import { randomUUID } from "node:crypto";
import {
	badRequest,
	getAuthenticatedUser,
	serverError,
	unauthorized,
} from "@/lib/api";
import { createPresignedDownloadUrl, createPresignedUploadUrl } from "@/lib/r2";
import { MIME_TO_EXT, presignRequestSchema } from "@/lib/validations/chat";

export async function POST(req: Request): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const body = await req.json();
	const parsed = presignRequestSchema.safeParse(body);

	if (!parsed.success) {
		return badRequest("Invalid request", parsed.error.flatten());
	}

	const { files, chatId } = parsed.data;

	try {
		const results = await Promise.all(
			files.map(async (file) => {
				const ext = MIME_TO_EXT[file.mimeType] || "bin";
				const key = chatId
					? `uploads/${user.id}/${chatId}/${randomUUID()}.${ext}`
					: `uploads/${user.id}/${randomUUID()}.${ext}`;

				const [uploadUrl, downloadUrl] = await Promise.all([
					createPresignedUploadUrl(key, file.mimeType, file.size),
					createPresignedDownloadUrl(key),
				]);

				return {
					key,
					uploadUrl,
					downloadUrl,
					filename: file.filename,
					mimeType: file.mimeType,
					size: file.size,
				};
			}),
		);

		return Response.json({ files: results });
	} catch (error) {
		console.error("[Presign] Failed to generate upload URLs:", error);
		return serverError(error);
	}
}
