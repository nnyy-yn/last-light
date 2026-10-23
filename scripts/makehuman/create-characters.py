"""Reproducible MakeHuman/MPFB character construction, run with Blender -b."""
import os, sys, json, pathlib, hashlib, zipfile
import bpy, bmesh, numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / "tools/models/makehuman/mpfb2-master/src"
ASSETS = ROOT / "tools/models/makehuman/system-assets"
WORK = ROOT / "tools/models/makehuman/workspace"
OUT = ROOT / "character-sources/makehuman"
OUT.mkdir(parents=True, exist_ok=True)
WORK.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(SOURCE))
# Source-checkout registration has no Blender extension repository namespace.
# Keep every cache/config path in this project, rather than the user's profile.
original_extension_path_user = bpy.utils.extension_path_user
def project_extension_path(package, path="", create=False):
    if package == "mpfb":
        target = WORK / path
        if create: target.mkdir(parents=True, exist_ok=True)
        return str(target)
    return original_extension_path_user(package, path=path, create=create)
bpy.utils.extension_path_user = project_extension_path
original_resource_path = bpy.utils.resource_path
bpy.utils.resource_path = lambda kind, **kwargs: str(WORK) if kind == "USER" else original_resource_path(kind, **kwargs)
import addon_utils
bpy.context.preferences.addons.new().module = "mpfb"
addon_utils.enable("mpfb", default_set=False, persistent=False)
import mpfb
from mpfb.services.humanservice import HumanService
from mpfb.services.targetservice import TargetService
from mpfb.services.locationservice import LocationService
from mpfb.services.exportservice import ExportService
from mpfb.services.objectservice import ObjectService
LocationService._user_data = str(ASSETS)
LocationService._user_config = str(WORK / "config")
pathlib.Path(LocationService._user_config).mkdir(parents=True, exist_ok=True)
TARGETS = SOURCE / "mpfb/data/targets"

PROFILES = {
    "civilian": {
        "gender": 1.0, "age": .58, "muscle": .43, "weight": .48, "height": .48,
        "proportions": .55, "race": {"african": .94, "caucasian": .04, "asian": .02},
        "skin": "middleage_african_male/middleage_african_male.mhmat",
        "targets": {"head/head-oval": .20, "chin/chin-prominent-incr": .12,
            "nose/nose-scale-vert-incr": .10, "neck/neck-scale-horiz-decr": .08,
            "torso/torso-scale-horiz-decr": .10, "head/head-age-incr": .13}},
    "soldier": {
        "gender": 1.0, "age": .53, "muscle": .70, "weight": .55, "height": .57,
        "proportions": .58, "race": {"african": .13, "caucasian": .83, "asian": .04},
        "skin": "young_caucasian_male/young_caucasian_male.mhmat",
        "targets": {"head/head-square": .26, "chin/chin-width-incr": .12,
            "chin/chin-prominent-incr": .08, "nose/nose-scale-depth-incr": .10,
            "neck/neck-scale-horiz-incr": .12, "torso/torso-vshape-incr": .12}},
    "combatant": {
        "gender": 1.0, "age": .61, "muscle": .53, "weight": .42, "height": .44,
        "proportions": .49, "race": {"african": .90, "caucasian": .06, "asian": .04},
        "skin": "middleage_african_male/middleage_african_male.mhmat",
        "targets": {"head/head-square": .14, "chin/chin-width-incr": .10,
            "nose/nose-scale-depth-incr": .08, "neck/neck-scale-horiz-decr": .06,
            "torso/torso-scale-horiz-decr": .06, "head/head-age-incr": .10}}
}

def source_asset(subdir, filename):
    matches = list((ASSETS / subdir).rglob(filename))
    if not matches: raise FileNotFoundError(subdir + "/" + filename)
    return str(matches[0])

