"""build_athlete.py'den alınan retarget ve parkur klipleri; build_athletes2.py içinde exec edilir.
Beklenen globaller: tgt (hedef iskelet), src (Xbot iskeleti), src_meshes, src_actions, scene, FPS."""
import math
import bpy
from mathutils import Matrix, Quaternion, Vector


def bone_world_head(arm, name):
    return arm.matrix_world @ arm.data.bones[name].head_local


def rest_arm_down():
    """Dinlenme pozunda kolun yataydan ne kadar aşağı baktığı (derece). Mixamo T-pozunda 0, MakeHuman A-pozunda ~45."""
    a = bone_world_head(tgt, "mixamorig:LeftArm")
    b = bone_world_head(tgt, "mixamorig:LeftForeArm")
    d = (b - a).normalized()
    return math.degrees(math.asin(max(-1, min(1, -d.z))))


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
REST_DOWN = rest_arm_down()

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
    rot_ws(B(s + "Arm"), FWD, -sign * (down - REST_DOWN) + sign * out)
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

