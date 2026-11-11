"""Stands MPFB mannequins in the poses of test-city scenes and renders what an image generator needs:
a depth map, one mask per figure, a plain preview, and the joints projected to the picture.

  blender --background --python pose3d.py -- scenes3d.json outDir [scene ...] [--az=35] [--el=8] [--size=832x1216]

scenes3d.json comes from `pnpm exec tsx tools/pose3d-export.ts`. No scene names = all of them.
The scenes are side views (x ahead, y up); here that plane is X/Z and the camera walks round it by --az degrees.
"""
import bpy, sys, os, json, math, addon_utils
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = {a[2:].split("=")[0]: a.split("=", 1)[1] for a in argv if a.startswith("--") and "=" in a}
args = [a for a in argv if not a.startswith("--")]
SRC, OUT, WANT = args[0], args[1], args[2:]
AZ = float(opts.get("az", 35)); EL = float(opts.get("el", 8))
W, H = (int(v) for v in opts.get("size", "832x1216").split("x"))
os.makedirs(OUT, exist_ok=True)

addon_utils.enable("bl_ext.blender_org.mpfb", default_set=True)
from bl_ext.blender_org.mpfb.services.humanservice import HumanService
from bl_ext.blender_org.mpfb.services.targetservice import TargetService
from bl_ext.blender_org.mpfb.services.rigservice import RigService
from bl_ext.blender_org.mpfb.services.locationservice import LocationService
from bl_ext.blender_org.mpfb.entities.rig import Rig

data = json.load(open(SRC, encoding="utf-8"))
UNIT = data["unit"]
RIGS = os.path.join(LocationService.get_mpfb_data(), "rigs", "standard")

# What each role looks like as a mannequin. The guest is big and plain; the picture model does the rest.
BODY = {
    "wife": dict(gender=0.0, muscle=0.4, weight=0.4, height=0.45, proportions=0.85, cupsize=0.65, firmness=0.7),
    "patron": dict(gender=1.0, muscle=0.7, weight=0.6, height=0.8, proportions=0.6),
    "husband": dict(gender=1.0, muscle=0.35, weight=0.5, height=0.45, proportions=0.5),
}
THICK = {"patron": 0.030, "husband": 0.017, "wife": 0.020}  # radius of what he has / what she holds, m
COLOR = {"wife": (0.85, 0.3, 0.5, 1), "patron": (0.8, 0.55, 0.2, 1), "husband": (0.25, 0.45, 0.8, 1)}

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("bl_ext.blender_org.mpfb", default_set=True)

def to3(p, y=0.0):
    return Vector((p[0] * UNIT, y, p[1] * UNIT))

def make_figure(fig):
    macro = TargetService.get_default_macro_info_dict()
    macro.update(BODY.get(fig["role"], BODY["husband"]))
    mesh = HumanService.create_human(scale=0.1, macro_detail_dict=macro, feet_on_ground=True)
    rig = Rig.from_json_file_and_basemesh(os.path.join(RIGS, "rig.game_engine.json"), mesh)
    arm = rig.create_armature_and_fit_to_basemesh()
    mesh.parent = arm
    RigService.load_weights([arm], mesh, os.path.join(RIGS, "weights.game_engine.json"))
    bpy.context.view_layer.update()
    # size: the figure's own standing height in the scene against the mannequin's
    want = 95.5 * fig["scale"] * UNIT
    have = max((arm.matrix_world @ b.tail_local).z for b in arm.data.bones) - min((arm.matrix_world @ b.head_local).z for b in arm.data.bones)
    arm.scale = (want / have,) * 3
    arm.rotation_euler = (0, 0, math.radians(-90 if fig["flip"] else 90))  # the mannequin faces -Y; the scene wants +X or -X
    bpy.context.view_layer.update()
    return arm, mesh

def head_w(arm, name):
    return arm.matrix_world @ arm.pose.bones[name].head
def tail_w(arm, name):
    return arm.matrix_world @ arm.pose.bones[name].tail

