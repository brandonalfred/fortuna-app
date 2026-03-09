import { getAuthenticatedUser, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { generateChatTitle } from "@/lib/title-generator";

export async function POST(req: Request): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const { message, chatId } = (await req.json()) as {
		message: string;
		chatId?: string;
	};
	const title = await generateChatTitle(message);

	if (title && chatId) {
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
