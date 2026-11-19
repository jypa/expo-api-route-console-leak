#!/bin/sh
# Usage: ./hammer.sh <route> [count]   e.g. ./hammer.sh leak 200
PORT=${PORT:-8095}
for i in $(seq 1 "${2:-200}"); do curl -s -o /dev/null "http://localhost:$PORT/api/$1"; done
echo "sent ${2:-200} requests to /api/$1"
