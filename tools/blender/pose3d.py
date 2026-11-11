"""Stands MPFB mannequins in the poses of test-city scenes and renders what an image generator needs:
a depth map, one mask per figure, a plain preview, and the joints projected to the picture.
Figures get room in depth (legs apart where someone is between them, `side` offsets), a floor, seats and beds,
and the camera goes to the side from which every figure is seen best.

  blender --background --python pose3d.py -- scenes3d.json outDir [scene ...] [--az=auto|35] [--el=8] [--size=832x1216] [--orient=auto|fixed] [--margin=0.07]

scenes3d.json comes from `pnpm exec tsx tools/pose3d-export.ts`. No scene names = all of them.
The scenes are side views (x ahead, y up); here that plane is X/Z and the camera walks round it by --az degrees.
"""
import bpy, sys, os, json, math, addon_utils, tempfile
import numpy as np
from mathutils import Vector, Matrix
from bpy_extras.object_utils import world_to_camera_view

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
opts = {a[2:].split("=")[0]: a.split("=", 1)[1] for a in argv if a.startswith("--") and "=" in a}
args = [a for a in argv if not a.startswith("--")]
SRC, OUT, WANT = args[0], args[1], args[2:]
AZ = opts.get("az", "auto"); EL = float(opts.get("el", 8))
AZ_TRY = [35, -35, 145, -145, 65, -65, 115, -115]  # camera sides tried when --az=auto
W, H = (int(v) for v in opts.get("size", "832x1216").split("x"))
ORIENT = opts.get("orient", "auto")  # auto: lying scenes are rendered landscape (H x W); fixed: always W x H
MARGIN = float(opts.get("margin", 0.07))  # free edge round the figures, share of the frame
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
COLOR = {"wife": (0.85, 0.3, 0.5, 1), "patron": (0.8, 0.55, 0.2, 1), "patron2": (0.6, 0.7, 0.2, 1), "patron3": (0.2, 0.7, 0.6, 1), "husband": (0.25, 0.45, 0.8, 1)}

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("bl_ext.blender_org.mpfb", default_set=True)

def to3(p, y=0.0):
    return Vector((p[0] * UNIT, y, p[1] * UNIT))

def make_figure(fig):
    macro = TargetService.get_default_macro_info_dict()
    macro.update(BODY.get(fig["role"], BODY["patron"] if fig["role"].startswith("patron") else BODY["husband"]))  # patron2/3 are guests too
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

# how far apart the knees and feet go, m from the hip's own plane (the side view knows nothing of this)
SPREAD = {"straddle": (0.20, 0.24), "lie_open": (0.26, 0.32), "squat": (0.20, 0.14), "sit": (0.05, 0.05), "lie_back": (0.05, 0.07)}
SPREAD_BETWEEN = (0.25, 0.27)  # sitting with someone between the knees

def someone_between(fig, others):
    """A sitting figure with another body right in front of its pelvis has to open its legs."""
    if fig.get("pose") != "sit": return False
    ahead = -1 if fig["flip"] else 1
    px, pz = fig["j"]["pelvis"][0] * UNIT, fig["j"]["pelvis"][1] * UNIT
    for o in others:
        if o is fig or abs(o.get("side", 0) - fig.get("side", 0)) * UNIT > 0.2: continue
        for name in ("pelvis", "chest", "head"):
            d = (o["j"][name][0] * UNIT - px) * ahead
            if 0.05 < d < 0.6 and o["j"][name][1] * UNIT < pz + 0.45: return True
    return False

