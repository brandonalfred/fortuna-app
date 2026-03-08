import type { Metadata } from "next";
import { SignInForm } from "./signin-form";

export const metadata: Metadata = {
	title: "Sign In - Fortuna",
	description:
		"Sign in to Fortuna for AI-powered sports betting analysis across NBA, NFL, MLB, NHL, and more.",
};

export default function SignInPage() {
	return <SignInForm />;
}
