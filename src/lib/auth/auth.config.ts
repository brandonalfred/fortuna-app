import type { NextAuthConfig } from "next-auth";

export const authConfig = {
	session: { strategy: "jwt" },
	pages: {
		signIn: "/auth/signin",
	},
	providers: [],
	callbacks: {
		jwt({ token, user }) {
			if (user) {
				token.id = user.id;
				token.firstName = user.firstName;
				token.lastName = user.lastName;
			}
			return token;
		},
		session({ session, token }) {
			session.user.id = token.id as string;
			session.user.firstName = token.firstName as string;
			session.user.lastName = token.lastName as string;
			return session;
		},
	},
} satisfies NextAuthConfig;
