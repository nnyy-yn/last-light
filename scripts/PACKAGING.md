# Windows 打包

源码版本 0.8.0 是有限规模的战争叙事游戏原型。本文描述构建方式与输出范围；生成文件的版本、大小和哈希以 `release/release-manifest.json` 为准，公开下载验收见相应GitHub版本发布说明。桌面默认最大化、最小 960 × 600；F11 切换全屏，Alt + F4 退出。运行端为 Windows 10 / 11 x64。

## 一键构建

在项目根目录运行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build.ps1
```

脚本使用 PATH 中的 Node.js，或本机 Codex 捆绑的 Node.js。依赖需事先安装；脚本不会安装全局工具。只有确认 `dist/` 对应当前源码与资源时，才可加 `-SkipBuild`，或执行 `node scripts/package.mjs`。`package.mjs` 本身只检查 `dist/index.html` 存在，不会重新执行 Vite，也不会检查源文件是否比 `dist/` 新。

打包器只读本机 Electron runtime，优先采用环境变量 `LAST_LIGHT_ELECTRON_DIST`，其次项目内 `node_modules/electron/dist`，最后相邻项目 `shiyong-toolbox/node_modules/electron/dist`。允许版本为 Electron 44.7.2 / 44.9.0，要求 Windows x64。相邻项目的应用代码不会复制或更改。

便携单文件使用本机 electron-builder 缓存中的 NSIS 3.0.4.1。可通过 `LAST_LIGHT_NSIS_EXE` 指定 `makensis.exe`。PowerShell 脚本也接受 `-ElectronDist <目录>`、`-NsisExe <文件>`。没有 NSIS 时使用 `-NoPortable` 或 `--no-portable`，只生成完整目录版。

## 运行资源与可编辑源的范围

Vite 配置使用默认的 `public/` 复制行为；`pnpm build` 会把本地资源放进 `dist/`。`package.mjs` 再递归复制整个 `dist/` 到 `resources/app/dist/`，没有逐个模型的白名单。

| 当前新增文件 | 构建与打包位置 |
| --- | --- |
| `public/assets/mounted-makehuman-hands.glb` | 构建后为 `dist/assets/mounted-makehuman-hands.glb`，再随运行资源复制；可编辑源副本也在 `source/public/assets/` |
| `src/chapter-mission-plans.js`、`src/campaign-tasks.js` | 进入 Vite JavaScript 构建；原始文件随整个 `src/` 复制到 `source/src/` |
| `src/chapter-checkpoints.js`、`src/chapter-transition.js`、`src/chapter-boundary.js`、`src/mounted-gunner-pose.js` | 同上，运行时构建和原始源码均保留 |
| `scripts/makehuman/export-mounted-hands.py` 与新增 QA 脚本 | 整个 `scripts/` 递归复制到 `source/scripts/` |
| `character-sources/makehuman/soldier-fitted-source.blend` | 进入 `source/character-sources/makehuman/`；只排除自动备份和缓存，不排除正式 `.blend` 文件 |
| 根目录 `.md` 文档与 `public/assets/ASSET-SOURCES.md` | 根文档进入 `source/`；资源署名还会随 `public/` 进入运行资源 |

`artifacts/` 不在打包范围内，因此 `artifacts/rebuild-v0.8/release-notes.md` 和验证截图不会自动进入包。需要随包提供的最终发布说明应先放入根目录 `.md` 文档；不能因为草案存在就宣称已经随包分发。

0.8 最终打包前需要重新构建并确认新手掌 GLB 已出现在 `dist/assets/`，核对其与 `public/assets/` 中源文件的大小和哈希。模型导出后沿用旧 `dist/` 会遗漏这一运行时资源；只复制到 `source/public/` 不能补救运行时缺文件。

## 产物

- `release/归途-LastLight/归途.exe`：直接启动版，需要保留同级运行库和 resources 目录。
- `release/归途-LastLight-v0.8.0.exe`：单文件便携版，以普通用户权限解压到随机临时目录，等待游戏结束后由 NSIS 自动清理临时文件；不写入安装注册表。
- `release/归途-LastLight/manifest.sha256.json`：目录内文件大小及 SHA-256 校验值（不含 manifest 自身）。
- `release/release-manifest.json`：版本、runtime 版本、目录体积、便携 EXE 体积及 SHA-256。
- 发布目录内的 `source` 保留可编辑工程和项目文档，排除 node_modules、测试截图和缓存。Electron、Chromium、Three.js 许可随包分发。

重复打包会在 staging 中先完成新目录，检查原目录的本项目标记后，将旧目录改名为 `.last-light-previous-*` 再替换。旧便携包也保留为 `.last-light-portable-previous-*`；脚本不执行递归删除。确认新版本后可人工清理旧版本以回收空间。

存档位置固定为 `%APPDATA%/LastLight`，因此移动便携 EXE 或更换新版本不会改变存档位置。便携版每次均需解压，启动可能有短暂等待。本地构建未进行商业代码签名。

## 桌面安全边界

Electron 仅加载本包 `dist/index.html`，启用 context isolation、renderer sandbox 和 web security，关闭 renderer Node.js，阻止新窗口、外部导航及 webview。仅本地游戏窗口可以申请鼠标锁定和全屏，其余权限一律拒绝。重复打开会聚焦已有窗口。运行不依赖网络服务，保留 Windows 默认 Alt + F4 行为。
