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

## 0.11 支援火力模型与史料边界

本轮只将下列第一方资料用于外形、尺度与装备类别判断，不把资料图片再发布为游戏贴图。

- **RPK**：美国海军陆战队《MCWP 3-11.1 Infantry Company Operations》附录C，第C-5页，Figure C-6，列出7.62×39mm、1040mm总长、591mm重型长枪管、固定木托与75发鼓。项目模型约1.11m，属于接近比例的原创游戏外形，未宣称每一尺寸均与原枪一致。参考： https://www.trngcmd.marines.mil/Portals/207/Docs/TBS/MCWP%203-11.1%20Infantry%20Company%20Operations.pdf?ver=cGmfZysFamJdHSIX5Qc65Q%3D%3D 。更新手册《MCRP 3-10A.3》附录H、Figure H-3也直接展示75发鼓： https://www.marines.mil/Portals/1/Publications/MCRP%203-10A.3%20%28SECURED%29.pdf?ver=k3ofW_UJtF1JNkjbC29jZg%3D%3D 。
- **RPG-7外形**：厂家Rosoboronexport RPG-7V2资料列出953mm发射器及PGO光学瞄具： https://roe.ru/pdfs/pdf_4588.pdf 。这是较新的V2产品资料，只用于发射管/后喷口/光学装置的几何参考；游戏标为RPG-7，未加V2的UP-7V通用瞄具，也不把现行V2规格或现代附件说成1993配置。弹体、后喷效果与重新装填为简化的游戏表现。
- **DShK外形**：BICC/Bundeswehr Verification Center SALW Guide提供DShK侧影、12.7×108mm、1625mm长度与带式供弹信息： https://salw-guide.bicc.de/en/weapon/view/37/dshk 。游戏采用约1.6m的散热环长枪管、明显制退器、后握把和带式供弹轮廓。100发游戏弹链与300发储备是有限游戏规则，不宣称是历史车辆的实载定额。
- **技术车**：美国海军陆战队历史部《Restoring Hope: In Somalia with the Unified Task Force 1992–1993》解释“technical”为皮卡或类似车辆后斗装上重机枪、防空武器等班组武器的改装平台。参考： https://www.marines.mil/Portals/1/Publications/Restoring%20Hope_In%20Somalia%20with%20the%20Unified%20Task%20Force%201992-1993%20%20PCN%2019000413500.pdf?ver=2017-04-25-121519-137 。项目用无品牌原创开放后斗车体和三脚支座，不声称复刻某辆有可核实车牌的历史车辆。
- **摩加迪沙空中武器区别**：USASOC历史办公室《Veritas》Vol.3 No.2，“If you liked Beirut, you'll love Mogadishu”说明AH-6使用火箭巢与六管机枪，MH-60L常规门武器是由机组操作的7.62mm minigun；专门DAP配置才可带火箭巢/30mm炮。参考： https://arsof-history.org/articles/pdf/v3n2_like_beirut_love_mogadishu.pdf 及 https://mail.arsof-history.org/articles/v3n2_like_beirut_love_mogadishu_page_1.html 。因此现有UH-60基础资产增加双侧M134式门枪，没有把AH-6或DAP重挂架混装到普通黑鹰上。基础机身并非完整MH-60L专用构型，不能据此宣称精确历史复刻。
- **索降动作资料**：美国陆军FRIES/SPIES教学图示与军方现场训练照片用于手脚抱绳、脚部锁止、着陆屈膝与离开绳区的姿态参考，而非供玩家现实训练使用。 https://home.army.mil/campbell/application/files/9617/0023/5328/FRIES_and_SPIES_HANDOUT_FEB_2022.pdf ； https://www.dvidshub.net/news/6963/pathfinders-5th-battalion-101st-combat-aviation-brigade-conduct-fastrope-training-iraq 。游戏仍采用有边界的骨骼脚本演出。

新资产脚本为 `scripts/support-models/build-support.py`，编辑源与manifest在 `weapon-sources/v0.11/`。来源仅用于研究；新增五模型全部为本项目原创几何。原枪、人物、手臂和黑鹰的独立许可继续保留，见 `ASSET-SOURCES.md`。
