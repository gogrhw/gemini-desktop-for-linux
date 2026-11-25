# Gemini Desktop for Linux

[English](README.md) | 简体中文

轻量级、零额外依赖的 [Google Gemini](https://gemini.google.com/app) Linux 桌面客户端封装（基于 Electron）。主要在 **Debian 13 (Trixie) + GNOME Wayland (ARM64)** 环境下开发与测试，兼容各主流 Linux 发行版的 `x64` / `arm64` 架构以及 Wayland / X11 会话。

## 特性

- **原生 Wayland 与中文输入法支持**：在 Wayland 会话下自动启用 `--ozone-platform=wayland --enable-wayland-ime --wayland-text-input-version=3`（修复 IBus / Fcitx5 等输入法支持），X11 环境下自动回退。
- **关闭最小化到托盘 & 单实例秒开**：点击关闭按钮或 `Ctrl+W` 仅隐藏到系统托盘；内置单实例锁，再次启动直接唤起并聚焦已有窗口。
- **高 CPU 占用修复**：暂停 Gemini 首页无限循环的高斯模糊光斑和渐变条动画（`.nl-blob`、`.gradient-strip`），避免渲染进程持续主线程重绘导致常驻 60%+ CPU。
- **更像原生桌面应用的交互体验**：
  - 屏蔽浏览器风格快捷键与误触缩放（`Ctrl+R`、`F5`、`Ctrl +/-/0`、`Alt+左右`、`Ctrl+P/S/U`、鼠标前进/后退侧键、`Ctrl+滚轮` / 触控板捏合缩放）。
  - 窗口窄于 `960px` 时自动按比例缩放，保持桌面端布局而不塌陷成移动端样式。
  - 微调对话区域默认字号（`0.875` 缩放，约 `16px -> 14px`），并防止嵌套元素重复缩放。
  - 自动记忆窗口大小、位置和最大化状态（保存于 `~/.config/Gemini/window-state.json`），支持多显示器边界校验。
- **登录弹窗与外链分离**：Google 账号登录流程在隔离的子窗口内完成，其他外部链接自动调用系统默认浏览器打开。
- **严格权限隔离**：开启 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`，剪贴板、麦克风、媒体与通知权限仅限 `https://*.google.com` 域名。

## 快速安装（推荐）

自动识别系统架构（`x64` / `arm64`），下载官方预编译 Electron 运行时，并将程序、启动脚本、图标和 `.desktop` 菜单项安装到 `~/.local`（无需 root 权限）：

```bash
git clone https://github.com/gogrhw/gemini-desktop-for-linux.git
cd gemini-desktop-for-linux
./scripts/install.sh
```

安装完成后：
- 直接在应用菜单 / GNOME 应用网格中打开 **Gemini**；或
- 在终端运行 `gemini`（需确保 `~/.local/bin` 在 `PATH` 中）。

### 安装脚本选项

```bash
# 指定 Electron 版本
./scripts/install.sh --electron-version 45.4.1

# 离线安装（使用本地已下载的 Electron Linux zip）
./scripts/install.sh --electron-zip /path/to/electron-v45.4.1-linux-arm64.zip

# 仅更新应用源码、图标和启动脚本（不重新下载运行时）
./scripts/install.sh --app-only

# 强制替换 Electron 运行时
./scripts/install.sh --update-runtime
```

### 强制使用 X11（可选）

```bash
GEMINI_FORCE_X11=1 gemini
```

## 通过 npm 运行（开发模式）

```bash
npm install
npm start              # 默认启动
npm run start:wayland  # 启用 Wayland 与 IME 参数启动
```

## 快捷键与托盘操作

| 操作 | 快捷键 / 方式 |
| --- | --- |
| 隐藏窗口到托盘 | 窗口关闭按钮 或 `Ctrl+W` |
| 显示 / 隐藏窗口 | 左键点击托盘图标 |
| 托盘菜单（`Show Gemini` / `Hide to Menu` / `New Chat` / `Quit Gemini`） | 右键点击托盘图标 |
| 彻底退出程序 | `Ctrl+Q` 或 托盘菜单 -> `Quit Gemini` |
| 开关开发者工具 | `F12` 或 `Ctrl+Shift+I` |

> **GNOME 提示**：GNOME Shell 默认不显示系统托盘图标，建议安装 [AppIndicator and KStatusNotifierItem Support](https://extensions.gnome.org/extension/615/appindicator-support/) 扩展。

## 数据目录与卸载

登录状态、缓存和窗口位置保存在 `~/.config/Gemini`。

```bash
# 卸载程序（保留 ~/.config/Gemini 登录数据）
./scripts/uninstall.sh

# 卸载程序并清空本地数据
./scripts/uninstall.sh --purge-data
```

## 免责声明

本项目是面向 `https://gemini.google.com/app` 的非官方开源桌面封装，与 Google 无任何隶属或官方合作关系。

## 开源协议

[MIT](LICENSE)