def create_character(kind):
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False)
    definition = PROFILES[kind]
    macro = TargetService.get_default_macro_info_dict()
    for key in macro:
        if key in definition: macro[key] = definition[key]
    human = HumanService.create_human(macro_detail_dict=macro)
    human.name = "MakeHuman_" + kind + "_body"
    for side in ("l", "r"):
        TargetService.load_target(human, str(TARGETS / ("eyes/" + side + "-eye-height2-decr.target.gz")), weight=.16)
    for target, weight in definition["targets"].items():
        filename = TARGETS / (target + ".target.gz")
        if not filename.exists(): raise FileNotFoundError(filename)
        TargetService.load_target(human, str(filename), weight=weight)
    HumanService.set_character_skin(str(ASSETS / "skins" / definition["skin"]), human, skin_type="GAMEENGINE")
    rig = HumanService.add_builtin_rig(human, "mixamo")
    rig.name = "MakeHuman_" + kind + "_rig"
    assets = [("eyes", "low-poly.mhclo", "Eyes"), ("eyebrows", "eyebrow001.mhclo", "Eyebrows"), ("hair", "short01.mhclo", "Hair")]
    if kind in ("civilian", "combatant"):
        clothes = "male_casualsuit01.mhclo" if kind == "civilian" else "male_casualsuit05.mhclo"
        assets += [("clothes", clothes, "Clothes"), ("clothes", "shoes03.mhclo", "Clothes")]
    for subdir, filename, asset_type in assets:
        item = HumanService.add_mhclo_asset(source_asset(subdir, filename), human, asset_type=asset_type, subdiv_levels=0, material_type="GAMEENGINE")
        item.name = "MakeHuman_" + kind + "_" + asset_type + "_" + pathlib.Path(filename).stem
        if filename == "shoes03.mhclo":
            # Socks belong under the trouser leg; remove only the hidden calf tube.
            bm=bmesh.new(); bm.from_mesh(item.data)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if (item.matrix_world @ v.co).z > .15], context="VERTS")
            bm.to_mesh(item.data); bm.free()
        if asset_type == "Eyes":
            for mat in item.data.materials:
                for node in mat.node_tree.nodes:
                    if node.type != "TEX_IMAGE" or not node.image: continue
                    image=node.image.copy(); image.name=kind+"_natural_brown_eyes"
                    pixels=np.array(image.pixels[:],dtype=np.float32).reshape((-1,4))
                    iris=(pixels[:,0]>pixels[:,1]*1.45)&(pixels[:,0]>.05)
                    pixels[iris,0]*=.42;pixels[iris,1]*=.65;pixels[iris,2]*=.8
                    image.pixels=pixels.ravel(); image.pack(); node.image=image
    for obj in [human, *ObjectService.get_list_of_children(rig)]:
        if obj.type != "MESH": continue
        for material in obj.data.materials:
            if not material or not material.use_nodes: continue
            bsdf = next((node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
            if not bsdf: continue
            bsdf.inputs["Roughness"].default_value = .78 if obj == human else .9
            bsdf.inputs["Metallic"].default_value = 0
            if "Hair" not in obj.name and "Eyebrows" not in obj.name:
                for link in list(bsdf.inputs["Alpha"].links): material.node_tree.links.remove(link)
                bsdf.inputs["Alpha"].default_value = 1
            material.use_backface_culling = True
    HumanService.serialize_to_json_file(human, str(OUT / (kind + ".human.json")))
    # Keep photographic texels but cap the runtime atlas at 2K for the WebGL build.
    for image in bpy.data.images:
        if image.size[0] > 2048 or image.size[1] > 2048:
            scale = 2048 / max(image.size)
            image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT / (kind + "-source.blend")))
    print("MAKEHUMAN_SOURCE_SAVED", kind, len(human.data.vertices), len(rig.data.bones))
    export_rig = ExportService.create_character_copy(human, name_suffix="_export")
    export_human = ObjectService.find_object_of_type_amongst_nearest_relatives(export_rig, "Basemesh")
    bpy.ops.object.select_all(action="DESELECT"); export_human.select_set(True); bpy.context.view_layer.objects.active = export_human
    if export_human.data.shape_keys: bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    ExportService.bake_modifiers_remove_helpers(export_human, bake_masks=True, bake_subdiv=True, remove_helpers=True, also_proxy=True)
    bpy.ops.object.select_all(action="DESELECT")
    export_rig.select_set(True)
    for item in ObjectService.get_list_of_children(export_rig): item.select_set(True)
    bpy.context.view_layer.objects.active = export_rig
    bpy.ops.export_scene.gltf(filepath=str(OUT / (kind + "-generated.glb")), export_format="GLB", use_selection=True, export_animations=False, export_apply=False, export_extras=True)
    print("MAKEHUMAN_GLB_SAVED", kind)

for character in (sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else ["civilian", "soldier"]): create_character(character)
archive = ROOT / "tools/models/makehuman/mpfb2-master.zip"
provenance = {"tool": "MakeHuman MPFB2", "version": mpfb.VERSION, "blender": bpy.app.version_string, "source": "https://github.com/makehumancommunity/mpfb2", "profiles": PROFILES,
    "commonAdjustments": {"eyelidTarget": "eyes/{l,r}-eye-height2-decr", "eyelidWeight": .16, "iris": "red-dominant iris pixels: R*.42 G*.65 B*.8", "shoeCropZ": .15, "maxTexturePixels": 2048}}
if archive.exists():
    with zipfile.ZipFile(archive) as source_zip: commit=source_zip.comment.decode("utf8")
    provenance["sourceArchive"]={"url":"https://codeload.github.com/makehumancommunity/mpfb2/zip/refs/heads/master", "bytes":archive.stat().st_size, "sha256":hashlib.sha256(archive.read_bytes()).hexdigest(), "gitCommit":commit}
(OUT / "build-provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf8")
