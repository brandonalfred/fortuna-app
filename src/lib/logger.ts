type LogContext = Record<string, unknown>;

interface Logger {
	debug(message: string, context?: LogContext): void;
	info(message: string, context?: LogContext): void;
	warn(message: string, context?: LogContext): void;
	error(message: string, error?: unknown): void;
}

const isDev = process.env.NODE_ENV !== "production";

function formatContext(context?: LogContext): string {
	if (!context) return "";
	return ` ${JSON.stringify(context)}`;
}

export function createLogger(prefix: string): Logger {
	const tag = `[${prefix}]`;

	return {
		debug(message, context) {
			if (isDev) {
				console.debug(`${tag} ${message}${formatContext(context)}`);
			}
		},
		info(message, context) {
			console.log(`${tag} ${message}${formatContext(context)}`);
		},
		warn(message, context) {
			console.warn(`${tag} ${message}${formatContext(context)}`);
		},
		error(message, error) {
			console.error(`${tag} ${message}`, error ?? "");
		},
	};
}
