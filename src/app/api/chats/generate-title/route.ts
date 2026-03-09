import { badRequest, getAuthenticatedUser, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { generateChatTitle } from "@/lib/title-generator";
import { generateTitleSchema } from "@/lib/validations/chat";

export async function POST(req: Request): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const body = await req.json();
	const parsed = generateTitleSchema.safeParse(body);
	if (!parsed.success) {
		return badRequest("Invalid request", parsed.error.flatten());
	}

	const { message, chatId } = parsed.data;
	const title = await generateChatTitle(message);

	if (title) {
		await prisma.chat
			.update({
				where: { id: chatId, userId: user.id },
				data: { title },
			})
			.catch((err) =>
				console.warn("[title-generation] DB update failed:", err),
			);
	}

	return Response.json({ title });
}
