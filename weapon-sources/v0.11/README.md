# 原创支援装备模型

`build-support.py` 在后台Blender创建5个米制原创模型：RPK、RPG-7/整弹、DShK、M134门机枪、开放后斗皮卡。原始GLB命名节点同时构成运行时契约；握点、枪口、光学轴、后喷口或车组站位属于空节点，操作件保留真实可见几何，不能只把空marker当模型。

```powershell
& tools/models/blender/blender.exe --background --factory-startup --python-exit-code 1 --python scripts/support-models/build-support.py
```

`*-source.blend`保留未简化编辑几何。主GLB及相同层级的`*-lod.glb`写到public/assets，manifest记录大小、SHA256、三角形与材质数。LOD导出已生成，当前运行时未自动切换；不要把准备资源描述为已生效的LOD功能。不会调用可见窗口或下载第三方模型。模型图片/观察资料不打包成贴图。

所有新增设备几何为原创项目资产，继承项目原创内容适用条款。既有第一人称手臂、军服、UH-60和MakeHuman的各自许可不变，见根ASSET-SOURCES。模型基于外形参考做简化，不用于现实制造或操作训练。
