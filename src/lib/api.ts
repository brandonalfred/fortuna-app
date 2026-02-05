import { headers } from "next/headers";
import { auth, type Session } from "@/lib/auth";

export function unauthorized(): Response {
	return Response.json({ error: "Unauthorized" }, { status: 401 });
}

export function notFound(resource = "Resource"): Response {
	return Response.json({ error: `${resource} not found` }, { status: 404 });
}

export function badRequest(error: string, details?: unknown): Response {
	return Response.json(details ? { error, details } : { error }, {
		status: 400,
	});
}

export function conflict(error: string): Response {
	return Response.json({ error }, { status: 409 });
}

export function serverError(error: unknown): Response {
	const message =
		error instanceof Error ? error.message : "Internal server error";
	return Response.json({ error: message }, { status: 500 });
}

export async function getAuthenticatedUser(): Promise<Session["user"] | null> {
	const session = await auth.api.getSession({
		headers: await headers(),
	});
	if (!session?.user?.id) {
		return null;
	}
	return session.user;
}