def pose(arm, fig, others=()):
    j = fig["j"]
    # the pelvis goes where the scene puts it; `side` moves the whole figure off the plane, toward the viewer
    arm.location.y = -fig.get("side", 0) * UNIT
    bpy.context.view_layer.update()
    here = head_w(arm, "pelvis")
    arm.location += Vector((to3(j["pelvis"]).x - here.x, 0, to3(j["pelvis"]).z - here.z))
    bpy.context.view_layer.update()
    # which way the chest looks, for the camera: remembered as a sign while the figure still stands straight
    r = head_w(arm, "upperarm_r") - head_w(arm, "upperarm_l"); u = head_w(arm, "neck_01") - head_w(arm, "pelvis")
    fig["_front"] = 1 if r.cross(u).x * (-1 if fig["flip"] else 1) > 0 else -1
    # trunk, then head
    aim(arm, "pelvis", head_w(arm, "neck_01"), to3(j["neck"], head_w(arm, "neck_01").y))
    aim(arm, "neck_01", tail_w(arm, "head"), to3(j["head"], tail_w(arm, "head").y) + (tail_w(arm, "head") - head_w(arm, "head")) * 0.5)
    knee, foot = SPREAD_BETWEEN if someone_between(fig, others) else SPREAD.get(fig.get("pose"), (0.03, 0.03))
    mid = head_w(arm, "pelvis").y
    for side, s in (("R", "r"), ("L", "l")):
        # each arm stays in its own plane beside the body: the scene only knows ahead and up
        y = head_w(arm, f"upperarm_{s}").y
        aim(arm, f"upperarm_{s}", head_w(arm, f"lowerarm_{s}"), to3(j[f"elbow{side}"], y))
        aim(arm, f"lowerarm_{s}", head_w(arm, f"hand_{s}"), to3(j[f"hand{side}"], y))
        # the legs open outward from the hip
        y = head_w(arm, f"thigh_{s}").y; out = 1 if y >= mid else -1
        aim(arm, f"thigh_{s}", head_w(arm, f"calf_{s}"), to3(j[f"knee{side}"], y + out * knee))
        aim(arm, f"calf_{s}", head_w(arm, f"foot_{s}"), to3(j[f"foot{side}"], y + out * foot))

def chest_front(arm, fig):
    r = head_w(arm, "upperarm_r") - head_w(arm, "upperarm_l"); u = head_w(arm, "neck_01") - head_w(arm, "pelvis")
    v = r.cross(u) * fig.get("_front", 1)
    return v.normalized() if v.length > 1e-6 else Vector((0, -1, 0))

def skin_points(mesh, step=9):
    """Points of the posed body itself (bones lie: helper bones sit far from the skin)."""
    ev = mesh.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
    pts = [ev.matrix_world @ v.co for v in me.vertices[::step]]
    ev.to_mesh_clear()
    return pts

