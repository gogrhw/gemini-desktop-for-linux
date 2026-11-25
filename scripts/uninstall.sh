#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${GEMINI_HOME:-$HOME/.local/opt/gemini}"
BIN_PATH="${BIN_DIR:-$HOME/.local/bin}/gemini"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_FILE="$APPS_DIR/gemini.desktop"
ICON_FILE="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps/gemini.png"
DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/Gemini"

PURGE_DATA=0

for arg in "$@"; do
  case "$arg" in
    --purge-data)
      PURGE_DATA=1
      ;;
    -h|--help)
      cat <<'EOF'
Usage: ./scripts/uninstall.sh [--purge-data]

Remove the user-level Gemini Desktop installation.
By default, login session and window state in ~/.config/Gemini are preserved.

Options:
  --purge-data    Also remove ~/.config/Gemini (cookies, login state, window state)
  -h, --help      Show this help message
EOF
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

rm -rf "$INSTALL_DIR"
rm -f "$BIN_PATH" "$DESKTOP_FILE" "$ICON_FILE"

if [ "$PURGE_DATA" -eq 1 ]; then
  rm -rf "$DATA_DIR"
  echo "Removed user data directory: $DATA_DIR"
else
  echo "Preserved user data directory: $DATA_DIR (pass --purge-data to delete it)"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
fi

echo "Gemini Desktop uninstalled."
