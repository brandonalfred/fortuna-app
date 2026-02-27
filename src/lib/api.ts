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

export function forbidden(): Response {
	return Response.json({ error: "Forbidden" }, { status: 403 });
}

export function serverError(error: unknown): Response {
	const message =
		error instanceof Error ? error.message : "Internal server error";
	return Response.json({ error: message }, { status: 500 });
}

export async function getAuthenticatedUser(): Promise<Session["user"] | null> {
	try {
		const session = await auth.api.getSession({
			headers: await headers(),
		});
		if (!session?.user?.id) {
			return null;
		}
		return session.user;
	} catch (error) {
		console.error(
			"[Auth] Failed to get session:",
			error instanceof Error ? error.message : error,
		);
		return null;
	}
}

export type AdminCheckResult =
	| { status: "ok"; user: Session["user"] }
	| { status: "unauthenticated" }
	| { status: "forbidden" };

export async function getAdminUser(): Promise<AdminCheckResult> {
	const user = await getAuthenticatedUser();
	if (!user) {
		return { status: "unauthenticated" };
	}
	if (user.role !== "admin") {
		return { status: "forbidden" };
	}
	return { status: "ok", user };
}
