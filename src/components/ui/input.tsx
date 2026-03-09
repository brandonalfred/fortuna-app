import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"placeholder:text-text-tertiary selection:bg-accent-subtle selection:text-text-primary bg-bg-input border-border-subtle h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base text-text-primary shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-text-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
				"focus-visible:border-border-focus focus-visible:ring-accent-primary/20 focus-visible:ring-[2px]",
				"aria-invalid:ring-error/20 aria-invalid:border-error",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
