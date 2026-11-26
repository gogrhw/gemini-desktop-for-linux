'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  nativeTheme,
  screen,
  session,
  shell,
} = require('electron');
const fs = require('fs');
const path = require('path');

const GEMINI_URL = 'https://gemini.google.com/app';
const DESKTOP_LAYOUT_WIDTH = 960;
const CHAT_FONT_SCALE = 0.875;
const ASSETS_DIR = fs.existsSync(path.join(__dirname, '..', 'assets'))
  ? path.join(__dirname, '..', 'assets')
  : __dirname;
const ICON_PATH = path.join(ASSETS_DIR, 'icon.png');
const TRAY_ICON_PATH = path.join(ASSETS_DIR, 'tray-icon.png');
const STATE_FILE = () => path.join(app.getPath('userData'), 'window-state.json');

// Ensure consistent desktop/app identity for GNOME Shell, Wayland & tray-apps-in-dock
app.setName('Gemini');
app.setPath('userData', path.join(app.getPath('appData'), 'Gemini'));
if (typeof app.setDesktopName === 'function') {
  app.setDesktopName('gemini.desktop');
}

// Single instance lock: re-launching focuses/shows the existing hidden window instantly
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let saveBoundsTimer = null;

function isSafeHttpUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function isGeminiUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.protocol === 'https:' && (
      u.hostname === 'gemini.google.com' ||
      u.hostname === 'bard.google.com'
    );
  } catch {
    return false;
  }
}

function isGoogleAuthUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    return (
      h === 'accounts.google.com' ||
      h === 'accounts.youtube.com' ||
      (h === 'www.google.com' && u.pathname.startsWith('/accounts/')) ||
      h === 'myaccount.google.com' ||
      h === 'gds.google.com' ||
      h === 'consent.google.com' ||
      h === 'ogs.google.com' ||
      h === 'workspace.google.com' ||
      h === 'families.google.com' ||
      h === 'one.google.com'
    );
  } catch {
    return false;
  }
}

function isTrustedGoogleOrigin(urlStr) {
  try {
    const u = new URL(urlStr);
    return u.protocol === 'https:' && (
      u.hostname === 'google.com' ||
      u.hostname.endsWith('.google.com')
    );
  } catch {
    return false;
  }
}

function loadWindowState() {
  const defaults = { width: 1200, height: 820, isMaximized: false };
  try {
    const raw = fs.readFileSync(STATE_FILE(), 'utf-8');
    const parsed = JSON.parse(raw);
    const width = Number.isFinite(parsed.width) && parsed.width >= 480 ? Math.round(parsed.width) : defaults.width;
    const height = Number.isFinite(parsed.height) && parsed.height >= 400 ? Math.round(parsed.height) : defaults.height;
    const state = {
      width,
      height,
      isMaximized: Boolean(parsed.isMaximized),
    };
    if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
      const displays = screen.getAllDisplays();
      const onScreen = displays.some((d) => {
        const wa = d.workArea;
        return (
          parsed.x + width > wa.x + 64 &&
          parsed.x < wa.x + wa.width - 64 &&
          parsed.y + height > wa.y + 64 &&
          parsed.y < wa.y + wa.height - 64
        );
      });
      if (onScreen) {
        state.x = Math.round(parsed.x);
        state.y = Math.round(parsed.y);
      }
    }
    return state;
  } catch {
    return defaults;
  }
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible() || mainWindow.isMinimized()) return;
  try {
    const prev = loadWindowState();
    const isMaximized = mainWindow.isMaximized();
    const isFullScreen = mainWindow.isFullScreen();
    const next = {
      ...prev,
      isMaximized,
    };
    if (!isMaximized && !isFullScreen) {
      const b = mainWindow.getBounds();
      if (b.width >= 480 && b.height >= 400) {
        next.x = b.x;
        next.y = b.y;
        next.width = b.width;
        next.height = b.height;
      }
    }
    fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
    fs.writeFileSync(STATE_FILE(), JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Gemini] Failed to save window state:', err);
  }
}

function scheduleSaveWindowState() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null;
    saveWindowState();
  }, 300);
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  if (typeof mainWindow.moveTop === 'function') {
    mainWindow.moveTop();
  }
  mainWindow.focus();
  app.focus({ steal: true });
  if (!mainWindow.webContents.isDestroyed()) {
    mainWindow.webContents.focus();
  }
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  saveWindowState();
  if (mainWindow.isFullScreen()) {
    mainWindow.once('leave-full-screen', () => {
      if (mainWindow && !mainWindow.isDestroyed() && !isQuitting) {
        mainWindow.hide();
      }
    });
    mainWindow.setFullScreen(false);
  } else {
    mainWindow.hide();
  }
}

function toggleMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

function setupSession() {
  const ses = session.defaultSession;
  const allowedPermissions = new Set([
    'clipboard-read',
    'clipboard-sanitized-write',
    'fullscreen',
    'media',
    'microphone',
    'notifications',
    'pointerLock',
    'openExternal',
  ]);

  ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const origin = details?.requestingUrl || webContents.getURL();
    if (allowedPermissions.has(permission) && isTrustedGoogleOrigin(origin)) {
      callback(true);
      return;
    }
    callback(false);
  });

  ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
    const origin = requestingOrigin || webContents?.getURL?.() || '';
    return allowedPermissions.has(permission) && isTrustedGoogleOrigin(origin);
  });
}

