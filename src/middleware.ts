import { NextResponse } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
	const { nextUrl } = req;
	const isLoggedIn = !!req.auth;
	const isAuthPage = nextUrl.pathname.startsWith("/auth");

	if (isAuthPage) {
		if (isLoggedIn) {
			return NextResponse.redirect(new URL("/", nextUrl));
		}
		return NextResponse.next();
	}

	if (!isLoggedIn) {
		return NextResponse.redirect(new URL("/auth/signin", nextUrl));
	}

	return NextResponse.next();
});

export const config = {
	matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
