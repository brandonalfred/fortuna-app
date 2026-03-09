import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"border-border-subtle placeholder:text-text-tertiary focus-visible:border-border-focus focus-visible:ring-accent-primary/20 aria-invalid:ring-error/20 aria-invalid:border-error bg-bg-input flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base text-text-primary shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[2px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
