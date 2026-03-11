#!/usr/bin/env python3
"""Fortuna API client — sends a chat message and prints the response.

Thin wrapper around fortuna_chat.sh which handles the SSE streaming
reliably. This script provides a friendlier CLI and text-only output.
"""

import json
import os
import subprocess
import sys

API_KEY = os.environ.get("FORTUNA_API_KEY", "")
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CHAT_SH = os.path.join(SCRIPT_DIR, "fortuna_chat.sh")


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

    cmd = ["bash", CHAT_SH, API_KEY, message]
    if chat_id:
        cmd.append(chat_id)

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=660)

    if result.returncode != 0:
        print(f"Error (exit {result.returncode}): {result.stderr}", file=sys.stderr)
        sys.exit(result.returncode)

    # Parse JSON from stdout
    try:
        data = json.loads(result.stdout.strip())
    except json.JSONDecodeError:
        print(f"Error: Could not parse response", file=sys.stderr)
        print(result.stdout, file=sys.stderr)
        sys.exit(1)

    # Print text to stdout
    print(data.get("text", ""))

    # Print metadata to stderr
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")

    if data.get("chatId"):
        print(f"\n--- Chat ID: {data['chatId']} ---", file=sys.stderr)


if __name__ == "__main__":
    main()
