import {
	getAuthenticatedUser,
	notFound,
	serverError,
	unauthorized,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(
	_req: Request,
	{ params }: RouteParams,
): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) return unauthorized();

		const { id } = await params;

		const { count } = await prisma.apiKey.updateMany({
			where: { id, userId: user.id, revokedAt: null },
			data: { revokedAt: new Date() },
		});

		if (count === 0) {
			const exists = await prisma.apiKey.findFirst({
				where: { id, userId: user.id },
			});
			if (!exists) return notFound("API key");
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		console.error("[API Keys] Revoke error:", error);
		return serverError(error);
	}
}
