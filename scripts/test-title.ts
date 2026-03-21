import { config } from "dotenv";
config({ path: ".env.local" });

import { generateChatTitle } from "../src/lib/title-generator";

const message = process.argv[2] || "What are the best NBA player props for tonight?";

console.log(`Testing title generation for: "${message}"`);
const start = Date.now();

const title = await generateChatTitle(message);
const elapsed = Date.now() - start;

if (title) {
	console.log(`SUCCESS (${elapsed}ms): "${title}"`);
} else {
	console.error(`FAILED (${elapsed}ms): returned null`);
	process.exit(1);
}
