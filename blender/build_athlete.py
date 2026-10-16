"""
EVADE sporcu modeli: Blender (bpy) ile üretilir.

Kaynaklar (three.js örnek modelleri, Mixamo iskeleti):
  - Michelle.glb: dokulu insan gövdesi (Mixamo karakteri)
  - Xbot.glb: aynı iskelet ailesinde mocap koşu / yürüme / bekleme animasyonları

Adımlar:
  1. Michelle'i içe aktar, boyunu 1,75 m'ye ölçekle.
  2. Gövde ve kalça ağırlıklı yüzlerden ayrı, hafif şişirilmiş "Jersey" ve "Shorts" katmanları üret
     (aynı deri ağırlıklarını taşır, iskeletle birlikte deforme olur; rengi oyunda takıma göre verilir).
  3. Xbot'un run/walk/idle mocap kliplerini kemik başına dinlenme farkıyla Michelle'e retarget et.
  4. Parkur kliplerini anahtar karelerle yaz: vault, kong, climb, slide, jump, dive, stumble, juke,
     wallkick, cheer, tired.
  5. Tek bir GLB olarak dışa aktar (public/models/athlete.glb).

Çalıştırma: python3 blender/build_athlete.py -- <models_dir> <out.glb>
"""
import math
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

MODELS, OUT = sys.argv[-2], sys.argv[-1]
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    meshes = [o for o in new if o.type == "MESH" and o.parent == arm]
    junk = [o for o in new if o.type == "MESH" and o.parent != arm]
    return arm, meshes, junk


tgt, tgt_meshes, junk1 = import_glb(f"{MODELS}/Michelle.glb")
src, src_meshes, junk2 = import_glb(f"{MODELS}/Xbot.glb")
for o in junk1 + junk2:
    bpy.data.objects.remove(o, do_unlink=True)

# Kaynak klipler (import sonrası actions içinde)
src_actions = {}
for a in list(bpy.data.actions):
    src_actions[a.name] = a
    a.name = "src_" + a.name
print("actions:", list(src_actions))

# ---------- Ölçek: hedef boy 1,75 m ----------
def bone_world_head(arm, name):
    return arm.matrix_world @ arm.data.bones[name].head_local


def height(arm):
    top = bone_world_head(arm, "mixamorig:HeadTop_End")
    foot = bone_world_head(arm, "mixamorig:LeftToeBase")
    return top.z - foot.z + 0.02


for a in (tgt, src):
    a.animation_data_clear() if a.animation_data else None
bpy.context.view_layer.update()
h = height(tgt)
k = 1.75 / h
tgt.scale = tgt.scale * k
bpy.context.view_layer.update()
hs = height(src)
src.scale = src.scale * (1.75 / hs)
bpy.context.view_layer.update()
print("height michelle", round(height(tgt), 3), "xbot", round(height(src), 3))

# ---------- Forma ve şort katmanları ----------
body = tgt_meshes[0]
bpy.context.view_layer.objects.active = body


def vg_weight(mesh, v, names):
    w = 0.0
    for g in v.groups:
        if mesh.vertex_groups[g.group].name in names:
            w += g.weight
    return w


TORSO = {"mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:LeftShoulder", "mixamorig:RightShoulder", "mixamorig:Hips"}
HIPS = {"mixamorig:Hips", "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg"}
LEGS = HIPS | {"mixamorig:LeftLeg", "mixamorig:RightLeg"}
FEET = {"mixamorig:LeftFoot", "mixamorig:RightFoot", "mixamorig:LeftToeBase", "mixamorig:RightToeBase"}
NECK_UP = {"mixamorig:Neck", "mixamorig:Head", "mixamorig:LeftArm", "mixamorig:RightArm", "mixamorig:LeftForeArm", "mixamorig:RightForeArm"}


