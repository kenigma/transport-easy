#!/bin/bash
# Stop the Next.js dev server running on port 3000

PID=$(lsof -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null)

if [ -z "$PID" ]; then
  echo "No server running on port 3000."
  exit 0
fi

kill "$PID" && echo "Stopped dev server (PID $PID)."
