#!/usr/bin/env bash
# Ubuntu Dynamic Island Launcher
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "✨ Starting Ubuntu Dynamic Island (Dio AI)..."
# Permanently suppress native GNOME notification banners so Dio exclusively presents alerts
gsettings set org.gnome.desktop.notifications show-banners false 2>/dev/null || true

# Auto-start local Ollama AI engine if installed and not already running
if [ -f "$HOME/.local/bin/ollama" ] && ! curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
  echo "🚀 Launching local Ollama AI daemon (RTX 4050 GPU accelerated)..."
  nohup "$HOME/.local/bin/ollama" serve > /tmp/ollama_service.log 2>&1 &
fi

exec ./node_modules/.bin/electron . --no-sandbox "$@"
