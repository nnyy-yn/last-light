# 枪械资源与外形参考

本游戏的枪械使用可分发的第三方模型，并按游戏的视角、持握和性能需求改编。以下为六把枪的原作与年代依据，核对日期为 2026-10-23。具体运行时改动及人物、手臂署名同时见 `ASSET-SOURCES.md`；开发证据、源文件哈希和模型验收图保存在开发工作区的 `artifacts/weapon-research`。

## 六把枪的模型来源

| 枪械 | 原作与作者 | 许可 |
|---|---|---|
| M16A2 | [M16 A2 Rifle — Luchador / Luchador90](https://sketchfab.com/3d-models/m16-a2-rifle-20c4bb925ca349c6b33aca176b8affba) | CC BY 4.0 |
| M249 | [M249 light machine gun — AK / skaf13](https://sketchfab.com/3d-models/m249-light-machine-gun-75cacc16a52640c7adb100d7294da244) | CC BY 4.0 |
| AKM | [AKM — LonesomeDucky](https://opengameart.org/content/akm) | CC0 1.0 |
| MP5 | [MP5 Submachine Gun — Rotuma](https://sketchfab.com/3d-models/mp5-submachine-gun-a73b61932a0e4eecb5db5c63c158aa24) | CC BY 4.0 |
| M1911 | [M1911 pistol — egorbelous](https://sketchfab.com/3d-models/m1911-pistol-80a0b8a6c4314da4a7b3a7cfe6cec1d4) | CC BY 4.0 |
| M4A1 | [M4A1 — Firewarden3D / Firewarden](https://sketchfab.com/3d-models/m4a1-40d8ef818c7549a896371cbb1f64fec6) | CC BY 4.0 |

许可原文：[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。署名不表示作者、制造商或机构认可本游戏。

M4A1、MP5、M1911 的第一人称适配来自 [cktang88/3d-fps](https://github.com/cktang88/3d-fps#credits--licences)，保留各原作者许可。M16A2 与 M249 取得自 [AllenAI Objaverse 公开数据集](https://huggingface.co/datasets/allenai/objaverse)，按原作品编号匹配，并核对文件内嵌的作者、原页与 CC BY 许可。AKM 为作者在 OpenGameArt 发布的 Blender 源文件。

AKM 的检索入口曾使用 `/content/weathered-akm-rifle`；实际取得的作者页面以 `/content/akm` 作为 canonical 和 Open Graph 地址，因此本说明与模型元数据统一引用后者。

完整第一人称模型还使用以下独立的 CC BY 4.0 手臂/姿态资源：

- [Fps arms — DJMaesen / bumstrum](https://sketchfab.com/3d-models/fps-arms-9452ce4cddde4110a4fd73e555a8e412)。
- [FPS AK-74m animations — Cransh / ccransh](https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14)。
- [FPS Pistol Animations — Cransh / ccransh](https://sketchfab.com/3d-models/fps-pistol-animations-0d7a343dcb6f401197a73c91aee93f6d)。

## 年代与外形取舍

**M16A2 用于历史剧情默认装备，M4A1 作为扩展装备。** [美国陆军 FY1987 历史总结](https://history.army.mil/portals/143/Images/Publications/catalog/101-19.pdf) 印刷第 43 页记录 M16A2 已开始配发；[陆军 M4A1 装备页](https://cpeground.army.mil/Equipment/Equipment-Portfolio/PM-SL-Portfolio/M4A1-Carbine/) 则明确 M4 于 1994 年服役。现有 M4A1 不能仅改名便宣称是 1993 年的 CAR-15。

- **M16A2：**依据 [美国海军陆战队博物馆藏枪照片](https://www.marines.mil/Photos/igphoto/2003748454/)（Sgt. James Stanfield，250703-M-BD822-1016）核对固定提把、圆护木和固定枪托。
- **M249：**依据 [美国陆军装备照片](https://cpeground.army.mil/Equipment/Equipment-Portfolio/PM-SL-Portfolio/M249-Squad-Automatic-Weapon/) 与 [FN 官方历史说明](https://fnamerica.com/press-releases/fn-awarded-u-s-army-contract-for-m249-saw/)。枪族符合年代；后期光学瞄具、导轨和两脚架展开状态需要按场景调整，不将现代整套配置当成 1993 标准装备。
- **AKM：**依据作者 AKM 模型与 [Smithsonian 的 AK 系实物](https://americanhistory.si.edu/collections/object/nmah_439260) 核对木质部件、金属机匣和整体比例。博物馆示例是中国制 AK，不能据此把不同国家、不同年代的 AK 变型视为同一型号。
- **MP5：**依据 [H&K 官方实物页面](https://www.heckler-koch.com/en/Products/Military%20and%20Law%20Enforcement/Submachine%20guns/MP5)。[H&K 沿革](https://www.heckler-koch.com/en/Products/Hunting%2520and%2520Sport/Semi-automatic%2520rifles/SP5) 记载原 MP5 源于 1960 年代。本模型是固定枪托外形，使用 MP5 标签，不照搬上游文件名里的 A5；现代附件不作为年代真实性依据。
- **M1911：**依据 [Smithsonian 藏品](https://americanhistory.si.edu/collections/object/nmah_1291794) 和 [NPS Springfield M1911A1 实物](https://home.nps.gov/spar/learn/historyculture/national-matches.htm)。在游戏中是可选装备，不声称它在 1993 年仍是所有单位的通用制式手枪。

这些资料支持外形与年代核对，不证明某一历史人物在某一时刻使用了对应武器。官方照片用于研究参考，没有作为游戏纹理打包。

## 游戏化处理

模型进行了米制尺度和坐标统一、纹理内嵌及压缩、第一人称握持与机械瞄准位置适配。AKM 原 4K PBR 贴图降至 2K，保留原网格、UV 和表面法线。材质亮度、粗糙度、视角摆位以及换弹动作按游戏表现调整；碰撞、散布、伤害和节奏均为游戏规则，不是现实操作或性能模拟。

保留模型原有的可辨识轮廓和部件区别；最终模型发生过的具体删改，以发行版 `ASSET-SOURCES.md` 为准。
