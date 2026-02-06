import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = GeistSans;
const geistMono = GeistMono;

const instrumentSerif = Instrument_Serif({
	variable: "--font-instrument-serif",
	subsets: ["latin"],
	weight: "400",
	style: ["normal", "italic"],
});

export const metadata: Metadata = {
	title: "Fortuna - AI Sports Betting Analysis",
	description:
		"Get data-driven sports betting insights powered by AI. Analyze odds, matchups, and trends across NBA, NFL, MLB, and more.",
	keywords: [
		"sports betting",
		"AI analysis",
		"odds",
		"NBA",
		"NFL",
		"betting insights",
	],
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased bg-bg-primary text-text-primary`}
			>
				{children}
			</body>
		</html>
	);
}
