import {
	badRequest,
	getAuthenticatedUser,
	serverError,
	unauthorized,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { updatePreferencesSchema } from "@/lib/validations/user";

export async function PATCH(req: Request): Promise<Response> {
	try {
		const user = await getAuthenticatedUser();
		if (!user) {
			return unauthorized();
		}

		const body = await req.json();
		const parsed = updatePreferencesSchema.safeParse(body);

		if (!parsed.success) {
			return badRequest("Invalid request", parsed.error.flatten());
		}

		const preferences = parsed.data.preferences || null;

		await prisma.user.update({
			where: { id: user.id },
			data: { preferences },
		});

		return Response.json({ preferences });
	} catch (error) {
		console.error("[Preferences API] Error:", error);
		return serverError(error);
	}
}
