# 资源来源与署名 / Asset credits

Assets obtained on 2026-10-22 and 2026-10-23. The game bundles every resource locally and performs no runtime CDN requests. These are general game characters, not actor likenesses or verified reconstructions of named historical people.

## Newly generated MakeHuman characters — CC0 assets, CC BY military clothing

This project generated three new character bodies and facial shapes with **MakeHuman Community MPFB2 2.0.18**, running the official Python services in **Blender 4.5.9 LTS** in background mode. It did not run the standalone MakeHuman desktop application. These are newly parameterised meshes and rigs, not renamed copies of the earlier Sam character.

- Official MPFB source: https://github.com/makehumancommunity/mpfb2
- Official asset and output licensing: https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md
- Asset license: https://creativecommons.org/publicdomain/zero/1.0/
- Official system pack: https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html
- Download: https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip
- Runtime files: `makehuman-civilian.glb`, `makehuman-combatant.glb`, `makehuman-soldier.glb`.
- Editable source, profile JSON, export records and license copies: `character-sources/makehuman/`.
- Rebuild scripts: `scripts/makehuman/`.

The MakeHuman Community base mesh, morph targets, Mixamo-compatible rig/weights and system assets are CC0. System pack copyright notices name Data Collection AB, Joel Palmius and Jonas Hauquier, with additional authors credited in the source asset files. Used assets: young_caucasian_male and middleage_african_male skin textures, low-poly eyes, eyebrow001, short01 hair, male_casualsuit01 shirt/jeans, male_casualsuit05 jacket/jeans and shoes03. MPFB program code is GPL; the project's generated mesh output is governed by the separate CC0 asset terms.

Changes: new adult body proportions and facial targets; new Mixamo skeletons; narrower eyelid shape; natural brown iris derived from the official brownlight_eye texture; cropped hidden sock shafts; opaque skin/clothes and alpha-cut hair; embedded textures limited to 2K and encoded to WebP. Runtime supplies articulated walking, crouching, treatment, reload and collapse poses with planted feet and hand-to-weapon IK. The civilian wears an unbranded shirt; the armed opponent wears a jacket with an AK and no US helmet. These generic fictional faces do not depict film actors or named historical people.

The military character reuses the following separately licensed uniform and equipment, adapted to the new generated body proportions and rig:

**Military tactical suit (LowPolyGameReady)** by **DanlyVostok / 1799danly**.

- Original: https://sketchfab.com/3d-models/military-tactical-suit-lowpolygameready-ef698ce36b1545a78ce592dd3db4c7ed
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/
- Legal code: https://creativecommons.org/licenses/by/4.0/legalcode
- Adapted upstream GLB: https://github.com/cktang88/3d-fps/blob/main/public/assets/models/characters/soldier_tac.glb
- Upstream credits: https://github.com/cktang88/3d-fps#credits--licences

Upstream merged meshes and encoded textures to WebP. This project omits the old masked head, cap and headset, refits clothing/equipment to the new character, removes one malformed detached pouch, smooths knee weights and rigidly binds each corrected boot to its foot, supplies a newly generated MakeHuman head, and adds original fitted helmet geometry. Uniform/equipment retain CC BY 4.0 attribution; MakeHuman's CC0 license does not replace that license. The clothing is a general military reference, not a certified 1993 kit reconstruction. Attribution does not imply endorsement.

## v0.8 complete mounted-gun hands — MakeHuman CC0 derivative

Local file: `mounted-makehuman-hands.glb` (271,592 bytes; SHA-256 `22962e1766fc786e89f10b5017674de93ede05b91994898369c683ebe7b13db0`). This asset restores complete palms, fingers and cropped wrist/forearm sections from the preserved `character-sources/makehuman/soldier-fitted-source.blend` MakeHuman body, before the runtime body's hidden-surface removal. It is a derivative of the separately documented MakeHuman Community CC0 base mesh and weights, not a film/game asset or a new hand scan.

Rebuild script: `scripts/makehuman/export-mounted-hands.py`, run with Blender in background mode. The exporter crops anatomically rather than discarding vertices whose weights include forearm/twist bones, checks that palm and finger boundaries are closed, and exports the mesh with its 52-joint skin and original UVs. The GLB embeds no images or materials; `src/mounted-gunner-pose.js` maps the joints by name onto the existing soldier skeleton, verifies inverse bind matrices and reuses the existing skin material. Only the cropped forearm ends remain open, beneath the existing sleeves. It does not replace the character's uniform or the separately credited CC BY first-person weapon arms.

