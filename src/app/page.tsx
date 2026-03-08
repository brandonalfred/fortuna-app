import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand";

export const metadata: Metadata = {
	title: "Fortuna - AI-Powered Sports Betting Analysis",
	description:
		"Data-driven sports betting insights powered by AI. Analyze odds, matchups, and trends across NBA, NFL, MLB, NHL, and more.",
	alternates: {
		canonical: "https://fortunabets.ai",
	},
};

const JSON_LD = JSON.stringify([
	{
		"@context": "https://schema.org",
		"@type": "Organization",
		name: "FortunaBets",
		url: "https://fortunabets.ai",
		logo: "https://fortunabets.ai/og-image.png",
		description:
			"AI-powered sports betting analysis platform providing data-driven insights across major sports leagues.",
	},
	{
		"@context": "https://schema.org",
		"@type": "WebApplication",
		name: "Fortuna",
		url: "https://fortunabets.ai",
		applicationCategory: "SportsApplication",
		operatingSystem: "Web",
		description:
			"Analyze odds, matchups, and trends across NBA, NFL, MLB, NHL, and more with AI-powered insights.",
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
	},
]);

function JsonLd() {
	return <script type="application/ld+json">{JSON_LD}</script>;
}

export default function LandingPage() {
	return (
		<>
			<JsonLd />
			<div className="min-h-screen flex flex-col bg-bg-primary">
				<header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto w-full">
					<BrandLogo className="text-xl" />
					<Link
						href="/auth/signin"
						className="text-sm text-text-secondary hover:text-text-primary transition-colors"
					>
						Sign in
					</Link>
				</header>

				<main className="flex-1 flex items-center justify-center px-6">
					<div className="max-w-2xl text-center space-y-8">
						<h1 className="font-display text-5xl sm:text-6xl text-text-primary leading-tight">
							AI-powered sports betting analysis
						</h1>
						<p className="text-lg text-text-secondary max-w-xl mx-auto">
							Analyze odds, matchups, and trends across NBA, NFL, MLB, NHL, and
							more — powered by real-time data and expert AI insights.
						</p>
						<div className="flex items-center justify-center gap-4">
							<Link
								href="/auth/signup"
								className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium bg-accent-primary hover:bg-accent-hover text-text-inverse transition-colors"
							>
								Get started
							</Link>
							<Link
								href="/auth/signin"
								className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-medium border border-border-primary text-text-secondary hover:text-text-primary hover:border-border-hover transition-colors"
							>
								Sign in
							</Link>
						</div>
					</div>
				</main>

				<footer className="px-6 py-6 text-center text-xs text-text-tertiary">
					<p>
						&copy; {new Date().getFullYear()} FortunaBets. All rights reserved.
					</p>
				</footer>
			</div>
		</>
	);
}
