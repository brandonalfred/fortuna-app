# Fortuna API Skill

Fortuna is an AI-powered sports betting analysis platform. This skill teaches you how to interact with it programmatically via its HTTP API using API key authentication.

**Base URL:** `https://fortunabets.ai`

---

## 1. Authentication Bootstrap (First-Time Setup)

### Path A: Programmatic (via curl)

**Step 1 — Sign in with email/password:**
```bash
curl -s -X POST https://fortunabets.ai/api/auth/sign-in/email \
  -H "Content-Type: application/json" \
  -c /tmp/fortuna-cookies.txt \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD","rememberMe":true}'
```

**Step 2 — Create an API key using session cookies:**
```bash
curl -s -X POST https://fortunabets.ai/api/user/api-keys \
  -H "Content-Type: application/json" \
  -b /tmp/fortuna-cookies.txt \
  -d '{"name":"OpenClaw Agent"}'
```
Returns `{ "key": "ftn_..." }` — store this securely, it is only shown once.

**Step 3 — Store the key and clean up:**
```bash
export FORTUNA_API_KEY="ftn_..."
rm /tmp/fortuna-cookies.txt
```

### Path B: Manual (via web UI)

If Path A fails (e.g., CSRF/origin issues with curl), log into Fortuna's web UI, go to account settings, generate an API key, and configure it as `$FORTUNA_API_KEY`.

---

## 2. Using the API Key

All requests use the `Authorization: Bearer` header. No cookies needed.

```bash
curl https://fortunabets.ai/api/chats \
  -H "Authorization: Bearer $FORTUNA_API_KEY"
```

**Key storage:** Always check `$FORTUNA_API_KEY` env var first.

**Timeout guidance:** Agent responses typically take 2-5 minutes (tool calls, sub-agents, code execution). Set timeouts to at least 600 seconds.

---

## 3. Chat API Reference

### Send a message
```
POST /api/chat
Content-Type: application/json
Authorization: Bearer $FORTUNA_API_KEY

{
  "message": "What are the best NBA bets tonight?",
  "chatId": null,
  "timezone": "America/New_York"
}
```
- `chatId: null` creates a new chat
- `chatId: "<uuid>"` continues an existing chat
- Returns SSE stream (see Section 4)

### List chats
```
GET /api/chats
Authorization: Bearer $FORTUNA_API_KEY
```

### Create a chat
```
POST /api/chats
Content-Type: application/json
Authorization: Bearer $FORTUNA_API_KEY

{ "title": "NBA Analysis" }
```

### Get chat with messages
```
GET /api/chats/:id
Authorization: Bearer $FORTUNA_API_KEY
```

### Update chat title
```
PATCH /api/chats/:id
Content-Type: application/json
Authorization: Bearer $FORTUNA_API_KEY

{ "title": "New Title" }
```

### Delete a chat
```
DELETE /api/chats/:id
Authorization: Bearer $FORTUNA_API_KEY
```

### Stop a running stream
```
POST /api/chats/:id/stop
Authorization: Bearer $FORTUNA_API_KEY
```

---

## 4. Two-Step SSE Flow (Production)

In production, `POST /api/chat` does NOT return agent events directly. It uses a two-step flow:

### Step 1: Setup stream

`POST /api/chat` returns either:

**A) SSE stream** (new sandbox) — `Content-Type: text/event-stream`
Events in order:
- `chat_created` → `{ chatId, sessionId }`
- `status` → `{ stage, message }` (sandbox init progress, may repeat)
- `ready` → `{ chatId, sessionId, streamUrl, streamToken, mode: "direct" }`

**B) JSON response** (existing sandbox) — `Content-Type: application/json`
```json
{ "chatId": "...", "sessionId": "...", "streamUrl": "https://...", "streamToken": "uuid", "mode": "direct" }
```

**Detect which:** Check the `Content-Type` response header.

### Step 2: Connect to streamUrl

```
GET {streamUrl}/stream
Authorization: Bearer {streamToken}
```

