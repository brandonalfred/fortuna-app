import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth";

export default async function SignInPage(props: {
	searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
	const searchParams = await props.searchParams;
	const error = searchParams.error;
	const callbackUrl = searchParams.callbackUrl || "/";

	async function handleSignIn(formData: FormData) {
		"use server";

		const email = formData.get("email") as string;
		const password = formData.get("password") as string;

		try {
			await signIn("credentials", {
				email,
				password,
				redirectTo: callbackUrl,
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
				throw error;
			}
			redirect("/auth/signin?error=CredentialsSignin");
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-bg-primary px-4">
			<div className="w-full max-w-sm space-y-8">
				<div className="text-center">
					<h1 className="font-display text-3xl text-text-primary">
						Welcome back
					</h1>
					<p className="mt-2 text-text-secondary">
						Sign in to continue to FortunaBets
					</p>
				</div>

				{error && (
					<div className="rounded-md bg-error-subtle border border-error/30 px-4 py-3 text-sm text-error">
						Invalid email or password. Please try again.
					</div>
				)}

				<form action={handleSignIn} className="space-y-4">
					<div className="space-y-2">
						<label htmlFor="email" className="text-sm text-text-secondary">
							Email
						</label>
						<Input
							id="email"
							name="email"
							type="email"
							autoComplete="email"
							required
							placeholder="you@example.com"
						/>
					</div>

					<div className="space-y-2">
						<label htmlFor="password" className="text-sm text-text-secondary">
							Password
						</label>
						<Input
							id="password"
							name="password"
							type="password"
							autoComplete="current-password"
							required
							placeholder="Enter your password"
						/>
					</div>

					<Button
						type="submit"
						className="w-full bg-accent-primary hover:bg-accent-hover text-text-inverse"
					>
						Sign in
					</Button>
				</form>

				<p className="text-center text-sm text-text-secondary">
					Don&apos;t have an account?{" "}
					<Link
						href="/auth/signup"
						className="text-accent-primary hover:text-accent-hover transition-colors"
					>
						Sign up
					</Link>
				</p>
			</div>
		</div>
	);
}
