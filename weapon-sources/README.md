# Firearm source artifacts

`v0.4/` preserves the six previous runtime GLBs and weapon-module snapshots. `m16a2-original-authored.glb` is the credited author's original archive model, retained to recover its unmodified roughness image.

`v0.5/m249-detail-source.blend` is the actual Blender 4.5.9 source for the M249 additions. It packs its images. The other weapons retain their existing authored meshes; their PBR edits and moving-component separation are deterministic asset-processing steps.

Rebuild from the project root, using Blender in background mode and Node.js:

1. Run `scripts/weapon-detail/upgrade-m249.py` through `blender --background --factory-startup --python`.
2. Run `node scripts/weapon-detail/pack-m249.mjs`.
3. Run `node scripts/weapon-detail/refine-pbr.mjs`.
4. Run `node scripts/weapon-detail/split-moving-parts.mjs`.

The Node scripts require Three.js and Sharp. They currently resolve Sharp from this workstation's bundled Codex Node runtime. Change that import to an installed `sharp` package when rebuilding elsewhere. No GUI or pointer capture is required.

`material-pass.json`, `dcc-report.json`, `moving-part-anchors.json` and `runtime-part-anchors.json` record the transformations and measured parts. `v0.5/weapon.js` and `weapon-variants.js` are an immutable snapshot used for the asset comparison harness; the live first-person animation implementation is maintained under `src/` and may have advanced after this asset handoff.

Attribution and limitations are recorded in `artifacts/model-upgrade-v0.5/weapon-changes.md` and the project `ASSET-SOURCES.md`. Original authors and licenses remain attached to derivative assets. New additions are visual game art; they do not define functional weapon mechanisms.