The source report is `artifacts/district-rebuild/mounted-hand-source.json`. The existing uniform and equipment by **DanlyVostok / 1799danly** remain **CC BY 4.0**, as credited above; the new hand mesh's CC0 terms do not relicense that clothing.

## M4A1 and first-person arms — CC BY 4.0

Local file: `m4a1-real.glb`. This self-contained model combines these credited works:

- **M4A1** by **Firewarden3D / Firewarden**: https://sketchfab.com/3d-models/m4a1-40d8ef818c7549a896371cbb1f64fec6
- **Fps arms** by **DJMaesen / bumstrum**: https://sketchfab.com/3d-models/fps-arms-9452ce4cddde4110a4fd73e555a8e412
- Arm rig and grip template, **FPS AK-74m animations** by **Cransh / ccransh**: https://sketchfab.com/3d-models/fps-ak-74m-animations-94be8385c402474cacd39bc096c6ca14
- License for all three: https://creativecommons.org/licenses/by/4.0/
- Adapted source: https://github.com/cktang88/3d-fps/blob/main/public/assets/models/fp/m4a1.glb
- Upstream credit and modification notes: https://github.com/cktang88/3d-fps#credits--licences

The upstream adaptation poses and rigs the arms, simplifies/rescales the weapon, bakes ambient occlusion, and encodes textures to WebP. This project embeds the two external arm textures into the GLB for offline loading and retains the embedded attribution. The asset has 27,769 rifle triangles and 14,852 arm triangles, with 1K PBR weapon textures. Runtime changes adjust view placement, scale, material response and animation. This is a general M4A1 reference, not a certified reconstruction of a specific 1993 carbine.

## M16A2 — CC BY 4.0

**M16 A2 Rifle** by **Luchador**. Local file: `m16a2-real.glb`.

- Original: https://sketchfab.com/3d-models/20c4bb925ca349c6b33aca176b8affba
- License: https://creativecommons.org/licenses/by/4.0/
- Public licensed archive: https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-008/20c4bb925ca349c6b33aca176b8affba.glb
- Exact-UID archive metadata: https://huggingface.co/datasets/allenai/objaverse/resolve/main/metadata/000-008.json.gz

The original author and CC BY 4.0 license are recorded in both the GLB and archive metadata. This project normalizes the model to approximately one metre, turns its muzzle to -Z with +Y up, preserves UVs and normals, moderates specular response, and encodes the three original 1024-pixel PBR images as WebP without artificial upscaling. The model contains 30,821 triangles and four mesh draws. The first-person view fits the separately credited DJMaesen / Cransh gloves and arms to the handguard. This is an authored game model, not a scan or manufacturer-certified replica.

## M249 — CC BY 4.0

**M249 light machine gun** by **AK / skaf13**. Local file: `m249-real.glb`.

- Original: https://sketchfab.com/3d-models/m249-light-machine-gun-75cacc16a52640c7adb100d7294da244
- Author: https://sketchfab.com/skaf13
- License: https://creativecommons.org/licenses/by/4.0/
- Public licensed archive: https://huggingface.co/datasets/allenai/objaverse/resolve/main/glbs/000-096/75cacc16a52640c7adb100d7294da244.glb

The source file embeds the original author, model URL and CC BY 4.0 license, which were also verified against the original Sketchfab API. This project preserves the original UV/PBR detail, removes the optical sight and upper mounting rail, folds the bipod for carrying, normalizes the total length to approximately 1.04 metres, and repackages its three 1024-pixel PBR images as WebP. The v0.5 adapted machine gun contains 24,827 triangles in ten mesh draws, including the project-authored additions described below. The source painted its rear aperture on a solid blade and omitted a central front sight post; this project replaces that small rear blade with a genuinely open steel aperture and adds the front post, with measured sight and muzzle landmarks for aiming. v0.5 replaces the earlier global roughness floor with material-specific roughness that preserves the source metal mask and local wear. A project-authored cloth ammunition pouch, straps, stitches, short decorative linked belt and recessed muzzle bore are now present; these are original modeled additions, not scans. Body, AmmoContainer and FeedBelt are separate moving assemblies. A complete feed cover and receiver interior have not been modeled. Its stock and other details are a general M249 reference, not an exact 1993 configuration. The first-person arms retain the separate CC BY attribution above.

## Weathered AKM — CC0 1.0

**AKM** by **LonesomeDucky**. Local file: `akm-real.glb`.

