#!/bin/bash
# Fortuna API client — sends a message and outputs parsed JSON result.
# Usage: fortuna_chat.sh <api_key> <message> [chat_id]
# stdout: JSON {text, chatId, toolCalls, subagents, result}
# stderr: human-readable summary
#
# The two-step SSE flow:
#   1. POST /api/chat → returns streamUrl (JSON for warm sandbox, SSE for new)
#   2. GET {streamUrl}/stream → agent events (delta, tool_use, result, done)
#
# For real queries (tool calls, sub-agents), expect 30-120s+ total.
set -euo pipefail

API_KEY="${1:?Usage: fortuna_chat.sh <api_key> <message> [chat_id]}"
MESSAGE="${2:?Usage: fortuna_chat.sh <api_key> <message> [chat_id]}"
CHAT_ID="${3:-}"

BODY=$(python3 -c "
import json, sys
msg = sys.argv[1]
cid = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
print(json.dumps({'message': msg, 'chatId': cid}))
" "$MESSAGE" "${CHAT_ID:-}")

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

STREAM_URL=""
STREAM_TOKEN=""
CHAT_ID_OUT=""

# Step 1: Extract streamUrl from setup (break early via process substitution)
while IFS= read -r line; do
    # JSON response (warm sandbox) — entire response is one line
    if [[ "$line" == \{* ]]; then
        eval "$(echo "$line" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'STREAM_URL=\"{d[\"streamUrl\"]}\"')
print(f'STREAM_TOKEN=\"{d.get(\"streamToken\",\"\")}\"')
print(f'CHAT_ID_OUT=\"{d.get(\"chatId\",\"\")}\"')
")"
        break
    fi
    # SSE: capture chatId
    if [[ "$line" == data:* ]] && [[ "$line" == *'"chatId"'* ]] && [ -z "$CHAT_ID_OUT" ]; then
        CHAT_ID_OUT=$(echo "${line#data: }" | python3 -c "import json,sys; print(json.load(sys.stdin).get('chatId',''))" 2>/dev/null || true)
    fi
    # SSE: capture streamUrl from ready event
    if [[ "$line" == data:* ]] && [[ "$line" == *'"streamUrl"'* ]]; then
        eval "$(echo "${line#data: }" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(f'STREAM_URL=\"{d[\"streamUrl\"]}\"')
print(f'STREAM_TOKEN=\"{d.get(\"streamToken\",\"\")}\"')
cid=d.get('chatId','')
if cid: print(f'CHAT_ID_OUT=\"{cid}\"')
")"
        break
    fi
done < <(curl -s -N -X POST "https://fortunabets.ai/api/chat" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_KEY" \
    --data-raw "$BODY" \
    --max-time 600 2>/dev/null; echo)

if [ -z "$STREAM_URL" ]; then
    echo '{"error":"No streamUrl received","text":"","chatId":""}' >&2
    exit 1
fi

# Step 2: Stream agent events — break on 'done' event
# (Stream endpoint keeps connection alive with keepalive after done, so we must break)
# || true: curl exits 23 (SIGPIPE) when we break the pipe — expected behavior
touch "$TMPDIR/stream.txt"
curl -s -N \
    -H "Authorization: Bearer $STREAM_TOKEN" \
    "$STREAM_URL/stream" \
    --max-time 600 2>/dev/null | {
    while IFS= read -r line; do
        echo "$line" >> "$TMPDIR/stream.txt"
        [[ "$line" == "event: done" ]] && break
    done
} || true

# Step 3: Parse into JSON
python3 << 'PYEOF' - "$TMPDIR/stream.txt" "${CHAT_ID_OUT:-}"
import json, sys

stream_file = sys.argv[1]
chat_id = sys.argv[2] if len(sys.argv) > 2 else ""

text, thinking = "", ""
tool_calls, subagents = [], []
result_meta = {}
evt = ""

try:
    with open(stream_file) as f:
        for line in f:
            line = line.rstrip("\r\n")
            if line.startswith("event: "):
                evt = line[7:]
            elif line.startswith("data: "):
                try: data = json.loads(line[6:])
                except json.JSONDecodeError: continue
                if evt == "delta" and "text" in data: text += data["text"]
                elif evt == "thinking_delta" and "thinking" in data: thinking += data["thinking"]
                elif evt == "thinking" and "thinking" in data: thinking = data["thinking"]
                elif evt == "tool_use": tool_calls.append({"name": data.get("name",""), "input": str(data.get("input",""))[:200]})
                elif evt == "subagent_start": subagents.append(data)
                elif evt == "subagent_complete":
                    for sa in subagents:
                        if sa.get("taskId") == data.get("taskId"): sa.update(data); break
                elif evt == "result": result_meta = data
                elif evt == "error": print(f"Error: {data.get('message', data)}", file=sys.stderr)
except FileNotFoundError:
    pass

out = {"text": text.strip(), "chatId": chat_id, "toolCalls": tool_calls, "subagents": subagents, "result": result_meta}

if tool_calls:
    print(f"\n--- Tool Calls ({len(tool_calls)}) ---", file=sys.stderr)
    for tc in tool_calls: print(f"  {tc['name']}: {tc['input'][:100]}", file=sys.stderr)
if subagents:
    print(f"\n--- Sub-agents ({len(subagents)}) ---", file=sys.stderr)
    for sa in subagents: print(f"  {sa.get('description','?')} — {sa.get('status','started')}", file=sys.stderr)
if result_meta:
    r = result_meta
    print(f"\n--- Result ---", file=sys.stderr)
    print(f"  Duration: {r.get('duration_ms',0)/1000:.1f}s | Cost: ${r.get('cost_usd',0):.4f} | Stop: {r.get('stop_reason','?')}", file=sys.stderr)
if chat_id:
    print(f"  Chat ID: {chat_id}", file=sys.stderr)

print(json.dumps(out))
PYEOF
