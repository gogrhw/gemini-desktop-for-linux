# Gemini Desktop for Linux

English | [简体中文](README.zh-CN.md)

A lightweight, zero-dependency Electron desktop wrapper for [Google Gemini](https://gemini.google.com/app) tailored for Linux desktops (primarily developed and tested on **Debian 13 Trixie + GNOME Wayland (ARM64)**, and compatible with Linux `x64` / `arm64` on both Wayland and X11).

## Features

- **Native Wayland & IME Support**: Automatically launches with `--ozone-platform=wayland --enable-wayland-ime --wayland-text-input-version=3` under Wayland sessions (fixes CJK input methods such as IBus / Fcitx5), with seamless fallback to X11.
- **Close to System Tray & Instant Resume**: Closing the window hides it to the system tray instead of exiting. Single-instance lock ensures re-launching focuses the existing window immediately.
- **CPU Usage Optimization**: Pauses Gemini's homepage infinite CSS blur/gradient animations (`.nl-blob`, `.gradient-strip`) that otherwise trigger continuous main-thread repaints and 60%+ idle CPU usage.
- **Native Desktop Feel**:
  - Blocks browser-style navigation and accidental zoom triggers (`Ctrl+R`, `F5`, `Ctrl +/-/0`, `Alt+Left/Right`, `Ctrl+P/S/U`, mouse side buttons, and `Ctrl+Wheel` / pinch zoom).
  - Keeps Gemini in desktop layout on narrower windows by automatically scaling below `960px` width.
  - Slightly refines chat text density (`0.875` scale, ~16px -> 14px) without compounding nested elements.
  - Remembers window position, size, and maximized state across restarts with multi-monitor bounds validation.
- **Clean Auth & External Links**: Google Sign-In popups open inside an isolated child window, while non-Gemini links open in your default system browser.
- **Scoped Permissions & Security**: Runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. Clipboard, microphone, media, and notification permissions are restricted strictly to `https://*.google.com`.

## Quick Install (Recommended)

Downloads the official prebuilt Electron runtime (`x64` or `arm64`) and installs the app, launcher, icon, and `.desktop` entry into `~/.local` (no root required):

```bash
git clone https://github.com/gogrhw/gemini-desktop-for-linux.git
cd gemini-desktop-for-linux
./scripts/install.sh
```

After installation:
- Launch **Gemini** from your application menu / GNOME Overview, or
- Run `gemini` in a terminal (make sure `~/.local/bin` is in your `PATH`).

### Installer Options

```bash
# Use a specific Electron version
./scripts/install.sh --electron-version 45.4.1

# Offline install using a pre-downloaded Electron Linux zip
./scripts/install.sh --electron-zip /path/to/electron-v45.4.1-linux-arm64.zip

# Update only app source / icons / launcher without touching the Electron runtime
./scripts/install.sh --app-only

# Force-replace the Electron runtime
./scripts/install.sh --update-runtime
```

### Force X11 (Optional)

If you are on Wayland and want to force XWayland/X11 for debugging:

```bash
GEMINI_FORCE_X11=1 gemini
```

## Run with npm (Development)

```bash
npm install
npm start          # Default
npm run start:wayland  # With Wayland + IME flags
```

## Keyboard Shortcuts & Tray

| Action | Shortcut / Trigger |
| --- | --- |
| Hide window to tray | Window Close button or `Ctrl+W` |
| Toggle show / hide | Left-click tray icon |
| Tray menu (`Show Gemini`, `Hide to Menu`, `New Chat`, `Quit Gemini`) | Right-click tray icon |
| Quit completely | `Ctrl+Q` or Tray -> `Quit Gemini` |
| Toggle DevTools | `F12` or `Ctrl+Shift+I` |

> **GNOME Note**: To display the system tray icon in GNOME Shell, install an AppIndicator extension such as [AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/).

## Data & Uninstall

User data (Google session cookies, cache, and `window-state.json`) is stored in `~/.config/Gemini`.

```bash
# Uninstall app while preserving ~/.config/Gemini
./scripts/uninstall.sh

# Uninstall app and delete all local session data
./scripts/uninstall.sh --purge-data
```

## Project Structure

```text
.
├── assets/
│   ├── gemini.desktop.in   # Freedesktop .desktop template
│   ├── icon.png            # 512x512 application icon
│   └── tray-icon.png       # 128x128 system tray icon
├── bin/
│   └── gemini              # Wayland/X11 launcher script
├── scripts/
│   ├── install.sh          # User-level Linux installer
│   └── uninstall.sh        # Clean uninstaller
├── src/
│   └── main.js             # Electron main process
├── package.json
└── LICENSE
```

## Disclaimer

This is an unofficial community desktop wrapper for `https://gemini.google.com/app` and is not affiliated with or endorsed by Google.

## License

[MIT](LICENSE)