- Original author upload and license declaration: https://opengameart.org/content/akm
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Original Blender file: https://opengameart.org/sites/default/files/akm54.blend

The packed Blender source includes an independently authored AKM mesh with wooden furniture and base-color, metallic, normal, roughness and AO maps. The runtime derivative normalizes real-world scale and orientation, preserves source UVs and vertex normals, and embeds the required PBR maps at up to 2048 pixels. The weapon is not derived from the M4 model. The separately credited first-person arm and glove geometry remains CC BY 4.0 even though the AKM itself is CC0.

## MP5 and M1911 — CC BY 4.0

**MP5 Submachine Gun** by **Rotuma**. Local file: `mp5-real.glb`.

- Original: https://sketchfab.com/3d-models/mp5-submachine-gun-a73b61932a0e4eecb5db5c63c158aa24
- Author: https://sketchfab.com/Rotuma
- Adapted public source: https://github.com/cktang88/3d-fps/blob/main/public/assets/models/fp/mp5a5.glb

**M1911 pistol** by **egorbelous**. Local file: `m1911-real.glb`.

- Original: https://sketchfab.com/3d-models/m1911-pistol-80a0b8a6c4314da4a7b3a7cfe6cec1d4
- Author: https://sketchfab.com/egorbelous
- Adapted public source: https://github.com/cktang88/3d-fps/blob/main/public/assets/models/fp/m1911.glb
- License for both firearm models: https://creativecommons.org/licenses/by/4.0/
- Upstream modification and attribution record: https://github.com/cktang88/3d-fps#credits--licences

The upstream adaptations retain the authored firearm meshes and PBR maps, remove some maker marks, and supply separately credited DJMaesen / Cransh hands, sleeves and contact poses. This project embeds the two previously external arm images, normalizes each model to metres, uses each weapon's own authored grip pose, calibrates muzzle/iron-sight positions, and fits the off-screen sleeve ends without moving the pistol fingers. The resulting GLBs each contain nine embedded 1024-pixel WebP images with no network dependencies. MP5 gun geometry has 14,248 triangles; M1911 gun geometry has 11,061; each arm mesh has approximately 14,852. The fixed-stock MP5 is deliberately labelled MP5 rather than the upstream filename's A5 designation. Source license metadata was verified on 2026-10-23. Attribution does not imply creator endorsement.

These five authored firearm assets replace the earlier original procedural M249 and AK prototypes. No manufacturer photography is packaged as a texture. The FN product material and Small Arms Survey / Royal Armouries identification sheets were used only as visual and historical references; their photographs are not redistributed.

## UH-60 Black Hawk — CC BY 4.0

**Sikorsky UH-60 Black Hawk** by **helijah**.

- Original: https://sketchfab.com/3d-models/sikorsky-uh-60-black-hawk-ee81eb66006b4d8980d0cf9ff6304b69
- Author: https://sketchfab.com/helijah
- License: https://creativecommons.org/licenses/by/4.0/
- Adapted source: https://github.com/cktang88/3d-fps/blob/main/public/assets/ambience/models/uh60/uh60.glb
- Upstream provenance: https://github.com/cktang88/3d-fps/blob/main/public/assets/ambience/models/uh60/SOURCE.md
- Local file: `uh60-blackhawk.glb`.

The source adaptation resizes textures to at most 512 px and encodes them to WebP. This project retains the original embedded author/license metadata. Runtime integration adjusts scale, orientation, material response, rotor animation and damaged presentation. The asset contains 85,604 triangles and includes cockpit/cabin geometry. It is not a manufacturer-certified technical replica.

Original creator names and CC BY 4.0 license URLs for the rifle, arms, arm rig and helicopter were verified against the public Sketchfab model API on 2026-10-22. Attribution does not imply endorsement.

## Destroyed car — CC BY 4.0

**Destroyed Ford Crown Vic** by **alexdelker**.

- Original: https://sketchfab.com/3d-models/destroyed-ford-crown-vic-1506140c97654d759cc4c60c20d1d2a8
- Author: https://sketchfab.com/alexdelker
- License: https://creativecommons.org/licenses/by/4.0/
- Adapted source: https://github.com/cktang88/3d-fps/blob/main/public/assets/ambience/models/burnt_car/burnt_car.glb
- Upstream provenance and conversion notes: https://github.com/cktang88/3d-fps/blob/main/public/assets/ambience/models/burnt_car/SOURCE.md
- Local file: `burnt-car.glb`.

