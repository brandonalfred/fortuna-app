import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrumentSerif = Instrument_Serif({
	variable: "--font-instrument-serif",
	subsets: ["latin"],
	weight: "400",
	style: ["normal", "italic"],
});

export const viewport: Viewport = {
	viewportFit: "cover",
};

export const metadata: Metadata = {
	title: "Fortuna - AI Sports Betting Analysis",
	description:
		"Data-driven sports betting insights powered by AI. Analyze odds, matchups, and trends across NBA, NFL, MLB, NHL, and more.",
	keywords: [
		"sports betting",
		"AI analysis",
		"odds",
		"NBA",
		"NFL",
		"MLB",
		"NHL",
		"sports analytics",
		"betting insights",
	],
	openGraph: {
		type: "website",
		siteName: "FortunaBets",
		url: "https://fortunabets.ai",
		images: [
			{
				url: "/og-image.png",
				width: 1200,
				height: 630,
				alt: "Fortuna - AI-Powered Sports Betting Analysis",
			},
		],
	},
	twitter: {
		card: "summary_large_image",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<body
				className={`${GeistSans.variable} ${GeistMono.variable} ${instrumentSerif.variable} antialiased bg-bg-primary text-text-primary`}
			>
				{children}
			</body>
		</html>
	);
}
