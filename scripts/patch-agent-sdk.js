/**
 * Postinstall patch for @anthropic-ai/claude-agent-sdk v0.2.62
 *
 * Fixes SDK issue #89: cache_control is added to every system prompt block
 * instead of just the last one, exceeding the API's 4-block limit and reducing
 * cache efficiency. This patch restricts it to the last eligible block only.
 */

const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const LOG_PREFIX = "[patch-agent-sdk]";

const CLI_PATH = join(
	__dirname,
	"..",
	"node_modules",
	"@anthropic-ai",
	"claude-agent-sdk",
	"cli.js",
);

const BUGGY_PATTERN =
	/\.map\(\(Y\)=>\{return\{type:"text",text:Y\.text,\.\.\.q&&Y\.cacheScope!==null\?\{cache_control:ci6\(\{scope:Y\.cacheScope,querySource:K\?\.querySource\}\)\}:\{\}\}\}\)/;

const PATCHED_CODE =
	'.map((Y,_i,_a)=>{return{type:"text",text:Y.text,...q&&Y.cacheScope!==null&&_i===_a.length-1?{cache_control:ci6({scope:Y.cacheScope,querySource:K?.querySource})}:{}}})';

const ALREADY_PATCHED_MARKER = "_i===_a.length-1";

let source;
try {
	source = readFileSync(CLI_PATH, "utf-8");
} catch (err) {
	console.error(`${LOG_PREFIX} Could not read cli.js: ${err.message}`);
	process.exit(1);
}

if (source.includes(ALREADY_PATCHED_MARKER)) {
	console.log(`${LOG_PREFIX} Already patched — skipping.`);
	process.exit(0);
}

if (!BUGGY_PATTERN.test(source)) {
	console.error(
		`${LOG_PREFIX} Could not find the expected pattern in cli.js. The SDK may have been updated — check if the minified variable names changed.`,
	);
	process.exit(1);
}

const patched = source.replace(BUGGY_PATTERN, PATCHED_CODE);
writeFileSync(CLI_PATH, patched, "utf-8");
console.log(
	`${LOG_PREFIX} Patched cli.js — cache_control now only marks the last system block.`,
);