def box(name, x0, x1, y0, y1, z0, z1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
    ob = bpy.context.active_object; ob.name = name; ob.scale = (abs(x1 - x0), abs(y1 - y0), max(abs(z1 - z0), 0.005))
    return ob

def white_share(path):
    img = bpy.data.images.load(path, check_existing=False)
    a = np.array(img.pixels[:], dtype=np.float32)[0::4]
    bpy.data.images.remove(img)
    return float((a > 0.5).sum())

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
    mr.inputs[1].default_value = near; mr.inputs[2].default_value = far; mr.inputs[3].default_value = 1.0; mr.inputs[4].default_value = 0.15
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
    sc.render.engine = "BLENDER_EEVEE"; sc.render.resolution_percentage = 100
    sc.view_settings.view_transform = "Standard"; sc.render.film_transparent = False
    try: sc.eevee.taa_render_samples = 16
    except Exception: pass
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    figs = []
    scene_figs = data["scenes"][scene_id]
    for fig in scene_figs:
        arm, mesh = make_figure(fig)
        pose(arm, fig, scene_figs)
        parts = [mesh]
        for e in fig["extras"]:
            parts.append(tube(f'{fig["role"]}_{e["kind"]}', e["pts"], THICK.get(fig["role"], THICK["patron"] if fig["role"].startswith("patron") else 0.02) * (0.8 if e["kind"] == "toy" else 1), -fig.get("side", 0) * UNIT))
        figs.append((fig, arm, parts))
    bpy.context.view_layer.update()
    skins = [skin_points(parts[0]) for _, _, parts in figs]
    pts = [p for sk in skins for p in sk]
    # something to stand, sit and lie on: without it the picture model has no scale to hold on to
    props = [box("floor", -8, 8, -8, 8, -0.02, 0)]
    for (fig, arm, parts), sk in zip(figs, skins):
        if fig.get("prop") == "seat":
            p = head_w(arm, "pelvis"); back = 0.16 if fig["flip"] else -0.16
            props.append(box("seat", p.x - 0.24 + back, p.x + 0.24 + back, p.y - 0.25, p.y + 0.25, 0, max(0.1, min(q.z for q in sk if abs(q.x - p.x) < 0.25 and abs(q.y - p.y) < 0.3) - 0.005)))
    lying = [sk for (fig, _, _), sk in zip(figs, skins) if fig.get("prop") == "bed"]
    if lying:
        lp = [p for sk in lying for p in sk]; top = min(p.z for p in lp)
        if top > 0.08: props.append(box("bed", min(p.x for p in lp) - 0.3, max(p.x for p in lp) + 0.3, min(p.y for p in lp) - 0.45, max(p.y for p in lp) + 0.45, 0, top - 0.005))
    bpy.context.view_layer.update()
    centre0 = Vector(((min(p.x for p in pts) + max(p.x for p in pts)) / 2, (min(p.y for p in pts) + max(p.y for p in pts)) / 2, (min(p.z for p in pts) + max(p.z for p in pts)) / 2))
    cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 50; cam = bpy.data.objects.new("cam", cam_data); sc.collection.objects.link(cam); sc.camera = cam
    cam_data.clip_start = 0.05; cam_data.clip_end = 60
    white, black = flat("white", (1, 1, 1, 1)), flat("black", (0, 0, 0, 1))
    state = {}
    def frame(az_deg):
        """Puts the camera on that side, looking at the middle of what is seen, back far enough for it all to fit."""
        az, el = math.radians(az_deg), math.radians(EL)
        direction = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        centre = centre0.copy()
        def place(dist):
            cam.location = centre + direction * dist
            cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
            bpy.context.view_layer.update()
            return [cam.matrix_world.inverted() @ p for p in pts]
        cs = place(4.0)
        wide = (max(c.x for c in cs) - min(c.x for c in cs)) > 1.0 * (max(c.y for c in cs) - min(c.y for c in cs))
        w, h = (max(W, H), min(W, H)) if wide and ORIENT == "auto" else (W, H)
        sc.render.resolution_x = w; sc.render.resolution_y = h
        dist = 1.0
        for _ in range(90):
            cs = place(dist)
            shift = Vector(((min(c.x for c in cs) + max(c.x for c in cs)) / 2, (min(c.y for c in cs) + max(c.y for c in cs)) / 2, 0))
            centre = centre + cam.matrix_world.to_3x3() @ shift
            place(dist)
            uv = [world_to_camera_view(sc, cam, p) for p in pts]
            if all(MARGIN <= u.x <= 1 - MARGIN and MARGIN <= u.y <= 1 - MARGIN and u.z > 0 for u in uv): break
            dist *= 1.05
        state.update(w=w, h=h, dist=dist, direction=direction)
    def seen(az_deg):
        """How well this side shows everyone: the least seen figure counts most, then her, then her front."""
        frame(az_deg)
        sc.render.resolution_percentage = 20
        tmp = os.path.join(tempfile.gettempdir(), "tc_vis.png"); share = []
        for i, (fig, arm, parts) in enumerate(figs):
            for k, (_, _, other) in enumerate(figs):
                paint(other, white if k == i else black)
                for o in other: o.hide_render = False
            paint(props, black)
            for o in props: o.hide_render = False
            render(tmp); among = white_share(tmp)
            for k, (_, _, other) in enumerate(figs):
                for o in other: o.hide_render = k != i
            for o in props: o.hide_render = True
            render(tmp); alone = white_share(tmp)
            share.append(among / max(alone, 1.0))
        for _, _, other in figs:
            for o in other: o.hide_render = False
        for o in props: o.hide_render = False
        sc.render.resolution_percentage = 100
        wi = next((i for i, f in enumerate(figs) if f[0]["role"] == "wife"), 0)
        front = max(0.0, chest_front(figs[wi][1], figs[wi][0]).dot(state["direction"]))
        return min(share) + 0.6 * share[wi] + 0.25 * front, share
    if AZ == "auto":
        bg.inputs[0].default_value = (0, 0, 0, 1); sc.view_settings.view_transform = "Raw"
        scores = {a: seen(a) for a in AZ_TRY}
        az_used = max(scores, key=lambda a: scores[a][0])
        print("SIDES", scene_id, " ".join(f"{a}:{scores[a][0]:.2f}" for a in AZ_TRY), "->", az_used, "seen", [round(x, 2) for x in scores[az_used][1]])
        sc.view_settings.view_transform = "Standard"
    else: az_used = float(AZ)
    frame(az_used)
    w, h, dist = state["w"], state["h"], state["dist"]
    # a wall behind them closes the room
    back = Vector((-state["direction"].x, -state["direction"].y, 0)).normalized()
    depths = [(cam.matrix_world.inverted() @ p).z * -1 for p in pts]
    reach = max((p - centre0).dot(back) for p in pts)
    bpy.ops.mesh.primitive_plane_add(size=30, location=centre0 + back * (reach + 1.3))
    wall = bpy.context.active_object; wall.name = "wall"; wall.rotation_euler = (math.radians(90), 0, math.atan2(back.y, back.x) + math.radians(90))
    props.append(wall)
    # the bodies take most of the greys; the floor in front and the wall behind get what is left
    near, far = max(0.1, min(depths) - 0.35), max(depths) + 1.4
    base = os.path.join(OUT, scene_id)
    # 1. preview: lit, one colour per role
    bg.inputs[0].default_value = (0.06, 0.06, 0.07, 1); bg.inputs[1].default_value = 1.0
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5; sc.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(50), 0, cam.rotation_euler.z + math.radians(25))
    for fig, arm, parts in figs: paint(parts, lit("lit_" + fig["role"], COLOR.get(fig["role"], (0.6, 0.6, 0.6, 1))))
    paint(props, lit("lit_room", (0.32, 0.32, 0.34, 1)))
    render(base + ".preview.png", "RGB")
    sun.hide_render = True
    bg.inputs[0].default_value = (0, 0, 0, 1)
    # 2. depth: near is white, far is dark, nothing is black
    sc.view_settings.view_transform = "Raw"  # the grey written is the grey meant
    dm = depth_mat(near, far)
    for fig, arm, parts in figs: paint(parts, dm)
    paint(props, dm)
    render(base + ".depth.png")
    # 3. one mask per figure
    paint(props, black)
    for i, (fig, arm, parts) in enumerate(figs):
        for k, (_, _, other) in enumerate(figs): paint(other, white if k == i else black)
        render(f'{base}.mask-{i}-{fig["role"]}.png')
    # 4. the joints as the picture sees them, in OpenPose order
    order = ["head", "neck_01", "upperarm_r", "lowerarm_r", "hand_r", "upperarm_l", "lowerarm_l", "hand_l", "thigh_r", "calf_r", "foot_r", "thigh_l", "calf_l", "foot_l"]
    out = {"scene": scene_id, "width": w, "height": h, "az": az_used, "el": EL, "figures": []}
    for fig, arm, parts in figs:
        kp = []
        for name in order:
            p = tail_w(arm, "head") if name == "head" else head_w(arm, name)
            u = world_to_camera_view(sc, cam, p)
            kp.append([round(u.x * w, 1), round((1 - u.y) * h, 1)])
        out["figures"].append({"role": fig["role"], "keypoints": kp})
    json.dump(out, open(base + ".pose.json", "w"))
    print("DONE", scene_id, "az", az_used, "dist", round(dist, 2), "near", round(near, 2), "far", round(far, 2))

for sid in (WANT or list(data["scenes"])):
    if sid not in data["scenes"]:
        print("UNKNOWN", sid); continue
    try: run(sid)
    except Exception as e:
        import traceback; traceback.print_exc(); print("FAILED", sid, e)
