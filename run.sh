#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  for runtime in "$HOME"/.local/share/russmarket-tools/node-*/bin; do
    if [ -x "$runtime/node" ]; then
      PATH="$runtime:$PATH"
      export PATH
      break
    fi
  done
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Для запуска необходим Node.js 24 или новее.' >&2
  exit 1
fi
if [ ! -d node_modules ]; then npm ci; fi
exec npm run dev
