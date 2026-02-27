"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { Dialog } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof Dialog.Root>) {
	return <Dialog.Root {...props} />;
}

function SheetTrigger(props: React.ComponentProps<typeof Dialog.Trigger>) {
	return <Dialog.Trigger {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof Dialog.Close>) {
	return <Dialog.Close {...props} />;
}

function SheetPortal(props: React.ComponentProps<typeof Dialog.Portal>) {
	return <Dialog.Portal {...props} />;
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof Dialog.Overlay>) {
	return (
		<Dialog.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"fixed inset-0 z-50 bg-black/70",
				"data-[state=open]:animate-in data-[state=open]:fade-in-0",
				"data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
				className,
			)}
			{...props}
		/>
	);
}

const sheetContentVariants = cva(
	"fixed z-50 flex flex-col gap-4 bg-bg-secondary shadow-lg transition-transform ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out",
	{
		variants: {
			side: {
				top: "inset-x-0 top-0 border-b border-border-subtle data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
				bottom:
					"inset-x-0 bottom-0 border-t border-border-subtle data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
				left: "inset-y-0 left-0 h-full w-3/4 max-w-sm border-r border-border-subtle data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
				right:
					"inset-y-0 right-0 h-full w-3/4 max-w-sm border-l border-border-subtle data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
			},
		},
		defaultVariants: {
			side: "left",
		},
	},
);

function SheetContent({
	className,
	children,
	side = "left",
	showClose = false,
	...props
}: React.ComponentProps<typeof Dialog.Content> &
	VariantProps<typeof sheetContentVariants> & {
		showClose?: boolean;
	}) {
	return (
		<SheetPortal>
			<SheetOverlay />
			<Dialog.Content
				data-slot="sheet-content"
				className={cn(sheetContentVariants({ side }), className)}
				{...props}
			>
				{children}
				{showClose && (
					<Dialog.Close className="absolute right-4 top-4 rounded-sm text-text-secondary opacity-70 transition-opacity hover:opacity-100 focus:outline-none disabled:pointer-events-none">
						<X className="h-4 w-4" />
						<span className="sr-only">Close</span>
					</Dialog.Close>
				)}
			</Dialog.Content>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn("flex flex-col gap-1.5 p-4", className)}
			{...props}
		/>
	);
}

function SheetTitle({
	className,
	...props
}: React.ComponentProps<typeof Dialog.Title>) {
	return (
		<Dialog.Title
			data-slot="sheet-title"
			className={cn("text-text-primary font-display text-lg", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof Dialog.Description>) {
	return (
		<Dialog.Description
			data-slot="sheet-description"
			className={cn("text-text-secondary text-sm", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetTrigger,
	SheetClose,
	SheetPortal,
	SheetOverlay,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetDescription,
};