def aim(arm, bone, end_now, target):
    """Turns a bone about its head so that the point end_now (world) swings toward target (world)."""
    pb = arm.pose.bones[bone]
    head = arm.matrix_world @ pb.head
    a = end_now - head; b = target - head
    if a.length < 1e-6 or b.length < 1e-6: return
    q = a.rotation_difference(b)
    world = arm.matrix_world @ pb.matrix
    new = Matrix.Translation(head) @ q.to_matrix().to_4x4() @ Matrix.Translation(-head) @ world
    pb.matrix = arm.matrix_world.inverted() @ new
    bpy.context.view_layer.update()

def pose(arm, fig):
    j = fig["j"]
    # the pelvis goes where the scene puts it
    arm.location += to3(j["pelvis"]) - Vector((head_w(arm, "pelvis").x, 0, head_w(arm, "pelvis").z)) - Vector((0, head_w(arm, "pelvis").y, 0)) * 0
    bpy.context.view_layer.update()
    here = head_w(arm, "pelvis")
    arm.location += Vector((to3(j["pelvis"]).x - here.x, 0, to3(j["pelvis"]).z - here.z))
    bpy.context.view_layer.update()
    # trunk, then head
    aim(arm, "pelvis", head_w(arm, "neck_01"), to3(j["neck"], head_w(arm, "neck_01").y))
    aim(arm, "neck_01", tail_w(arm, "head"), to3(j["head"], tail_w(arm, "head").y) + (tail_w(arm, "head") - head_w(arm, "head")) * 0.5)
    for side, s in (("R", "r"), ("L", "l")):
        # each limb stays in its own plane beside the body: the scene only knows ahead and up
        y = head_w(arm, f"upperarm_{s}").y
        aim(arm, f"upperarm_{s}", head_w(arm, f"lowerarm_{s}"), to3(j[f"elbow{side}"], y))
        aim(arm, f"lowerarm_{s}", head_w(arm, f"hand_{s}"), to3(j[f"hand{side}"], y))
        y = head_w(arm, f"thigh_{s}").y
        aim(arm, f"thigh_{s}", head_w(arm, f"calf_{s}"), to3(j[f"knee{side}"], y))
        aim(arm, f"calf_{s}", head_w(arm, f"foot_{s}"), to3(j[f"foot{side}"], y))

def tube(name, pts, radius, y=0.0):
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"; cu.bevel_depth = radius; cu.bevel_resolution = 6; cu.use_fill_caps = True
    sp = cu.splines.new("NURBS"); sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts): p.co = (*to3(q, y), 1)
    sp.use_endpoint_u = True; sp.order_u = min(4, len(pts))
    ob = bpy.data.objects.new(name, cu); bpy.context.scene.collection.objects.link(ob)
    return ob

def flat(name, color):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); em = nt.nodes.new("ShaderNodeEmission")
    em.inputs[0].default_value = color; nt.links.new(em.outputs[0], out.inputs[0])
    return m

def depth_mat(near, far):
    m = bpy.data.materials.new("depth"); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial"); em = nt.nodes.new("ShaderNodeEmission")
    cam = nt.nodes.new("ShaderNodeCameraData"); mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs[1].default_value = near; mr.inputs[2].default_value = far; mr.inputs[3].default_value = 1.0; mr.inputs[4].default_value = 0.08
    nt.links.new(cam.outputs["View Z Depth"], mr.inputs[0]); nt.links.new(mr.outputs[0], em.inputs[0]); nt.links.new(em.outputs[0], out.inputs[0])
    return m

def lit(name, color):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf: bsdf.inputs["Base Color"].default_value = color; bsdf.inputs["Roughness"].default_value = 0.7
    return m

def paint(objs, mat):
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(mat)

def render(path, mode="BW"):
    sc = bpy.context.scene
    sc.render.filepath = path; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = mode
    bpy.ops.render.render(write_still=True)

