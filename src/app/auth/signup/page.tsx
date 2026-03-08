import type { Metadata } from "next";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = {
	title: "Sign Up - Fortuna",
	description:
		"Create a Fortuna account for AI-powered sports betting analysis across NBA, NFL, MLB, NHL, and more.",
};

export default function SignUpPage() {
	return <SignUpForm />;
}