This is where the actual agent events stream:

| Event | Payload | Description |
|-------|---------|-------------|
| `delta` | `{ text }` | Text streaming chunk |
| `thinking_delta` | `{ thinking }` | Incremental thinking |
| `thinking` | `{ thinking }` | Complete thinking block |
| `tool_use` | `{ name, input }` | Tool execution |
| `turn_complete` | `{}` | Tool cycle complete |
| `subagent_start` | `{ taskId, description, taskType }` | Sub-agent started |
| `subagent_complete` | `{ taskId, status, summary, usage }` | Sub-agent finished |
| `result` | `{ subtype, stop_reason, duration_ms, cost_usd, session_id }` | Completion metrics |
| `error` | `{ message }` | Error occurred |
| `done` | `{ chatId, sessionId }` | Stream complete |

---

## 5. Ready-Made Python Script

Save this as `fortuna_chat.py` and run with `python3 fortuna_chat.py "your message here"`.

```python
#!/usr/bin/env python3
"""Fortuna API client — sends a chat message and prints the response."""

import http.client
import json
import os
import ssl
import sys
import urllib.parse

API_KEY = os.environ.get("FORTUNA_API_KEY", "")
BASE_HOST = "fortunabets.ai"
TIMEOUT = 600


def post_chat(message, chat_id=None):
    body = json.dumps({"message": message, "chatId": chat_id}).encode()
    ctx = ssl.create_default_context()
    conn = http.client.HTTPSConnection(BASE_HOST, timeout=TIMEOUT, context=ctx)
    conn.request("POST", "/api/chat", body=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    })
    return conn.getresponse()


def read_sse_lines(resp):
    """Read SSE lines byte-by-byte — readline() blocks on chunked transfer encoding."""
    buf = b""
    while True:
        byte = resp.read(1)
        if not byte:
            if buf:
                yield buf.decode("utf-8", errors="replace")
            break
        if byte == b"\n":
            yield buf.decode("utf-8", errors="replace").rstrip("\r")
            buf = b""
        else:
            buf += byte


def extract_stream_info(resp):
    """Parse setup SSE to get streamUrl and streamToken."""
    for line in read_sse_lines(resp):
        if line.startswith("data: "):
            try:
                data = json.loads(line[6:])
            except json.JSONDecodeError:
                continue
            if "streamUrl" in data:
                return data["streamUrl"], data.get("streamToken", "")
    return None, None


def stream_response(stream_url, stream_token):
    """Connect to streamUrl and collect all events."""
    parsed = urllib.parse.urlparse(stream_url)
    ctx = ssl.create_default_context()
    conn = http.client.HTTPSConnection(parsed.hostname, timeout=TIMEOUT, context=ctx)
    conn.request("GET", parsed.path + "/stream", headers={
        "Authorization": f"Bearer {stream_token}",
    })
    resp = conn.getresponse()
    text = ""
    thinking = ""
    tool_calls = []
    subagents = []
    result_meta = {}
    current_event = ""
    for line in read_sse_lines(resp):
        if line.startswith("event: "):
            current_event = line[7:]
            if current_event == "done":
                break
        elif line.startswith("data: "):
            try:
                data = json.loads(line[6:])
            except json.JSONDecodeError:
                continue
            if current_event == "delta" and "text" in data:
                text += data["text"]
            elif current_event == "thinking_delta" and "thinking" in data:
                thinking += data["thinking"]
            elif current_event == "thinking" and "thinking" in data:
                thinking = data["thinking"]
            elif current_event == "tool_use":
                tool_calls.append(data)
            elif current_event == "subagent_start":
                subagents.append(data)
            elif current_event == "subagent_complete":
                for sa in subagents:
                    if sa.get("taskId") == data.get("taskId"):
                        sa.update(data)
                        break
            elif current_event == "result":
                result_meta = data
            elif current_event == "error":
                print(f"Error: {data.get('message', data)}", file=sys.stderr)
        elif line.startswith(":"):
            continue  # keepalive comment
    return {
        "text": text,
        "thinking": thinking,
        "tool_calls": tool_calls,
        "subagents": subagents,
        "result": result_meta,
    }


def main():
    if not API_KEY:
        print("Error: Set $FORTUNA_API_KEY", file=sys.stderr)
        sys.exit(1)

    chat_id = None
    args = sys.argv[1:]

    if "--chat-id" in args:
        idx = args.index("--chat-id")
        if idx + 1 >= len(args):
            print("Error: --chat-id requires a UUID argument", file=sys.stderr)
            sys.exit(1)
        chat_id = args[idx + 1]
        args = args[:idx] + args[idx + 2:]

    message = " ".join(args)
    if not message:
        print("Usage: python3 fortuna_chat.py [--chat-id UUID] <message>", file=sys.stderr)
        sys.exit(1)

    resp = post_chat(message, chat_id)
    content_type = resp.getheader("Content-Type", "")

    if "application/json" in content_type:
        info = json.loads(resp.read().decode())
        stream_url, stream_token = info["streamUrl"], info["streamToken"]
    elif "text/event-stream" in content_type:
        stream_url, stream_token = extract_stream_info(resp)
        resp.close()
    else:
        print(f"Unexpected Content-Type: {content_type}", file=sys.stderr)
        sys.exit(1)

    if not stream_url:
        print("Error: No streamUrl received", file=sys.stderr)
        sys.exit(1)

    response = stream_response(stream_url, stream_token)

    # Print the text response
    print(response["text"])

    # Print metadata to stderr for programmatic use
    if response["tool_calls"]:
        print(f"\n--- Tool Calls ({len(response['tool_calls'])}) ---", file=sys.stderr)
        for tc in response["tool_calls"]:
            print(f"  {tc.get('name', 'unknown')}: {json.dumps(tc.get('input', ''))[:100]}", file=sys.stderr)
    if response["subagents"]:
        print(f"\n--- Sub-agents ({len(response['subagents'])}) ---", file=sys.stderr)
        for sa in response["subagents"]:
            print(f"  {sa.get('description', 'unknown')} — {sa.get('status', 'started')}", file=sys.stderr)
    if response["result"]:
        r = response["result"]
        print(f"\n--- Result ---", file=sys.stderr)
        print(f"  Duration: {r.get('duration_ms', 0)/1000:.1f}s | Cost: ${r.get('cost_usd', 0):.4f} | Stop: {r.get('stop_reason', 'unknown')}", file=sys.stderr)


if __name__ == "__main__":
    main()
```

