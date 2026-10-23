# 新角色的 MakeHuman / MPFB 可编辑源

这些角色于 2026-10-23 使用 **MakeHuman Community MPFB2 2.0.18** 在 **Blender 4.5.9 LTS** 的后台 Python 环境中实际生成。没有使用 MakeHuman 独立桌面程序，也没有把旧 Sam 文件改名作为新人体。新体型、脸型和 Mixamo 骨架来自官方基础网格、targets 和权重；程序化动作由游戏运行时驱动。

三个人物为虚构通用人物，不复刻演员或具体历史人物。居民穿蓝色无品牌衬衫；武装人员穿灰褐夹克、牛仔裤并使用 AK，身份由装备和行为表达；士兵使用重新适配的军装装备及新 MakeHuman 脸和身体比例。

- `civilian-source.blend`、`combatant-source.blend`、`soldier-source.blend`：可编辑人体、参数变形、绑定及打包材质。士兵源保留衣服下的完整人体，作为建模数据。
- `soldier-fitted-source.blend` 与 `military-fit-report.json`：军装重新适配到新人体骨架的可编辑工程与绑定记录。
- `*.human.json` 与 `build-provenance.json`：宏观参数、局部 target 值、工具版本。
- `*-generated.glb`：未压缩的中间导出；供检查和重建，不是另外一个运行时人物。
- `runtime-export-manifest.json`：游戏 GLB 的哈希、大小和纹理转换记录。
- `download-manifest-*.json`：从官方资产包提取的文件及 SHA-256。

完整 MakeHuman/MPFB 工具、官方源库和 portable Blender 位于开发项目的 `tools/models/`，不随游戏包分发。重建时从以下官方地址取得源和资产：

- MPFB： https://github.com/makehumancommunity/mpfb2 ，本次源版本 `b1a2dc98776da9d1eea751b159d42cf61778fe2e`（完整 ZIP 哈希见 `build-provenance.json`）。
- 官方基础资产包说明： https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- 官方资产 ZIP： https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
- Blender： https://www.blender.org/download/lts/4-5/

从项目根目录运行（全部后台，不启动 GUI）：

```powershell
& tools/models/blender/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/makehuman/create-characters.py -- soldier civilian combatant
& tools/models/blender/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/makehuman/fit-military.py
node scripts/makehuman/prepare-runtime.mjs civilian combatant soldier
```

`create-characters.py` 指定每套宏观体型和脸部 target，载入皮肤、眼睛、眉毛、短发、衣鞋，建立 Mixamo 骨架，保存可编辑源，再烘焙变形并移除辅助人体网格。轻微缩小眼睑高度，移除裤腿内多余袜筒，限制贴图到 2K。`prepare-runtime.mjs` 保留几何和权重，压缩嵌入纹理为 WebP；最终眼部使用官方 `brownlight_eye.png` 的低饱和中棕色派生贴图，原图存于 `textures/eyes-brownlight-source.png`。编辑源保留初版棕眼，最终运行时的眼部颜色转换以导出脚本为准。

军装适配脚本将旧模型的特殊单位编码先还原，再以对应骨骼的静止姿态映射到新 MakeHuman rig。新人物保留自己的头颈和手；剥除旧面罩、帽、耳机和手套。异常悬空弹袋被移除。军靴使用整靴的脚骨刚性绑定，裤腿膝区权重平滑过渡。

MakeHuman 基础网格、targets、rig 和官方系统资产为 CC0。使用的系统资产：`middleage_african_male`、`young_caucasian_male`、`low-poly` eyes、`eyebrow001`、`short01`、`male_casualsuit01`、`male_casualsuit05`、`shoes03`。权利人说明见官方资产文件及随附 CC0 许可。MPFB 程序本身为 GPL，其生成资产输出与程序逻辑分开，详见 `LICENSE-MPFB-explanation.md`。

军装及配件继续遵守 DanlyVostok / 1799danly 的 CC BY 4.0；完整署名、上游链接及本项目修改说明在根目录和 `public/assets/ASSET-SOURCES.md`。MakeHuman 许可不覆盖这些外部军装。
