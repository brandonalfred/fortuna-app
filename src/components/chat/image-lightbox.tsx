"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import {
	Dialog,
	DialogClose,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface LightboxImage {
	url: string;
	filename: string;
}

interface ImageLightboxProps {
	images: LightboxImage[];
	initialIndex: number;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({
	images,
	initialIndex,
	open,
	onOpenChange,
}: ImageLightboxProps) {
	const [index, setIndex] = useState(initialIndex);

	useEffect(() => {
		if (open) setIndex(initialIndex);
	}, [open, initialIndex]);

	const hasPrev = index > 0;
	const hasNext = index < images.length - 1;

	const goPrev = useCallback(() => {
		if (hasPrev) setIndex((i) => i - 1);
	}, [hasPrev]);

	const goNext = useCallback(() => {
		if (hasNext) setIndex((i) => i + 1);
	}, [hasNext]);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "ArrowLeft") goPrev();
			if (e.key === "ArrowRight") goNext();
		}
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [open, goPrev, goNext]);

	if (images.length === 0) return null;
	const current = images[index];
	const multi = images.length > 1;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogPortal>
				<DialogOverlay
					className="bg-black/90"
					onClick={() => onOpenChange(false)}
				/>
				<div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
					<DialogTitle className="sr-only">
						{current?.filename ?? "Image preview"}
					</DialogTitle>

					<DialogClose className="pointer-events-auto absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20">
						<X className="h-5 w-5" />
						<span className="sr-only">Close</span>
					</DialogClose>

					{multi && (
						<button
							type="button"
							onClick={goPrev}
							disabled={!hasPrev}
							className={cn(
								"pointer-events-auto absolute left-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors",
								hasPrev
									? "hover:bg-white/20 cursor-pointer"
									: "opacity-30 cursor-default",
							)}
							aria-label="Previous image"
						>
							<ChevronLeft className="h-6 w-6" />
						</button>
					)}

					{current && (
						<div className="pointer-events-auto flex flex-col items-center gap-3">
							<Image
								unoptimized
								src={current.url}
								alt={current.filename}
								width={1200}
								height={900}
								className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
							/>
							<div className="flex items-center gap-3 text-sm text-white/70">
								<span>{current.filename}</span>
								{multi && (
									<span className="text-white/40">
										{index + 1} / {images.length}
									</span>
								)}
							</div>
						</div>
					)}

					{multi && (
						<button
							type="button"
							onClick={goNext}
							disabled={!hasNext}
							className={cn(
								"pointer-events-auto absolute right-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors",
								hasNext
									? "hover:bg-white/20 cursor-pointer"
									: "opacity-30 cursor-default",
							)}
							aria-label="Next image"
						>
							<ChevronRight className="h-6 w-6" />
						</button>
					)}
				</div>
			</DialogPortal>
		</Dialog>
	);
}