Uses only Python stdlib — no pip dependencies needed.

---

## 6. Multi-Turn Conversation

```
1. POST /api/chat { message, chatId: null } → new chat, consume SSE
2. Extract chatId from chat_created event (or JSON response)
3. POST /api/chat { message, chatId } → continue same chat
4. Repeat as needed
```

---

## 7. Resuming Existing Chats

```
1. GET /api/chats → find chat by title or recency
2. GET /api/chats/:id → load full history
3. POST /api/chat { message, chatId } → continue
```

---

## 8. Error Handling

| Status | Meaning | Action |
|--------|---------|--------|
| 401 | API key invalid/expired/revoked | Re-bootstrap (Section 1) |
| 400 | Validation error | Check request body format |
| 409 | Chat already processing | Wait or `POST /api/chats/:id/stop` first |
| 500 | Server error | Retry with exponential backoff |

---

## 9. Key Management

**List keys:**
```bash
curl https://fortunabets.ai/api/user/api-keys \
  -H "Authorization: Bearer $FORTUNA_API_KEY"
```

**Revoke a key:**
```bash
curl -X DELETE https://fortunabets.ai/api/user/api-keys/:id \
  -H "Authorization: Bearer $FORTUNA_API_KEY"
```

**Rotate:** Create a new key, update `$FORTUNA_API_KEY`, then revoke the old one.