function attachContextMenu(wc) {
  wc.on('context-menu', (_event, params) => {
    const template = [];

    if (params.linkURL && isSafeHttpUrl(params.linkURL)) {
      template.push(
        {
          label: 'Open Link in Browser',
          click: () => shell.openExternal(params.linkURL),
        },
        {
          label: 'Copy Link Address',
          click: () => require('electron').clipboard.writeText(params.linkURL),
        },
        { type: 'separator' }
      );
    }

    if (params.mediaType === 'image' && params.srcURL) {
      template.push(
        {
          label: 'Copy Image',
          click: () => wc.copyImageAt(params.x, params.y),
        },
        {
          label: 'Save Image As...',
          click: () => wc.downloadURL(params.srcURL),
        },
        { type: 'separator' }
      );
    }

    if (params.isEditable) {
      template.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      );
    } else if (params.selectionText && params.selectionText.trim().length > 0) {
      template.push(
        { role: 'copy' },
        { role: 'selectAll' }
      );
    }

    if (template.length > 0) {
      const menu = Menu.buildFromTemplate(template);
      menu.popup();
    }
  });
}

function applyWindowZoom(win) {
  const wc = win.webContents;
  if (wc.isDestroyed()) return;
  const geminiPage = isGeminiUrl(wc.getURL());
  const factor = geminiPage
    ? Math.min(1, win.getContentSize()[0] / DESKTOP_LAYOUT_WIDTH)
    : 1;
  if (factor <= 0) return;
  if (Math.abs(wc.getZoomFactor() - factor) > 0.000001) {
    wc.setZoomFactor(factor);
  }
}

function attachShortcuts(win) {
  const wc = win.webContents;

  // 屏蔽鼠标/触控板触发的缩放与系统级浏览器前进/后退/刷新命令
  wc.on('zoom-changed', () => {
    applyWindowZoom(win);
  });
  win.on('app-command', (event, cmd) => {
    if (cmd === 'browser-backward' || cmd === 'browser-forward' || cmd === 'browser-refresh') {
      event.preventDefault();
    }
  });

  wc.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const ctrl = input.control || input.meta;
    const key = input.key.toLowerCase();

    if (ctrl && !input.alt && !input.shift && key === 'q') {
      event.preventDefault();
      isQuitting = true;
      app.quit();
      return;
    }
    if (ctrl && !input.alt && !input.shift && key === 'w') {
      event.preventDefault();
      win.close();
      return;
    }
    if ((ctrl && input.shift && key === 'i') || input.key === 'F12') {
      event.preventDefault();
      wc.toggleDevTools();
      return;
    }

    // 屏蔽浏览器风格快捷键：刷新、焦点切换、缩放、历史前进/后退、打印/保存网页/查看源码
    if (
      (ctrl && !input.alt && key === 'r') ||
      input.key === 'F5' ||
      input.key === 'F6' ||
      input.key === 'F7' ||
      input.key === 'BrowserRefresh' ||
      (ctrl && !input.alt && (key === '=' || key === '+' || key === '-' || key === '_' || key === '0')) ||
      (input.alt && !ctrl && !input.shift && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) ||
      input.key === 'BrowserBack' ||
      input.key === 'BrowserForward' ||
      (ctrl && !input.alt && !input.shift && (key === 'p' || key === 's' || key === 'u'))
    ) {
      event.preventDefault();
    }
  });
}

