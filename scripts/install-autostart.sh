#!/usr/bin/env bash
# Ubuntu Autostart Installer for Dynamic Island
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AUTOSTART_DIR="$HOME/.config/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/ubuntu-dynamic-island.desktop"

mkdir -p "$AUTOSTART_DIR"

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Type=Application
Exec=$DIR/scripts/launch.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=Ubuntu Dynamic Island
Comment=Apple-Style Dynamic Island with Dio AI Agent
Icon=/opt/lampp/htdocs/dynamic_islan/assets/icon.png
Categories=Utility;
EOF

chmod +x "$DESKTOP_FILE"
echo "✓ Dynamic Island autostart successfully configured at: $DESKTOP_FILE"
