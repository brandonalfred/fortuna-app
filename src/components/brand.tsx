import { cn } from "@/lib/utils";

interface BrandLogoProps {
	className?: string;
}

export function AlphaTag() {
	return (
		<span className="text-[10px] text-text-tertiary/60 font-sans">(alpha)</span>
	);
}

export function BrandLogo({ className }: BrandLogoProps) {
	return (
		<span className={cn("font-display text-text-primary", className)}>
			fortuna<span className="text-accent-primary">bets</span>.ai <AlphaTag />
		</span>
	);
}