The upstream adaptation simplifies the photographed wreck mesh and encodes its colour texture to WebP. The shipped GLB retains its embedded author and license metadata, contains 23,684 triangles and one 1024-pixel scan colour texture, and is approximately 2.6 MB. Runtime integration may remove the surrounding scan floor, adjust orientation/scale and replace the source unlit material with a rough physical material while preserving the scan texture. It is a destroyed civilian car, not a Humvee model. Original creator and license were checked using the public Sketchfab model API. Attribution does not imply endorsement.

## Architectural window, door and cornice modules — CC0 1.0

**Modular Urban Apartments Facade** by **James Ray Cock**, published by **Poly Haven**.

- Original: https://polyhaven.com/a/modular_urban_apartments_facade
- Official download metadata: https://api.polyhaven.com/files/modular_urban_apartments_facade
- License: https://polyhaven.com/license and https://creativecommons.org/publicdomain/zero/1.0/
- Local files: `urban-facade.glb` and `urban-facade-manifest.json`.

This project extracts seven independent window, door and cornice modules from the 147-module library, removes unused geometry/materials/textures, centres the visible modules horizontally, and embeds the nine required 2048-pixel textures as WebP. The selected modules contain 7,722 triangles and four shared materials; the GLB is approximately 7.8 MB. The separate manifest records names, metre-scale bounds and orientation. Window/door inserts contain their frames, panels and separate glass material without a surrounding plaster wall. Runtime integration may merge repeated meshes, vary material tint and omit selected glass or panels for damaged architecture. These are authored architectural modules, not a scan of the historical location.

## Physically based environment textures — CC0

Poly Haven textures: https://polyhaven.com/license

- Plastered Wall 02: https://polyhaven.com/a/plastered_wall_02
- Broken Wall: https://polyhaven.com/a/broken_wall
- Red Brick 03: https://polyhaven.com/a/red_brick_03
- Aerial Asphalt 01: https://polyhaven.com/a/aerial_asphalt_01
- Dry Riverbed Rock: https://polyhaven.com/a/dry_riverbed_rock
- Rubble, by Amal Kumar: https://polyhaven.com/a/rubble

Each of these six sets uses 2K diffuse, OpenGL normal and roughness JPGs obtained using the official https://api.polyhaven.com/files/ API and dl.polyhaven.org file service.

## Original geometry and surface work

Base city architecture, additional window and shutter details, utility poles, sagging wires, fictional shop signs, rubble placement, sandbags, original vehicle and prop geometry, procedural fabric, helmet cover, grime/crack overlays and smoke/fire effects are authored for this project in its source modules. The separately credited facade inserts, destroyed car, helicopter and rifle are external assets.

Ground vehicles use real-world-inspired proportions and are not manufacturer-certified technical replicas. The destroyed civilian car, helicopter and rifle use the separately credited assets above.

### Original HMMWV and 6×6 cargo-truck reconstruction (v0.7)

The intact convoy vehicles in `src/vehicle-models.js`, their paint/canvas surface maps, simple distant crews and moving-wheel rigs are original project work. They replace the earlier generic rescue SUV; no third-party vehicle GLB, manufacturer CAD, film still or photographic vehicle texture is embedded. The separately credited `burnt-car.glb` remains a destroyed civilian sedan.

The first model follows the low, wide HMMWV gun-carrier silhouette: approximately 4.84 m long, 2.16 m body width and 1.85 m roof height, with a separate ring-mounted visual machine gun. The second is a separately constructed **M35A2 film-style 6×6 cargo truck**, approximately 7.10 m long with a separate cab, dual rear tyres, troop benches and a partial canvas canopy. Both have olive/sand variants, independent wheel rotation/steering, cabin seating and crew hand/foot anchors. These are artistic game models, not manufacturer-certified technical replicas, complete mechanical reproductions or scans.

Historical distinction: Timothy M. Karcher's U.S. Army monograph records nine HMMWVs and three **five-ton trucks** in the original extraction convoy (printed p.39 / PDF p.43). The M35A2 family represented by this game's exterior is **2½-ton**, and must not be relabelled as a historically exact M939 five-ton vehicle. The film production notes describe twelve mixed Humvees/trucks and a three-vehicle casualty detachment. Gameplay relief-convoy counts are a bounded representation, not the full historical multinational relief force.