def make_layer(name, include, exclude, thr, inflate, extra=None):
    me = body.data
    keep = set()
    world = body.matrix_world
    for v in me.vertices:
        wi = vg_weight(body, v, include)
        we = vg_weight(body, v, exclude)
        if wi >= thr and we < 0.35 and (extra is None or extra(world @ v.co)):
            keep.add(v.index)
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = name
    bpy.context.collection.objects.link(dup)
    m = dup.data
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(m)
    bm.verts.ensure_lookup_table()
    drop = [f for f in bm.faces if not all(v.index in keep for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * inflate
    bm.to_mesh(m)
    bm.free()
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.65
    m.materials.clear()
    m.materials.append(mat)
    print(name, "faces", len(m.polygons))
    return dup


# Kalça yüksekliği (şort için üst bacak sınırı)
hipZ = bone_world_head(tgt, "mixamorig:Hips").z
kneeZ = bone_world_head(tgt, "mixamorig:LeftLeg").z
shorts_bottom = kneeZ + (hipZ - kneeZ) * 0.45

def segment_clothes():
    """Gövde yüzlerini dokudaki kıyafet rengine göre Jersey/Shorts malzemelerine ayır."""
    me = body.data
    mat_body = me.materials[0]
    img = None
    for n in mat_body.node_tree.nodes:
        if n.type == "TEX_IMAGE" and "Diffuse" in n.image.name:
            img = n.image
    W, H = img.size
    px = img.pixels[:]
    uv = me.uv_layers.active.data

    def sample(u, v):
        x = min(W - 1, max(0, int((u % 1) * W)))
        y = min(H - 1, max(0, int((v % 1) * H)))
        i = (y * W + x) * 4
        return px[i], px[i + 1], px[i + 2]

    def mk(name, rough):
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
        bsdf.inputs["Roughness"].default_value = rough
        me.materials.append(m)
        return len(me.materials) - 1

    jer = mk("Jersey", 0.6)
    sho = mk("Shorts", 0.7)
    headw = {"mixamorig:Head", "mixamorig:Neck", "mixamorig:HeadTop_End"}
    nj = ns = 0
    for poly in me.polygons:
        r = g = b = 0.0
        for li in poly.loop_indices:
            c = sample(*uv[li].uv)
            r += c[0]; g += c[1]; b += c[2]
        n = len(poly.loop_indices)
        r, g, b = r / n, g / n, b / n
        # Ten rengi: kahverengi tonlar (r > g > b, orta parlaklık)
        skin = r > g > b and (r - b) > 0.06 and r < 0.62 and not (g > 0.35 and b < 0.25)
        if skin:
            continue
        tw = th = 0.0
        for vi in poly.vertices:
            v = me.vertices[vi]
            tw += vg_weight(body, v, TORSO)
            th += vg_weight(body, v, LEGS)
            if vg_weight(body, v, headw | FEET) > 0.3:
                tw = th = -99
        tw /= len(poly.vertices)
        th /= len(poly.vertices)
        if tw >= 0.45:
            poly.material_index = jer
            nj += 1
        elif th >= 0.45:
            poly.material_index = sho
            ns += 1
    print("Jersey faces", nj, "Shorts faces", ns)


segment_clothes()
jersey = None
shorts = None

# ---------- Retarget: Xbot → Michelle ----------
def rest_ws(arm, name):
    return arm.matrix_world @ arm.data.bones[name].matrix_local


common = [b.name for b in tgt.data.bones if b.name in src.data.bones]
# Hiyerarşi sırası (ebeveyn önce)
order = []


def walk(b):
    if b.name in common:
        order.append(b.name)
    for c in b.children:
        walk(c)


for b in tgt.data.bones:
    if b.parent is None:
        walk(b)

offset = {}
for n in order:
    rs = rest_ws(src, n).to_quaternion()
    rt = rest_ws(tgt, n).to_quaternion()
    offset[n] = rs.inverted() @ rt

tgt.animation_data_create()
src.animation_data_create()


def new_action(name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    return act


def key_pose(act, frame):
    for pb in tgt.pose.bones:
        pb.keyframe_insert("rotation_quaternion", frame=frame, group=pb.name)
        if pb.name == "mixamorig:Hips":
            pb.keyframe_insert("location", frame=frame, group=pb.name)


def set_bone_ws_rotation(pb, q_ws):
    """Kemiğin dünya yönelimini q_ws yap (konum ebeveynden gelir)."""
    arm = pb.id_data
    mw = arm.matrix_world
    # armature uzayındaki istenen yönelim
    q_as = (mw.to_quaternion().inverted() @ q_ws)
    head = pb.matrix.to_translation()
    scale = pb.matrix.to_scale()
    m = Matrix.LocRotScale(head, q_as, scale)
    pb.matrix = m


def retarget(src_name, dst_name):
    act = src_actions[src_name]
    src.animation_data.action = act
    if hasattr(src.animation_data, "action_slot") and act.slots:
        src.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(x) for x in act.frame_range)
    dst = new_action(dst_name)
    tgt.animation_data.action = dst
    hips_src_rest = rest_ws(src, "mixamorig:Hips").to_translation()
    hips_tgt_rest = rest_ws(tgt, "mixamorig:Hips").to_translation()
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        for pb in tgt.pose.bones:
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = Quaternion()
            pb.location = Vector()
        bpy.context.view_layer.update()
        for n in order:
            spb = src.pose.bones[n]
            q_src_ws = (src.matrix_world @ spb.matrix).to_quaternion()
            set_bone_ws_rotation(tgt.pose.bones[n], q_src_ws @ offset[n])
            bpy.context.view_layer.update()
        # Kalça: dikey salınım + yatay sabit (yerinde koşu; ilerleme oyunda)
        hs_ws = (src.matrix_world @ src.pose.bones["mixamorig:Hips"].matrix).to_translation()
        dz = hs_ws.z - hips_src_rest.z
        hp = tgt.pose.bones["mixamorig:Hips"]
        want_ws = hips_tgt_rest + Vector((0, 0, dz))
        m = hp.matrix.copy()
        m.translation = tgt.matrix_world.inverted() @ want_ws
        hp.matrix = m
        bpy.context.view_layer.update()
        key_pose(dst, f - f0)
    print("retarget", src_name, "->", dst_name, f1 - f0 + 1, "kare")
    return dst


for s, d in (("run", "run"), ("walk", "walk"), ("idle", "idle")):
    if s in src_actions:
        retarget(s, d)

# Kaynak modeli kaldır
for o in [src] + src_meshes:
    bpy.data.objects.remove(o, do_unlink=True)
for a in list(bpy.data.actions):
    if a.name.startswith("src_"):
        bpy.data.actions.remove(a)

# ---------- Parkur klipleri (anahtar kareler) ----------
# Karakterin dünya eksenleri: ileri, sağ, yukarı. Michelle glTF'te +Z'ye bakar → Blender'da -Y.
def facing():
    toe = bone_world_head(tgt, "mixamorig:LeftToeBase")
    foot = bone_world_head(tgt, "mixamorig:LeftFoot")
    f = Vector((toe.x - foot.x, toe.y - foot.y, 0)).normalized()
    return f


FWD = facing()
UP = Vector((0, 0, 1))
RIGHT = FWD.cross(UP).normalized()
print("fwd", tuple(round(c, 2) for c in FWD), "right", tuple(round(c, 2) for c in RIGHT))

B = lambda n: "mixamorig:" + n


def rest_pose():
    for pb in tgt.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = Quaternion()
        pb.location = Vector()
    bpy.context.view_layer.update()


def rot_ws(name, axis, deg):
    """Kemiği dünya ekseni etrafında (şu anki poza göre) döndür; çocuklar birlikte döner."""
    pb = tgt.pose.bones[name]
    cur = (tgt.matrix_world @ pb.matrix).to_quaternion()
    q = Quaternion(axis, math.radians(deg)) @ cur
    set_bone_ws_rotation(pb, q)
    bpy.context.view_layer.update()


def hips_offset(dz=0.0, dfwd=0.0):
    hp = tgt.pose.bones[B("Hips")]
    rest = rest_ws(tgt, B("Hips")).to_translation()
    m = hp.matrix.copy()
    m.translation = tgt.matrix_world.inverted() @ (rest + Vector((0, 0, dz)) + FWD * dfwd)
    hp.matrix = m
    bpy.context.view_layer.update()


# Yardımcılar: bacak ileri (+) / geri (-), diz bükme, kol ileri, dirsek, gövde eğilme
def leg(side, thigh, knee=0.0, out=0.0):
    s = "Left" if side == "L" else "Right"
    rot_ws(B(s + "UpLeg"), RIGHT, thigh)
    if out:
        rot_ws(B(s + "UpLeg"), FWD, out if side == "L" else -out)
    rot_ws(B(s + "Leg"), RIGHT, -knee)


def arm(side, fwd, elbow=0.0, down=70.0, out=0.0):
    """Mixamo T-pozundan: önce kolu aşağı indir (down), sonra ileri/geri salla."""
    s = "Left" if side == "L" else "Right"
    sign = 1 if side == "L" else -1
    rot_ws(B(s + "Arm"), FWD, -sign * down + sign * out)
    rot_ws(B(s + "Arm"), RIGHT, fwd)
    if elbow:
        # Dirsek bükülmesi: kol düzleminde, el öne/yukarı gelir
        rot_ws(B(s + "ForeArm"), RIGHT, elbow)


def torso(lean=0.0, twist=0.0, side=0.0):
    if lean:
        rot_ws(B("Spine"), RIGHT, -lean * 0.4)
        rot_ws(B("Spine1"), RIGHT, -lean * 0.3)
        rot_ws(B("Spine2"), RIGHT, -lean * 0.3)
    if twist:
        rot_ws(B("Spine1"), UP, twist)
    if side:
        rot_ws(B("Spine"), FWD, side)


def head(pitch=0.0):
    if pitch:
        rot_ws(B("Head"), RIGHT, -pitch)


def pose_clip(name, keys, loop=False):
    """keys: [(saniye, fonksiyon)] — her fonksiyon dinlenme pozundan başlayıp pozu kurar."""
    act = new_action(name)
    tgt.animation_data.action = act
    for t, fn in keys:
        rest_pose()
        fn()
        key_pose(act, round(t * FPS))
    for fc in getattr(act, "fcurves", []):
        for kp in fc.keyframe_points:
            kp.interpolation = "BEZIER"
    print("clip", name, len(keys), "anahtar")


def P(lean=0, dz=0, L=(0, 0), R=(0, 0), aL=(0, 0), aR=(0, 0), down=72, outL=0, outR=0, hp=0, side=0, twist=0, legOut=0):
    def fn():
        hips_offset(dz)
        torso(lean, twist, side)
        head(hp)
        leg("L", L[0], L[1], legOut)
        leg("R", R[0], R[1], legOut)
        arm("L", aL[0], aL[1], down, outL)
        arm("R", aR[0], aR[1], down, outR)

    return fn


# Speed vault: tek el kutuda, bacaklar yana savrulur
pose_clip(
    "vault",
    [
        (0.0, P(lean=20, dz=-0.05, L=(30, 40), R=(-20, 30), aL=(40, 30), aR=(-20, 40))),
        (0.12, P(lean=30, dz=0.15, L=(80, 90), R=(30, 60), aL=(60, 10), aR=(10, 60), side=-20, legOut=25)),
        (0.24, P(lean=10, dz=0.3, L=(70, 60), R=(60, 70), aL=(70, 0), aR=(-30, 50), side=-30, legOut=35)),
        (0.4, P(lean=15, dz=0.0, L=(20, 30), R=(-10, 20), aL=(20, 40), aR=(-20, 40))),
    ],
)
# Kong: iki el önde, bacaklar göğse
pose_clip(
    "kong",
    [
        (0.0, P(lean=35, dz=-0.1, L=(40, 60), R=(40, 60), aL=(80, 10), aR=(80, 10))),
        (0.15, P(lean=55, dz=0.25, L=(110, 130), R=(110, 130), aL=(100, 0), aR=(100, 0), hp=-20)),
        (0.3, P(lean=30, dz=0.35, L=(80, 100), R=(80, 100), aL=(40, 20), aR=(40, 20))),
        (0.42, P(lean=15, dz=0.0, L=(30, 40), R=(10, 30), aL=(10, 40), aR=(10, 40))),
    ],
)
# Tırmanma: kollar yukarıda tutunur, bacaklar duvara basar (dikey konum oyunda)
def climb_pose(phase):
    def fn():
        hips_offset(0)
        torso(-5)
        a = 25 * math.sin(phase)
        leg("L", 70 + a, 100)
        leg("R", 50 - a, 80)
        arm("L", 170 - a, 30, 70)
        arm("R", 160 + a, 40, 70)

    return fn


pose_clip("climb", [(i * 0.2, climb_pose(i * math.pi / 2)) for i in range(5)], loop=True)
# Kayma: geriye yaslanır, bir bacak önde düz, diğeri bükülü
pose_clip(
    "slide",
    [
        (0.0, P(lean=-10, dz=-0.3, L=(50, 20), R=(10, 60), aL=(-20, 20), aR=(40, 30))),
        (0.12, P(lean=-45, dz=-0.62, L=(80, 5), R=(40, 100), aL=(-60, 10), aR=(60, 40), hp=25)),
        (0.4, P(lean=-40, dz=-0.6, L=(80, 5), R=(40, 100), aL=(-60, 10), aR=(60, 40), hp=25)),
    ],
)
# Zıplama: kalkış, havada toplanma, iniş
pose_clip(
    "jump",
    [
        (0.0, P(lean=20, dz=-0.15, L=(40, 70), R=(40, 70), aL=(-40, 20), aR=(-40, 20))),
        (0.12, P(lean=10, dz=0.05, L=(70, 90), R=(10, 20), aL=(90, 30), aR=(40, 30))),
        (0.3, P(lean=5, dz=0.1, L=(60, 80), R=(50, 80), aL=(60, 30), aR=(60, 30))),
        (0.45, P(lean=25, dz=-0.15, L=(40, 70), R=(30, 60), aL=(20, 40), aR=(20, 40))),
    ],
)
# Dalış: gövde yataya yakın, iki kol ileri uzanır, bacaklar geride
pose_clip(
    "dive",
    [
        (0.0, P(lean=50, dz=-0.1, L=(30, 40), R=(-20, 30), aL=(70, 10), aR=(70, 10))),
        (0.12, P(lean=95, dz=-0.35, L=(-30, 10), R=(-40, 20), aL=(80, 0), aR=(85, 0), hp=-55, down=75)),
        (0.26, P(lean=110, dz=-0.55, L=(-40, 5), R=(-45, 15), aL=(75, 0), aR=(80, 0), hp=-65, down=75)),
    ],
)
# Tökezleme: dengeyi toplama
pose_clip(
    "stumble",
    [
        (0.0, P(lean=60, dz=-0.3, L=(60, 80), R=(10, 30), aL=(60, 50), aR=(30, 60), side=10)),
        (0.25, P(lean=45, dz=-0.25, L=(40, 60), R=(30, 50), aL=(40, 60), aR=(50, 60), side=-10)),
        (0.5, P(lean=20, dz=-0.1, L=(20, 30), R=(10, 20), aL=(10, 40), aR=(10, 40))),
    ],
)
# Juke: yana ani basış
pose_clip(
    "juke",
    [
        (0.0, P(lean=25, dz=-0.15, L=(30, 60), R=(-10, 30), aL=(30, 50), aR=(-20, 50), side=15, outL=30)),
        (0.15, P(lean=30, dz=-0.1, L=(-10, 30), R=(40, 60), aL=(-20, 50), aR=(30, 50), side=-15, outR=30)),
    ],
)
# Duvar sıçraması: bir ayak duvarda, kollar dengede
pose_clip(
    "wallkick",
    [
        (0.0, P(lean=15, dz=0.0, L=(70, 60), R=(-10, 20), aL=(60, 20), aR=(-30, 30), side=-15, outL=40, outR=40)),
        (0.15, P(lean=20, dz=0.2, L=(30, 40), R=(60, 80), aL=(90, 10), aR=(0, 30), side=10, outL=30, outR=50)),
        (0.3, P(lean=15, dz=0.0, L=(20, 30), R=(30, 50), aL=(20, 40), aR=(20, 40))),
    ],
)
# Sevinme: kollar havada, zıplama
pose_clip(
    "cheer",
    [
        (0.0, P(lean=-5, dz=0.0, L=(5, 10), R=(5, 10), aL=(0, 10), aR=(0, 10), down=-60, outL=30, outR=30, hp=15)),
        (0.25, P(lean=-10, dz=0.12, L=(15, 30), R=(15, 30), aL=(0, 0), aR=(0, 0), down=-80, outL=20, outR=20, hp=20)),
        (0.5, P(lean=-5, dz=0.0, L=(5, 10), R=(5, 10), aL=(0, 10), aR=(0, 10), down=-60, outL=30, outR=30, hp=15)),
    ],
    loop=True,
)
# Yorgun: eller dizlerde
pose_clip(
    "tired",
    [
        (0.0, P(lean=60, dz=-0.18, L=(30, 45), R=(25, 40), aL=(50, 10), aR=(50, 10), down=85, hp=-10)),
        (0.6, P(lean=55, dz=-0.15, L=(30, 45), R=(25, 40), aL=(48, 10), aR=(48, 10), down=85, hp=-5)),
        (1.2, P(lean=60, dz=-0.18, L=(30, 45), R=(25, 40), aL=(50, 10), aR=(50, 10), down=85, hp=-10)),
    ],
    loop=True,
)

rest_pose()
tgt.animation_data.action = bpy.data.actions["idle"] if "idle" in bpy.data.actions else None

# ---------- NLA: her aksiyonu ayrı klip olarak dışa aktar ----------
for a in bpy.data.actions:
    a.use_fake_user = True
tgt.name = "Athlete"
body.name = "Body"

bpy.ops.object.select_all(action="DESELECT")
for o in (tgt, body):
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_force_sampling=True,
    export_frame_step=1,
    export_image_format="WEBP" if hasattr(bpy.types, "Image") else "AUTO",
    export_def_bones=True,
    export_yup=True,
)
print("OK", OUT)
