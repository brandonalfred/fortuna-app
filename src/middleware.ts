import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
	const sessionCookie = getSessionCookie(request);
	const isAuthPage = request.nextUrl.pathname.startsWith("/auth");

	if (isAuthPage) {
		if (sessionCookie) {
			return NextResponse.redirect(new URL("/new", request.url));
		}
		return NextResponse.next();
	}

	if (!sessionCookie) {
		return NextResponse.redirect(new URL("/auth/signin", request.url));
	}

	if (request.nextUrl.pathname === "/") {
		return NextResponse.redirect(new URL("/new", request.url));
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