function createMainWindow(startUrl = GEMINI_URL) {
  const state = loadWindowState();
  const icon = nativeImage.createFromPath(ICON_PATH);

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 480,
    minHeight: 400,
    title: 'Gemini',
    icon,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#131314' : '#ffffff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  if (state.isMaximized) {
    mainWindow.maximize();
  }

  const wc = mainWindow.webContents;

  wc.on('did-navigate', () => {
    applyWindowZoom(mainWindow);
    void wc.setVisualZoomLevelLimits(1, 1);
  });
  wc.on('dom-ready', () => {
    applyWindowZoom(mainWindow);
    void wc.setVisualZoomLevelLimits(1, 1);
    wc.executeJavaScript(`
      if (!window.__geminiNativeGuards) {
        window.__geminiNativeGuards = true;
        // 屏蔽鼠标侧键（前进/后退）
        const blockSideButtons = (e) => {
          if (e.button === 3 || e.button === 4) {
            e.preventDefault();
            e.stopPropagation();
          }
        };
        window.addEventListener('mousedown', blockSideButtons, true);
        window.addEventListener('mouseup', blockSideButtons, true);
        window.addEventListener('auxclick', blockSideButtons, true);
        // 屏蔽 Ctrl/Cmd + 滚轮与触控板捏合缩放
        window.addEventListener('wheel', (e) => {
          if (e.ctrlKey || e.metaKey) e.preventDefault();
        }, { passive: false, capture: true });
      }
    `).catch((err) => console.error('[Gemini] Failed to install native guards:', err));
    if (isGeminiUrl(wc.getURL())) {
      wc.insertCSS(`
        [data-test-id="new-chat-button"] .trailing-text-container { display: none !important; }
        /* 新对话首页的装饰背景：无限循环的 border-radius + blur(100px+) 光斑、
           以及 background-position 渐变条，都无法走合成器，每帧主线程重绘，
           导致渲染进程常驻 60%+ CPU。冻结在当前帧，外观基本不变。 */
        .nl-blob, .gradient-strip { animation-play-state: paused !important; }
        /* 调小聊天区域（AI 回复、用户提问、输入框）默认字号（约 16px -> 14px），并防止嵌套重复缩放 */
        :is(message-content, user-query .query-text, rich-textarea .ql-editor) {
          zoom: ${CHAT_FONT_SCALE};
        }
        :is(message-content, user-query .query-text, rich-textarea .ql-editor)
          :is(message-content, user-query .query-text, rich-textarea .ql-editor) {
          zoom: 1;
        }
        /* 屏蔽浏览器默认焦点黑框与 Angular Material / GM3 键盘焦点指示器 */
        :root {
          --mat-focus-indicator-border-width: 0px !important;
          --gm3-focus-ring-active-width: 0px !important;
        }
        *:focus,
        *:focus-visible,
        *:focus::before,
        *:focus-visible::before,
        *:focus::after,
        *:focus-visible::after {
          outline: none !important;
        }
        .mat-focus-indicator::before,
        .mat-mdc-focus-indicator::before {
          display: none !important;
        }
      `).catch((err) => console.error('[Gemini] Failed to apply desktop styles:', err));
      wc.executeJavaScript(`
        if (!window.__geminiFocusGuards) {
          window.__geminiFocusGuards = true;
          // 屏蔽 Gemini 页面内 Tab 触发元素焦点跳转（保留代码编辑器缩进）
          window.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
              const el = document.activeElement;
              const inCodeEditor = el && el.closest && el.closest('.monaco-editor, .cm-editor, .CodeMirror');
              if (!inCodeEditor) {
                e.preventDefault();
              }
            }
          }, true);
          // 窗口恢复聚焦时，若焦点停留在非输入元素上则自动失焦
          window.addEventListener('focus', () => {
            const el = document.activeElement;
            if (!el || el === document.body || el === document.documentElement) return;
            const isEditable =
              el.tagName === 'INPUT' ||
              el.tagName === 'TEXTAREA' ||
              el.tagName === 'SELECT' ||
              el.isContentEditable;
            if (!isEditable && typeof el.blur === 'function') {
              el.blur();
            }
          });
        }
      `).catch((err) => console.error('[Gemini] Failed to install focus guards:', err));
    }
  });

  wc.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank' || isGoogleAuthUrl(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: mainWindow,
          width: 540,
          height: 680,
          autoHideMenuBar: true,
          icon,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      };
    }
    if (isGeminiUrl(url)) {
      void wc.loadURL(url);
      return { action: 'deny' };
    }
    if (isSafeHttpUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  wc.on('will-navigate', (event, url) => {
    if (isGeminiUrl(url) || isGoogleAuthUrl(url)) {
      return;
    }
    if (isSafeHttpUrl(url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  attachContextMenu(wc);
  attachShortcuts(mainWindow);

  mainWindow.on('resize', () => {
    applyWindowZoom(mainWindow);
    scheduleSaveWindowState();
  });
  mainWindow.on('move', scheduleSaveWindowState);
  mainWindow.on('maximize', () => {
    applyWindowZoom(mainWindow);
    scheduleSaveWindowState();
  });
  mainWindow.on('unmaximize', () => {
    applyWindowZoom(mainWindow);
    scheduleSaveWindowState();
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      saveWindowState();
      return;
    }
    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void wc.loadURL(startUrl);
}

function createTray() {
  const icon = nativeImage.createFromPath(TRAY_ICON_PATH);
  tray = new Tray(icon);
  tray.setToolTip('Gemini');

  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Gemini',
      click: () => showMainWindow(),
    },
    {
      label: 'Hide to Menu',
      click: () => hideMainWindow(),
    },
    { type: 'separator' },
    {
      label: 'New Chat',
      click: () => {
        showMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          void mainWindow.webContents.loadURL(GEMINI_URL);
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Gemini',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on('click', () => toggleMainWindow());
}

app.on('second-instance', (_event, commandLine) => {
  showMainWindow();
  const targetUrl = commandLine.find((arg) => isGeminiUrl(arg));
  if (targetUrl && mainWindow && !mainWindow.isDestroyed()) {
    void mainWindow.webContents.loadURL(targetUrl);
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  saveWindowState();
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    app.quit();
  }
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  setupSession();
  createTray();
  const startUrl = process.argv.find((arg) => isGeminiUrl(arg)) || GEMINI_URL;
  createMainWindow(startUrl);
});
