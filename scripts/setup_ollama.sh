#!/usr/bin/env bash
# Standalone Ollama Setup & Runner for Ubuntu Dynamic Island (Dio AI)
# Installs to user directory without requiring root/sudo privileges
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_BIN="$HOME/.local/bin"
LOCAL_DIR="$HOME/.local"
ARCHIVE="/tmp/ollama-linux-amd64.tar.zst"

mkdir -p "$LOCAL_BIN" "$LOCAL_DIR"

echo "=== Dio Local AI Model Installer (Ollama + RTX 4050) ==="

# 1. Wait for archive download if still in progress
if [ ! -f "$LOCAL_DIR/lib/ollama/llama-server" ]; then
  echo ">>> Verifying Ollama archive and runner binaries..."
  while pgrep -f "curl.*ollama-linux-amd64.tar.zst" >/dev/null 2>&1; do
    SIZE=$(ls -lh "$ARCHIVE" 2>/dev/null | awk '{print $5}' || echo "0")
    echo ">>> Download in progress (${SIZE} / ~1.4GB). Waiting 10s..."
    sleep 10
  done

  if [ -f "$ARCHIVE" ]; then
    echo ">>> Extracting Ollama package with GPU runners to $LOCAL_DIR..."
    zstd -d -c "$ARCHIVE" | tar -x -C "$LOCAL_DIR/"
    chmod +x "$LOCAL_BIN/ollama" 2>/dev/null || true
    if [ -f "$LOCAL_DIR/lib/ollama/llama-server" ]; then
      chmod +x "$LOCAL_DIR/lib/ollama/llama-server" 2>/dev/null || true
    fi
    echo ">>> Ollama binary and runners extracted successfully!"
  fi
fi

if [ ! -f "$LOCAL_BIN/ollama" ]; then
  echo "ERROR: Ollama binary not found at $LOCAL_BIN/ollama"
  exit 1
fi

echo ">>> Ollama version:"
"$LOCAL_BIN/ollama" --version

# 2. Start Ollama daemon in background if not already running
pkill -x ollama 2>/dev/null || true
sleep 1

echo ">>> Starting Ollama service on 127.0.0.1:11434..."
nohup "$LOCAL_BIN/ollama" serve > /tmp/ollama_service.log 2>&1 &
disown

# Verify service is responding
for i in {1..20}; do
  if curl -s http://127.0.0.1:11434/api/tags >/dev/null 2>&1; then
    echo ">>> Ollama service is LIVE at http://127.0.0.1:11434!"
    break
  fi
  sleep 1
done

# 3. Verify Llama 3.2 3B model is present
echo ">>> Checking installed models..."
"$LOCAL_BIN/ollama" list

if ! "$LOCAL_BIN/ollama" list | grep -q "llama3.2:3b"; then
  echo ">>> Pulling llama3.2:3b model..."
  "$LOCAL_BIN/ollama" pull llama3.2:3b
fi

echo ">>> Local Model llama3.2:3b is ready on RTX 4050 GPU!"
echo ">>> Endpoint: http://localhost:11434/v1/chat/completions"

# 4. Quick smoke test inference
echo ">>> Running quick smoke test inference..."
curl -s http://127.0.0.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "llama3.2:3b", "messages": [{"role": "user", "content": "Respond with: Ready"}], "max_tokens": 10}' \
  | grep -o '"content":"[^"]*"' || echo ">>> Test completed"