def run(scene_id):
    clear()
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"; sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"; sc.render.film_transparent = False
    try: sc.eevee.taa_render_samples = 16
    except Exception: pass
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    figs = []
    for fig in data["scenes"][scene_id]:
        arm, mesh = make_figure(fig)
        pose(arm, fig)
        parts = [mesh]
        for e in fig["extras"]:
            parts.append(tube(f'{fig["role"]}_{e["kind"]}', e["pts"], THICK.get(fig["role"], 0.02) * (0.8 if e["kind"] == "toy" else 1)))
        figs.append((fig, arm, parts))
    bpy.context.view_layer.update()
    # the camera frames her: three quarters round, a little above
    wife = next((f for f in figs if f[0]["role"] == "wife"), figs[0])
    pts = [arm.matrix_world @ b.head for f, arm, _ in figs for b in arm.pose.bones]
    wpts = [wife[1].matrix_world @ b.head for b in wife[1].pose.bones] + [wife[1].matrix_world @ wife[1].pose.bones["head"].tail]
    centre = sum(wpts, Vector()) / len(wpts)
    cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 50; cam = bpy.data.objects.new("cam", cam_data); sc.collection.objects.link(cam); sc.camera = cam
    az, el = math.radians(AZ), math.radians(EL)
    direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
    dist = 2.0
    for _ in range(40):
        cam.location = centre + direction * dist
        cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
        bpy.context.view_layer.update()
        uv = [world_to_camera_view(sc, cam, p) for p in wpts]
        if all(0.1 <= u.x <= 0.9 and 0.07 <= u.y <= 0.9 for u in uv): break
        dist *= 1.07
    depths = [(cam.matrix_world.inverted() @ p).z * -1 for p in pts]
    near, far = max(0.1, min(depths) - 0.35), max(depths) + 0.6
    cam_data.clip_start = 0.05; cam_data.clip_end = far + 5
    base = os.path.join(OUT, scene_id)
    # 1. preview: lit, one colour per role
    bg.inputs[0].default_value = (0.06, 0.06, 0.07, 1); bg.inputs[1].default_value = 1.0
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5; sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, cam.rotation_euler.z + math.radians(25))
    for fig, arm, parts in figs: paint(parts, lit("lit_" + fig["role"], COLOR.get(fig["role"], (0.6, 0.6, 0.6, 1))))
    render(base + ".preview.png", "RGB")
    sun.hide_render = True
    bg.inputs[0].default_value = (0, 0, 0, 1)
    # 2. depth: near is white, far is dark, nothing is black
    dm = depth_mat(near, far)
    for fig, arm, parts in figs: paint(parts, dm)
    render(base + ".depth.png")
    # 3. one mask per figure
    white, black = flat("white", (1, 1, 1, 1)), flat("black", (0, 0, 0, 1))
    for i, (fig, arm, parts) in enumerate(figs):
        for k, (_, _, other) in enumerate(figs): paint(other, white if k == i else black)
        render(f'{base}.mask-{i}-{fig["role"]}.png')
    # 4. the joints as the picture sees them, in OpenPose order
    order = ["head", "neck_01", "upperarm_r", "lowerarm_r", "hand_r", "upperarm_l", "lowerarm_l", "hand_l", "thigh_r", "calf_r", "foot_r", "thigh_l", "calf_l", "foot_l"]
    out = {"scene": scene_id, "width": W, "height": H, "az": AZ, "el": EL, "figures": []}
    for fig, arm, parts in figs:
        kp = []
        for name in order:
            p = tail_w(arm, "head") if name == "head" else head_w(arm, name)
            u = world_to_camera_view(sc, cam, p)
            kp.append([round(u.x * W, 1), round((1 - u.y) * H, 1)])
        out["figures"].append({"role": fig["role"], "keypoints": kp})
    json.dump(out, open(base + ".pose.json", "w"))
    print("DONE", scene_id, "dist", round(dist, 2), "near", round(near, 2), "far", round(far, 2))

for sid in (WANT or list(data["scenes"])):
    if sid not in data["scenes"]:
        print("UNKNOWN", sid); continue
    try: run(sid)
    except Exception as e:
        import traceback; traceback.print_exc(); print("FAILED", sid, e)
