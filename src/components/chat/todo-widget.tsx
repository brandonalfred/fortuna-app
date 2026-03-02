"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import { memo } from "react";
import type { TodoItem } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TodoWidgetProps {
	todos: TodoItem[];
}

function StatusIcon({ status }: { status: TodoItem["status"] }) {
	switch (status) {
		case "pending":
			return <Circle className="h-3.5 w-3.5 text-text-tertiary shrink-0" />;
		case "in_progress":
			return (
				<Loader2 className="h-3.5 w-3.5 animate-spin text-accent-primary shrink-0" />
			);
		case "completed":
			return <Check className="h-3.5 w-3.5 text-accent-primary shrink-0" />;
	}
}

export const TodoWidget = memo(function TodoWidget({ todos }: TodoWidgetProps) {
	return (
		<div className="animate-todo-in absolute bottom-4 left-4 z-10 w-72 rounded-lg border border-border-subtle bg-bg-secondary shadow-lg">
			<div className="px-3 py-2 border-b border-border-subtle">
				<span className="text-xs font-mono text-text-secondary">Tasks</span>
			</div>
			<ul className="max-h-64 overflow-y-auto p-2 space-y-1">
				{todos.map((todo) => (
					<li
						key={todo.content}
						className="flex items-start gap-2 rounded px-2 py-1.5 text-xs"
					>
						<StatusIcon status={todo.status} />
						<span
							className={cn(
								"font-body leading-snug",
								todo.status === "completed" &&
									"line-through text-text-tertiary",
								todo.status === "in_progress" && "text-text-primary",
								todo.status === "pending" && "text-text-secondary",
							)}
						>
							{todo.status === "in_progress" && todo.activeForm
								? todo.activeForm
								: todo.content}
						</span>
					</li>
				))}
			</ul>
		</div>
	);
});
