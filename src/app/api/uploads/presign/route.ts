import { randomUUID } from "node:crypto";
import { badRequest, getAuthenticatedUser, unauthorized } from "@/lib/api";
import { createPresignedUploadUrl } from "@/lib/r2";
import { presignRequestSchema } from "@/lib/validations/chat";

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

	const results = await Promise.all(
		files.map(async (file) => {
			const mimeToExt: Record<string, string> = {
				"image/png": "png",
				"image/jpeg": "jpg",
				"image/webp": "webp",
				"image/gif": "gif",
				"application/pdf": "pdf",
				"text/csv": "csv",
				"text/plain": "txt",
			};
			const ext = mimeToExt[file.mimeType] || "bin";
			const key = chatId
				? `uploads/${user.id}/${chatId}/${randomUUID()}.${ext}`
				: `uploads/${user.id}/${randomUUID()}.${ext}`;

			const uploadUrl = await createPresignedUploadUrl(key, file.mimeType);

			return {
				key,
				uploadUrl,
				filename: file.filename,
				mimeType: file.mimeType,
				size: file.size,
			};
		}),
	);

	return Response.json({ files: results });
}
