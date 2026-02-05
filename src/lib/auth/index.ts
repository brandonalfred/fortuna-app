import bcrypt from "bcrypt";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import "./types";

export const { handlers, auth, signIn, signOut } = NextAuth({
	...authConfig,
	providers: [
		Credentials({
			name: "credentials",
			credentials: {
				email: { label: "Email", type: "email" },
				password: { label: "Password", type: "password" },
			},
			async authorize(credentials) {
				const email = credentials?.email;
				const password = credentials?.password;

				if (typeof email !== "string" || typeof password !== "string") {
					return null;
				}

				const user = await prisma.user.findUnique({
					where: { email },
				});

				if (!user) {
					return null;
				}

				const passwordMatch = await bcrypt.compare(password, user.passwordHash);

				if (!passwordMatch) {
					return null;
				}

				return {
					id: user.id,
					email: user.email,
					firstName: user.firstName,
					lastName: user.lastName,
				};
			},
		}),
	],
});
