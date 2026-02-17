import { getAuthenticatedUser, notFound, unauthorized } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
	_req: Request,
	{ params }: RouteParams,
): Promise<Response> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return unauthorized();
	}

	const { id } = await params;

	const chat = await prisma.chat.findUnique({
		where: { id, userId: user.id },
	});

	if (!chat) {
		return notFound("Chat");
	}

	await prisma.chat.update({
		where: { id },
		data: { isProcessing: false },
	});

	return new Response(null, { status: 204 });
}
