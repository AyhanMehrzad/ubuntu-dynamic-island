#!/usr/bin/env bash
# Ubuntu Dynamic Island Launcher
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"

echo "✨ Starting Ubuntu Dynamic Island (Dio AI)..."
# Permanently suppress native GNOME notification banners so Dio exclusively presents alerts
gsettings set org.gnome.desktop.notifications show-banners false 2>/dev/null || true
exec ./node_modules/.bin/electron . --no-sandbox "$@"
