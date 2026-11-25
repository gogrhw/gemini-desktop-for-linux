#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ELECTRON_VERSION="${ELECTRON_VERSION:-45.4.1}"
INSTALL_DIR="${GEMINI_HOME:-$HOME/.local/opt/gemini}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
APPS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICON_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"

ELECTRON_ZIP=""
UPDATE_RUNTIME=0
APP_ONLY=0

usage() {
  cat <<'EOF'
Usage: ./scripts/install.sh [OPTIONS]

Install Gemini Desktop for Linux into your user directory (~/.local).

Options:
  --electron-version VER   Electron version to download (default: 45.4.1)
  --electron-zip PATH      Use a local Electron Linux zip archive (offline install)
  --update-runtime         Re-download/replace the Electron runtime even if present
  --app-only               Only update app source, launcher, icon, and .desktop entry
  -h, --help               Show this help message
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --electron-version)
      ELECTRON_VERSION="${2:?--electron-version requires a version}"
      shift 2
      ;;
    --electron-zip)
      ELECTRON_ZIP="${2:?--electron-zip requires a file path}"
      shift 2
      ;;
    --update-runtime)
      UPDATE_RUNTIME=1
      shift
      ;;
    --app-only)
      APP_ONLY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l) echo "armv7l" ;;
    *)
      echo "Unsupported CPU architecture: $(uname -m)" >&2
      exit 1
      ;;
  esac
}

install_runtime() {
  local arch zip_path tmp_dir url
  arch="$(detect_arch)"
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "$tmp_dir"' RETURN

  if [ -n "$ELECTRON_ZIP" ]; then
    if [ ! -f "$ELECTRON_ZIP" ]; then
      echo "Error: Electron archive not found: $ELECTRON_ZIP" >&2
      exit 1
    fi
    zip_path="$ELECTRON_ZIP"
  else
    zip_path="$tmp_dir/electron-v${ELECTRON_VERSION}-linux-${arch}.zip"
    url="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-linux-${arch}.zip"
    echo "Downloading Electron v${ELECTRON_VERSION} (linux-${arch})..."
    if command -v curl >/dev/null 2>&1; then
      curl -fL --progress-bar "$url" -o "$zip_path"
    elif command -v wget >/dev/null 2>&1; then
      wget -O "$zip_path" "$url"
    else
      echo "Error: curl or wget is required to download Electron." >&2
      exit 1
    fi
  fi

  if ! command -v unzip >/dev/null 2>&1; then
    echo "Error: unzip is required to extract Electron." >&2
    exit 1
  fi

  mkdir -p "$tmp_dir/runtime"
  unzip -q "$zip_path" -d "$tmp_dir/runtime"

  if [ ! -f "$tmp_dir/runtime/electron" ]; then
    echo "Error: extracted archive does not contain an 'electron' binary." >&2
    exit 1
  fi

  mv "$tmp_dir/runtime/electron" "$tmp_dir/runtime/gemini"
  chmod 755 "$tmp_dir/runtime/gemini"
  rm -f "$tmp_dir/runtime/resources/default_app.asar"

  rm -rf "$INSTALL_DIR"
  mkdir -p "$(dirname "$INSTALL_DIR")"
  mv "$tmp_dir/runtime" "$INSTALL_DIR"
}

if [ "$APP_ONLY" -eq 0 ]; then
  if [ "$UPDATE_RUNTIME" -eq 1 ] || [ ! -x "$INSTALL_DIR/gemini" ]; then
    install_runtime
  else
    echo "Existing Electron runtime found at $INSTALL_DIR; keeping it (use --update-runtime to replace)."
  fi
elif [ ! -x "$INSTALL_DIR/gemini" ]; then
  echo "Error: --app-only specified, but $INSTALL_DIR/gemini does not exist." >&2
  exit 1
fi

echo "Installing app source to $INSTALL_DIR/resources/app..."
rm -rf "$INSTALL_DIR/resources/app"
mkdir -p "$INSTALL_DIR/resources/app/src" "$INSTALL_DIR/resources/app/assets"
install -m 644 "$REPO_DIR/package.json" "$INSTALL_DIR/resources/app/package.json"
install -m 644 "$REPO_DIR/src/main.js" "$INSTALL_DIR/resources/app/src/main.js"
install -m 644 "$REPO_DIR/assets/icon.png" "$INSTALL_DIR/resources/app/assets/icon.png"
install -m 644 "$REPO_DIR/assets/tray-icon.png" "$INSTALL_DIR/resources/app/assets/tray-icon.png"

echo "Installing launcher to $BIN_DIR/gemini..."
mkdir -p "$BIN_DIR"
install -m 755 "$REPO_DIR/bin/gemini" "$BIN_DIR/gemini"

echo "Installing icon and desktop entry..."
mkdir -p "$ICON_DIR" "$APPS_DIR"
install -m 644 "$REPO_DIR/assets/icon.png" "$ICON_DIR/gemini.png"

ESCAPED_EXEC="$(printf '%s\n' "$BIN_DIR/gemini" | sed 's/[&|\\]/\\&/g')"
sed "s|@EXEC_PATH@|${ESCAPED_EXEC}|g" "$REPO_DIR/assets/gemini.desktop.in" > "$APPS_DIR/gemini.desktop"
chmod 644 "$APPS_DIR/gemini.desktop"

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$APPS_DIR" >/dev/null 2>&1 || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true
fi

echo
echo "Gemini Desktop installed successfully!"
echo "  Launcher: $BIN_DIR/gemini"
echo "  Desktop:  $APPS_DIR/gemini.desktop"
echo "  Runtime:  $INSTALL_DIR"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo
  echo "Note: $BIN_DIR is not in your PATH. Add it to launch 'gemini' from the terminal."
fi