- Historical account: https://www.govinfo.gov/content/pkg/GOVPUB-D110-PURL-LPS58359/pdf/GOVPUB-D110-PURL-LPS58359.pdf
- Film production notes: https://www.cinema.com/articles/732/black-hawk-down-production-notes.phtml
- HMMWV shape references: https://nara.getarchive.net/media/a-front-view-of-a-us-army-m998-high-mobility-multipurpose-wheeled-vehicle-equipped-4e5376 and https://warwheels.net/HummerM998Charvat.html
- M35A2 exterior references: https://www.easternsurplus.net/GalleryDetails/427/Restored-M35A2-with-Winch and https://www.easternsurplus.net/PartDetails/127/M35-270-CargoCover-Green-12-feet-long-Vinyl-M35A2

These links are reference material only; their photographs are not redistributed. Model changes, reference limitations, API and hidden-render validation are recorded in `artifacts/vehicle-rebuild/`.

No film footage, film score, film stills or actor likeness assets are embedded.

## v0.5 model and articulated-hand derivatives

M16A2 preserves its original triangle count and UVs, with Magazine, EjectionPortCover and BoltCarrier exposed as separate source components. AKM preserves every original triangle and its UVs, separating the connected Magazine and ChargingHandle components. MP5, M1911 and M4A1 retain their existing gun geometry and moving parts. All six preserve their original albedo/normal/metal/AO details; roughness responds separately to exposed metal and nonmetal regions. AKM remains 2K; other original gun texture atlases remain 1K. Added M249 pouch textures are 1K.

The first-person arms retain the 68-joint source skin, authored weights and textures, with independently posed fingers, wrist controls and two-segment elbow IK. The project adds continuous reload choreography and magazine/container transforms, plus runtime fitting of the upper sleeves. The original arm authors and CC BY attribution remain as credited above. No original full reload clip or motion capture is claimed. M249 loading is a simplified game animation without a complete feed-cover mechanism.

MakeHuman characters retain their 52-joint skeletons, UVs and skin weights. Added skin normal maps (2K) derive restrained surface detail from the existing licensed skin texture; regional roughness maps are 512px. Eye shading and eyebrow alpha edges were refined. The soldier's collar and the hidden neck boundary were fitted locally. No photogrammetric skin scan, new facial performance capture or full clothing rebuild is claimed. Reproducible source derivatives are in character-sources/makehuman/v0.5.

Original near-field environment geometry now includes folded cabinet edges and drawers, lathed tire profiles with tread, cart axles/hubs/spokes and thick broken plaster/brick wall faces. Additional procedural wood, paint and rubber surfaces are authored in this project. The separately credited external texture and model licenses remain unchanged. Editable weapon additions are in weapon-sources/v0.5; the previous environment baseline is in environment-sources/v0.4-baseline.
## v0.6 geometry, interaction and effects work

AKM remains a derivative of LonesomeDucky's CC0 Weathered AKM; the wooden stock was rebuilt with curved sections, the furniture and receiver receive selective bevels, and the original wood UVs and all moving-node transforms are preserved. M249 remains a CC BY 4.0 derivative of AK / skaf13's credited source; its stock, rubber buttpad, cloth ammunition bag and fitted webbing were rebuilt. Original receiver/sight/feed components remain. Blender sources, generated surface maps, original baseline and node contracts are in weapon-sources/v0.6.

The PASGT-style helmet, cover pattern, edge band, seams, flat straps and buckles are original project geometry/textures; pasgt-field-helmet.glb has 15,836 triangles. Sources are in character-sources/makehuman/v0.6. The existing soldier's three clothing meshes receive local refinement, preserving its original 52-bone hierarchy; other character meshes and civilian/enemy files retain their prior licenses. This is an artistic equipment model, not a certified historical replica or museum scan.

Six original near-field ruined buildings now use thick pierced walls, floor layers, columns, beams and interior partitions; surface work derives from the CC0 Poly Haven texture sets credited above, with matching albedo/normal/roughness crops. The v0.5 baseline is in environment-sources/v0.5-baseline. The new supply cases, flashlight beam texture, combat particles, decals, tactical smoke and audio synthesis are original source-code assets. No new commercial music, film media, actor likenesses or unlicensed audio were added.


## 0.6 直升机声音素材

新增 `public/audio/rotor-loop.wav`，由 ezwa 的公开领域实地直升机录音剪辑、去直流、滤波及循环交叉淡化生成，6秒/48kHz单声道。来源、作者许可、原始OGG、处理步骤与SHA-256完整列于 `AUDIO-SOURCES.md`，可编辑来源位于 `audio-sources/v0.6/`。该原录音未标明机型，不称作UH-60或1993年战斗现场录音；枪声、爆炸与其余增强层仍为本项目原创合成。
