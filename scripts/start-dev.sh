#!/bin/bash
# Start the Next.js dev server on port 3000
set -e

cd "$(dirname "$0")/.."

if lsof -iTCP:3000 -sTCP:LISTEN -t &>/dev/null; then
  echo "Port 3000 is already in use. Run stop-dev.sh first."
  exit 1
fi

echo "Starting dev server at http://localhost:3000 ..."
npm run dev
