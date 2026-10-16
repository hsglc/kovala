"""
EVADE sporcuları v2: MakeHuman (MPFB2) tabanlı erkek ve kadın gövde + ayrı giysi parçaları.

Kaynaklar:
  - MPFB2 (MakeHuman Blender eklentisi, CC0 varlıklar): temel gövde, cinsiyet/kas hedefleri, Mixamo iskeleti ve ağırlıkları
  - Xbot.glb (three.js örnekleri, Mixamo iskeleti): koşu / yürüme / bekleme mocap
  - Parkur klipleri: anahtar karelerle (build_athlete.py ile aynı pozlar)

Giysiler gövdenin bölgelerinden üretilir (kemik ağırlığı + dinlenme pozundaki konum maskesi),
normal boyunca şişirilir ve aynı deri ağırlıklarını taşır; böylece animasyonla birlikte deforme olur.
Her giysi GLB içinde "G_<id>" adlı ayrı bir mesh'tir; oyun seçilmeyenleri gizler.

Çalıştırma: python3 blender/build_athletes2.py -- <xbot.glb> <out_dir>
Çıktı: <out_dir>/athlete_f.glb, <out_dir>/athlete_m.glb
"""
import importlib
import math
import os
import sys

import bpy  # noqa: E402  (bpy önce: addon_utils onunla gelir)
import addon_utils
import bmesh
from mathutils import Matrix, Quaternion, Vector

XBOT, OUT_DIR = sys.argv[-2], sys.argv[-1]
FPS = 30

addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)


def imp(p, k):
    for m in list(sys.modules):
        if m.endswith(p):
            return getattr(importlib.import_module(m), k)
    raise SystemExit("modül yok: " + p)


HumanService = imp("mpfb.services.humanservice", "HumanService")
TargetService = imp("mpfb.services.targetservice", "TargetService")

B = lambda n: "mixamorig:" + n

MACROS = {
    # Kadın: daha kısa, ince belli, kalçası geniş, atletik ama yumuşak hatlı
    "f": {"gender": 0.0, "age": 0.4, "muscle": 0.38, "weight": 0.36, "proportions": 0.9, "height": 0.64, "cupsize": 0.55, "firmness": 0.8,
          "race": {"asian": 0.15, "caucasian": 0.7, "african": 0.15}},
    # Erkek: uzun, geniş omuzlu, belirgin kaslı
    "m": {"gender": 1.0, "age": 0.48, "muscle": 1.0, "weight": 0.56, "proportions": 0.85, "height": 0.6, "cupsize": 0.5, "firmness": 0.5,
          "race": {"asian": 0.1, "caucasian": 0.7, "african": 0.2}},
}

# Cinsiyeti tek bakışta belli eden ek şekil hedefleri (MPFB, CC0)
SHAPE = {
    "f": {
        "measure-waist-circ-decr": 0.55, "hip-scale-horiz-incr": 0.35, "buttocks-volume-incr": 0.35,
        "measure-shoulder-dist-decr": 0.5, "torso-vshape-decr": 0.3, "measure-neck-circ-decr": 0.6, "measure-bust-circ-decr": 0.1,
        "chin-width-decr": 0.35, "chin-prominent-decr": 0.25, "head-oval": 0.4, "forehead-temple-incr": 0.2,
        "nose-scale-horiz-decr": 0.25, "nose-point-width-decr": 0.3, "mouth-upperlip-volume-incr": 0.35,
        "mouth-lowerlip-volume-incr": 0.3, "eyebrows-trans-up": 0.25,
    },
    "m": {
        "measure-shoulder-dist-incr": 0.6, "torso-vshape-incr": 0.8, "torso-muscle-dorsi-incr": 0.7,
        "torso-muscle-pectoral-incr": 0.55, "measure-neck-circ-incr": 0.65, "hip-scale-horiz-decr": 0.2,
        "measure-waist-circ-decr": 0.12, "chin-width-incr": 0.45, "chin-prominent-incr": 0.3, "head-square": 0.45,
        "chin-jaw-drop-incr": 0.2, "eyebrows-trans-down": 0.3, "eyebrows-trans-forward": 0.35, "nose-scale-horiz-incr": 0.15,
        "forehead-nubian-incr": 0.2,
    },
}


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
    bpy.context.scene.render.fps = FPS


def vg_names(obj):
    return {g.index: g.name for g in obj.vertex_groups}


def weight_of(obj, v, names, idx=None):
    idx = idx or vg_names(obj)
    w = 0.0
    for g in v.groups:
        if idx[g.group] in names:
            w += g.weight
    return w


def make_human(sex):
    h = HumanService.create_human(macro_detail_dict=MACROS[sex])
    for name, w in SHAPE[sex].items():
        path = TargetService.target_full_path(name)
        if not path:
            print("  hedef yok", name)
            continue
        TargetService.load_target(h, path, weight=w)
    TargetService.bake_targets(h)
    rig = HumanService.add_builtin_rig(h, "mixamo")
    h.name = "Body"
    rig.name = "Athlete"
    # Mask modifier vb. kaldır (yardımcılar elle temizlenir)
    for m in list(h.modifiers):
        if m.type != "ARMATURE":
            h.modifiers.remove(m)
    return h, rig


def split_helpers(body):
    """Yardımcı geometriyi sil; gözleri ve saç kalıbını ayrı nesne yap."""
    idx = vg_names(body)
    me = body.data
    eyes, hair, junk = set(), set(), set()
    for v in me.vertices:
        names = {idx[g.group] for g in v.groups if g.weight > 0.5}
        if "helper-l-eye" in names or "helper-r-eye" in names:
            eyes.add(v.index)
        elif "helper-hair" in names:
            hair.add(v.index)
        elif "body" not in names:
            junk.add(v.index)

    def extract(name, keep):
        dup = body.copy()
        dup.data = body.data.copy()
        dup.name = name
        bpy.context.collection.objects.link(dup)
        bm = bmesh.new()
        bm.from_mesh(dup.data)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context="VERTS")
        bm.to_mesh(dup.data)
        bm.free()
        return dup

    eye_obj = extract("Eyes", eyes)
    hair_obj = extract("HairCap", hair)
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index in eyes | hair | junk], context="VERTS")
    bm.to_mesh(me)
    bm.free()
    print("gövde", len(me.vertices), "göz", len(eye_obj.data.vertices), "saç kalıbı", len(hair_obj.data.vertices))
    return eye_obj, hair_obj


def skin_texture(path, body=None, eyes=None, sex="f", rig=None):
    """Ten dokusu (oyunda ten rengiyle çarpılır) + gözenek normal haritası.
    MakeHuman UV maskeleri: dudak, göz kapağı, tırnak. Üstüne 3B konuma göre boyanır:
    kaş, kirpik çizgisi, erkekte sakal gölgesi, yanak/burun/kulak kızarıklığı."""
    import numpy as np
    from PIL import Image, ImageFilter
    tex = "/root/.config/blender/5.2/extensions/user_default/mpfb/data/textures/"
    S = 2048
    base = Image.new("RGB", (S, S), (255, 255, 255))

    def mask(f, blur):
        return Image.open(tex + f).convert("L").resize((S, S)).filter(ImageFilter.GaussianBlur(blur))

    def tint(img, m, rgb):
        return Image.composite(Image.new("RGB", (S, S), rgb), img, m)

    lips_m = mask("mpfb_lips.jpg", 3)
    base = tint(base, mask("mpfb_eyelids.jpg", 4), (222, 192, 184) if sex == "f" else (214, 190, 180))
    base = tint(base, lips_m, (196, 98, 104) if sex == "f" else (190, 132, 122))
    base = tint(base, mask("mpfb_fingernails.jpg", 1), (255, 236, 230))
    base = tint(base, mask("mpfb_toenails.jpg", 1), (255, 236, 230))
    img = np.asarray(base).astype(np.float32) / 255.0
    lips = np.asarray(lips_m).astype(np.float32) / 255.0
    rng_ = np.random.default_rng(7)

    def vnoise(x, y, seed):
        """Değer gürültüsü (vektörel)."""
        xi, yi = np.floor(x), np.floor(y)
        xf, yf = x - xi, y - yi
        def h(a, b):
            n = (a * 374761393 + b * 668265263 + seed * 1442695041).astype(np.int64)
            n = (n ^ (n >> 13)) * 1274126177
            return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0
        u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
        a, b_, c, d = h(xi, yi), h(xi + 1, yi), h(xi, yi + 1), h(xi + 1, yi + 1)
        return (a + (b_ - a) * u) * (1 - v) + (c + (d - c) * u) * v

    if body is not None and eyes is not None:
        L = Land(rig, body)
        mw = body.matrix_world
        me = body.data
        uvl = me.uv_layers.active.data
        R_, F_ = L.right, L.fwd
        ep = [eyes.matrix_world @ v.co for v in eyes.data.vertices]
        M = sum(ep, Vector()) / len(ep)
        left = [q for q in ep if (q - M).dot(R_) > 0]
        right = [q for q in ep if (q - M).dot(R_) <= 0]
        EL = sum(left, Vector()) / max(1, len(left))
        ER = sum(right, Vector()) / max(1, len(right))
        er = max((q - EL).length for q in left) if left else 0.012
        # yüz bölgesindeki her üçgeni UV'de tara; her piksel için 3B konum
        PX, PY, P3 = [], [], []
        co = [mw @ v.co for v in me.vertices]
        for poly in me.polygons:
            vs = poly.vertices
            if min(co[i].z for i in vs) < M.z - 0.22:
                continue
            if max(abs((co[i] - M).dot(F_)) for i in vs) > 0.25:
                continue
            li = list(poly.loop_indices)
            for t in range(1, len(li) - 1):
                tri = (li[0], li[t], li[t + 1])
                uv = np.array([tuple(uvl[k].uv) for k in tri]) * S
                uv[:, 1] = S - uv[:, 1]
                p3 = np.array([tuple(co[me.loops[k].vertex_index]) for k in tri])
                x0, y0 = np.floor(uv.min(0)).astype(int)
                x1, y1 = np.ceil(uv.max(0)).astype(int)
                if x1 - x0 > 400 or y1 - y0 > 400:
                    continue
                xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
                xs, ys = xs.ravel(), ys.ravel()
                (ax, ay), (bx, by), (cx, cy) = uv
                den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
                if abs(den) < 1e-9:
                    continue
                w1 = ((by - cy) * (xs + 0.5 - cx) + (cx - bx) * (ys + 0.5 - cy)) / den
                w2 = ((cy - ay) * (xs + 0.5 - cx) + (ax - cx) * (ys + 0.5 - cy)) / den
                w3 = 1 - w1 - w2
                ok = (w1 >= -0.02) & (w2 >= -0.02) & (w3 >= -0.02) & (xs >= 0) & (ys >= 0) & (xs < S) & (ys < S)
                if not ok.any():
                    continue
                PX.append(xs[ok]); PY.append(ys[ok])
                P3.append(w1[ok, None] * p3[0] + w2[ok, None] * p3[1] + w3[ok, None] * p3[2])
        PX = np.concatenate(PX); PY = np.concatenate(PY); P3 = np.concatenate(P3)
        rel = P3 - np.array(tuple(M))
        R3, F3 = np.array(tuple(R_)), np.array(tuple(F_))
        lat = rel @ R3            # sağ(+)/sol(-)
        fwd = rel @ F3            # ileri
        up = rel[:, 2]
        mul = np.ones((len(PX), 3), np.float32)

        def sm(x):
            x = np.clip(x, 0, 1)
            return x * x * (3 - 2 * x)

        def blend(dens, rgb, strength=1.0):
            nonlocal mul
            d = np.clip(dens * strength, 0, 1)[:, None]
            mul = mul * (1 - d) + mul * np.array(rgb, np.float32)[None, :] * d

        # --- kaşlar ---
        for sgn, E in ((1, EL), (-1, ER)):
            e = np.array(tuple(E)) - np.array(tuple(M))
            u = (lat - e @ R3) * sgn            # dışa doğru +
            v = up - e[2]
            w = fwd - e @ F3
            if sex == "f":
                vc = 0.0175 + 0.0058 * (1 - ((u - 0.007) / 0.021) ** 2)
                th = 0.0040 - 0.0024 * sm((u + 0.012) / 0.036)
                a = sm((u + 0.016) / 0.006) * (1 - sm((u - 0.021) / 0.006))
            else:
                vc = 0.0150 + 0.0022 * (1 - ((u - 0.004) / 0.024) ** 2)
                th = 0.0060 - 0.0022 * sm((u + 0.012) / 0.04)
                a = sm((u + 0.018) / 0.005) * (1 - sm((u - 0.024) / 0.007))
            dens = np.exp(-(((v - vc) / np.maximum(th, 1e-4)) ** 2) * 1.5) * a * (w > -0.012)
            # kıl yönü: iç uçta yukarı, sonra dışa yatık; ince çizgiler
            ang = np.where(u < 0.0, 1.2, 0.35)
            q1 = (u * np.cos(ang) + v * np.sin(ang)) * 2600.0
            q2 = (-u * np.sin(ang) + v * np.cos(ang)) * 380.0
            hair = 0.45 + 0.55 * vnoise(q1, q2, 3 + sgn)
            blend(dens * hair, (0.2, 0.15, 0.12), 0.92)
            # --- kirpik çizgisi (üst göz kapağı kenarı) ---
            vm = 0.0058 * np.clip(1 - (u / (er * 1.15)) ** 2, 0, 1) + 0.0004
            lash = np.exp(-(((v - vm) / 0.0011) ** 2)) * (np.abs(u) < er * 1.15) * (w > 0.0) * (v > 0.0)
            blend(lash, (0.12, 0.09, 0.08), 0.85 if sex == "f" else 0.55)
            # --- yanak kızarıklığı ---
            cheek = np.exp(-((u - 0.006) ** 2 + (v + 0.03) ** 2) / (0.02 ** 2)) * (w > -0.02)
            blend(cheek, (0.96, 0.84, 0.84), 0.75 if sex == "f" else 0.35)
        # --- burun ucu ve kulak: hafif kızarıklık (alt-yüzey saçılımı izlenimi) ---
        nose = np.exp(-((lat) ** 2 + (up + 0.032) ** 2) / (0.014 ** 2)) * (fwd > 0.012)
        blend(nose, (0.95, 0.85, 0.84), 0.6)
        ear = sm((np.abs(lat) - 0.065) / 0.01) * (np.abs(up + 0.005) < 0.04) * (fwd < -0.05)
        blend(ear, (0.95, 0.84, 0.83), 0.55)
        hp = globals().get("_HAIR_PARAMS")
        if hp:
            (fz, rec, sz, nz_), eY, eZ, eX = hp
            x, y, z = np.abs(lat), fwd, up
            zf_front = fz + rec * sm((x - 0.012) / 0.04) + 0.007 * np.minimum(1.0, (x / 0.05) ** 2)
            k = sm((y - (eY + 0.028)) / 0.04)
            zf = sz + (zf_front - sz) * k
            k2 = sm((y - (eY - 0.005)) / 0.03)
            zf = nz_ + (zf - nz_) * k2
            jag = 0.0018 * np.sin(x * 410 + 1.3) * np.sin(y * 370 + 0.4) + 0.0012 * np.sin(x * 1150 + y * 830)
            line = z - zf + jag
            ex = (y - (eY + 0.006)) / 0.034
            ez = (z - (eZ + 0.004)) / 0.042
            ear_s = np.where(x > eX - 0.035, (np.hypot(ex, ez) - 1.0) * 0.03, 0.05)
            hf = np.minimum(line, ear_s)
            # saç çizgisinin hemen altından başlayan yumuşak saç dibi gölgesi + tek tük kısa teller
            roots = sm((hf + 0.005) / 0.009)
            fuzz = (vnoise(PX * 1.3, PY * 1.3, 31) > 0.62) * sm((hf + 0.007) / 0.006) * (1 - sm(hf / 0.004))
            blend(np.maximum(roots * 0.75, fuzz * 0.9), (0.5, 0.42, 0.38), 0.85 if sex == "m" else 0.7)
        if sex == "m":
            # --- sakal gölgesi: çene, alt yanak, bıyık; dudak hariç ---
            ax_ = np.abs(lat)
            top = np.where(fwd > 0.03, -0.042, -0.012 - 0.03 * sm((fwd + 0.06) / 0.09))
            beard = sm((top - up) / 0.012) * sm((up + 0.175) / 0.03)
            beard *= sm((fwd + 0.07) / 0.02)       # kulağın önünden başlar
            beard *= 1 - sm((ax_ - 0.075) / 0.01)
            neck_fade = 1 - sm((-0.13 - up) / 0.04) * sm((0.0 - fwd) / 0.03)
            beard *= neck_fade
            lp = lips[PY, PX]
            beard *= 1 - np.clip(lp * 1.6, 0, 1)
            stip = vnoise(PX * 0.9, PY * 0.9, 11)
            stub = 0.35 + 0.65 * (stip > 0.45)
            blend(beard * stub, (0.6, 0.55, 0.52), 0.55)
        img[PY, PX] = img[PY, PX] * mul
    # genel ten: düşük frekanslı renk dalgalanması (düz plastik görünmesin)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    var = vnoise(xx / 90.0, yy / 90.0, 5) * 0.6 + vnoise(xx / 23.0, yy / 23.0, 9) * 0.4
    img *= (0.965 + 0.05 * var)[..., None]
    Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).save(path)
    # gözenek normal haritası: ince gözenek + daha seyrek kırışık yükseklik alanı
    hgt = vnoise(xx / 2.2, yy / 2.2, 21) * 0.55 + vnoise(xx / 6.0, yy / 6.0, 22) * 0.3 + vnoise(xx / 40.0, yy / 7.0, 23) * 0.15
    gx = np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)
    gy = np.roll(hgt, -1, 0) - np.roll(hgt, 1, 0)
    k = 1.6
    nx, ny, nz = -gx * k, gy * k, np.ones_like(hgt)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5
    npath = path.replace(".png", "_n.png")
    Image.fromarray((nrm * 255).astype(np.uint8)).save(npath)
    return path


def skin_material(objs, img_path):
    img = bpy.data.images.load(img_path)
    mat = bpy.data.materials.new("Skin")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.6
    npath = img_path.replace(".png", "_n.png")
    if os.path.exists(npath):
        nimg = bpy.data.images.load(npath)
        nimg.colorspace_settings.name = "Non-Color"
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = nimg
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 1.0
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(mat)


def export(rig, objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_def_bones=True,
        export_yup=True,
        export_draco_mesh_compression_enable=os.environ.get("DRACO", "1") == "1",
        export_draco_mesh_compression_level=7,
        export_image_format="WEBP",
    )
    print("OK", path)



# ---------------------------------------------------------------- Giysiler

ARM_L = {B("LeftArm")}
ARM_R = {B("RightArm")}
FORE = {B("LeftForeArm"), B("RightForeArm")}
HANDS_PREFIX = ("mixamorig:LeftHand", "mixamorig:RightHand")
TORSO = {B("Spine"), B("Spine1"), B("Spine2"), B("LeftShoulder"), B("RightShoulder")}
HIPS = {B("Hips")}
UPLEG = {B("LeftUpLeg"), B("RightUpLeg")}
LEG = {B("LeftLeg"), B("RightLeg")}
FOOT = {B("LeftFoot"), B("RightFoot"), B("LeftToeBase"), B("RightToeBase")}
NECK = {B("Neck")}
HEADS = {B("Head"), B("HeadTop_End")}
HEAD = {B("Head")}


class Land:
    """Dinlenme pozundaki önemli noktalar (dünya koordinatı, Z yukarı)."""

    def __init__(self, rig, body):
        mw = rig.matrix_world
        bb = lambda n: mw @ rig.data.bones[B(n)].head_local
        bt = lambda n: mw @ rig.data.bones[B(n)].tail_local
        self.neck = bb("Neck")
        self.head = bb("Head")
        self.headTop = max((body.matrix_world @ v.co).z for v in body.data.vertices)
        self.shL = bb("LeftArm")
        self.shR = bb("RightArm")
        self.elL = bb("LeftForeArm")
        self.elR = bb("RightForeArm")
        self.wrL = bb("LeftHand")
        self.wrR = bb("RightHand")
        self.hipL = bb("LeftUpLeg")
        self.kneeL = bb("LeftLeg")
        self.ankL = bb("LeftFoot")
        self.hipR = bb("RightUpLeg")
        self.kneeR = bb("RightLeg")
        self.ankR = bb("RightFoot")
        self.hips = bb("Hips")
        self.spine = bb("Spine")
        self.spine2 = bb("Spine2")
        toe = bb("LeftToeBase")
        f = Vector((toe.x - self.ankL.x, toe.y - self.ankL.y, 0)).normalized()
        self.fwd = f
        self.right = f.cross(Vector((0, 0, 1))).normalized()


def dominant(obj, v, idx):
    best, bw = None, 0.0
    for g in v.groups:
        n = idx[g.group]
        if n.startswith("mixamorig:") and g.weight > bw:
            best, bw = n, g.weight
    return best or ""


def along(p, a, b):
    """p'nin a→b doğrusu üzerindeki konumu (0 a, 1 b)."""
    d = b - a
    return (p - a).dot(d) / max(1e-6, d.length_squared)


def taubin(bm, verts, iters, lam=0.55, mu=-0.58):
    """Hacmi koruyan yumuşatma (Taubin λ|μ)."""
    vs = list(verts)
    nbrs = {v: [e.other_vert(v) for e in v.link_edges] for v in vs}
    for _ in range(iters):
        for k in (lam, mu):
            new = {}
            for v in vs:
                n = nbrs[v]
                if not n:
                    continue
                avg = sum((u.co for u in n), Vector()) / len(n)
                new[v] = v.co + (avg - v.co) * k
            for v, c in new.items():
                v.co = c


def flatten_hems(bm, name, tol=0.03):
    """Her sınır halkasını en uygun düzleme yansıt: paça, kol ağzı ve bel düz ve temiz kesilir.
    Derin yaka gibi düzlemsel olmayan halkalar (rms > tol) olduğu gibi kalır."""
    import numpy as np
    boundary = {v for v in bm.verts if v.is_boundary}
    seen = set()
    for start in boundary:
        if start in seen:
            continue
        loop, stack = [], [start]
        while stack:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            loop.append(x)
            for e in x.link_edges:
                if e.is_boundary and e.other_vert(x) not in seen:
                    stack.append(e.other_vert(x))
        if len(loop) < 6:
            continue
        c = sum((v.co for v in loop), Vector()) / len(loop)
        P = np.array([tuple(v.co - c) for v in loop])
        _, vecs = np.linalg.eigh(P.T @ P)
        n = Vector(vecs[:, 0])
        d = [(v.co - c).dot(n) for v in loop]
        rms = (sum(x * x for x in d) / len(d)) ** 0.5
        if rms > tol:
            print("   hem", name, len(loop), "rms", round(rms, 3), "atla")
            continue
        ring = {}
        for v, x in zip(loop, d):
            v.co -= n * x
            for e in v.link_edges:
                o = e.other_vert(v)
                if o not in boundary:
                    ring.setdefault(o, []).append(-x)
        for o, xs in ring.items():
            o.co += n * (sum(xs) / len(xs)) * 0.5
        print("   hem", name, len(loop), "rms", round(rms, 3))


def iso_cut(bm, sv):
    """sv[orig] alanının sıfır eğrisinden temiz kesim: geçen kenarlar bölünür, yüzler bölünür, dışarısı silinir."""
    orig = bm.verts.layers.int["orig"]
    val = {v: sv[v[orig]] for v in bm.verts}
    cross = [e for e in bm.edges if (val[e.verts[0]] >= 0) != (val[e.verts[1]] >= 0)]
    newv = set()
    for e in cross:
        a, b = e.verts
        sa, sb = val[a], val[b]
        t = min(0.97, max(0.03, sa / (sa - sb)))
        pa, pb = a.co.copy(), b.co.copy()
        _, nv = bmesh.utils.edge_split(e, a, t)
        nv.co = pa.lerp(pb, t)
        val[nv] = 0.0
        newv.add(nv)
    for f in list(bm.faces):
        vs = [v for v in f.verts if v in newv]
        if len(vs) == 2:
            try:
                bmesh.utils.face_split(f, vs[0], vs[1])
            except Exception:
                pass
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if val.get(v, 0.0) < 0], context="VERTS")
    # kesimden kalan küçük kopuk parçaları at
    seen = set()
    for f0 in list(bm.faces):
        if f0 in seen or not f0.is_valid:
            continue
        comp, stack = [], [f0]
        while stack:
            f = stack.pop()
            if f in seen:
                continue
            seen.add(f)
            comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        stack.append(g)
        if len(comp) < 40:
            bmesh.ops.delete(bm, geom=comp, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")


def make_garment(body, name, pred, inflate, mat_name=None, sole=0.0, smooth=0, edge_smooth=3, soft=None, soft_iters=14, soft_floor=None, drape=None, field_smooth=None, thick=None, envelope=None):
    """pred(p, dom, v): alan (m, >0 içeride) ya da True/False. Sıfır eğrisinden temiz kesilir, normal boyunca şişirilir.
    thick(p, s) → şişirme çarpanı (saç çizgisinde incelme gibi)."""
    idx = vg_names(body)
    mw = body.matrix_world
    nbr = {}
    for e in body.data.edges:
        a, b = e.vertices
        nbr.setdefault(a, []).append(b)
        nbr.setdefault(b, []).append(a)
    sv = {}
    boolish = False
    for v in body.data.vertices:
        r = pred(mw @ v.co, dominant(body, v, idx), v)
        if r is None or isinstance(r, bool):
            boolish = True
            r = 0.01 if r else -0.01
        sv[v.index] = float(r)
    # Delik kapatma: komşularının çoğu içeride olan köşe de içeride (kemik ağırlığı sınırındaki yamalar)
    for _ in range(4 if boolish else 0):
        add = [i for i, ns in nbr.items() if sv[i] < 0 and len(ns) >= 3 and sum(1 for j in ns if sv[j] >= 0) / len(ns) >= 0.6]
        if not add:
            break
        for i in add:
            sv[i] = 0.004
    seen = set()
    for i in list(nbr.keys()):
        if sv[i] >= 0 or i in seen:
            continue
        comp, stack = [], [i]
        while stack and len(comp) <= 120:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.append(x)
            for j in nbr.get(x, []):
                if sv[j] < 0 and j not in seen:
                    stack.append(j)
        if len(comp) <= 120 and not stack:
            ring = {j for x in comp for j in nbr.get(x, []) if j not in comp}
            if ring and all(sv[j] >= 0 for j in ring):
                for x in comp:
                    sv[x] = 0.004
    # Alanı kesim çizgisi çevresinde yumuşat: basamaklı seçim yerine akıcı bir kenar
    it = field_smooth if field_smooth is not None else (6 if boolish else 2)
    for _ in range(it):
        new = {}
        for i, ns in nbr.items():
            if abs(sv[i]) > 0.04 or not ns:
                continue
            new[i] = sv[i] * 0.5 + 0.5 * sum(sv[j] for j in ns) / len(ns)
        sv.update(new)
    keep = {i for i, x in sv.items() if x >= 0}
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = "G_" + name
    bpy.context.collection.objects.link(dup)
    bm = bmesh.new()
    bm.from_mesh(dup.data)
    bm.verts.ensure_lookup_table()
    orig = bm.verts.layers.int.new("orig")
    for v in bm.verts:
        v[orig] = v.index
    drop = [f for f in bm.faces if not any(v.index in keep for v in f.verts)]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    iso_cut(bm, sv)
    bm.normal_update()
    # Kenar tırtıklarını yumuşat: sınır köşelerini sınır komşularının ortalamasına çek
    boundary = [v for v in bm.verts if v.is_boundary]
    for _ in range(edge_smooth):
        new = {}
        for v in boundary:
            nb = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
            if len(nb) == 2:
                avg = (nb[0].co + nb[1].co) * 0.5
                new[v] = v.co.lerp(avg, 0.6)
        for v, c in new.items():
            v.co = c
    if not name.startswith(("hair", "hood", "ponytail")):
        flatten_hems(bm, name)
    # Kenar yumuşatma halkayı içeri çeker (deri dışarı taşar): sınır ve komşu halkayı gövde yüzeyine geri oturt
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    inv = mw.inverted()
    edge = {v for v in bm.verts if v.is_boundary}
    edge |= {e.other_vert(v) for v in list(edge) for e in v.link_edges}
    for v in edge:
        hit, nrm, _, _ = tree.find_nearest(v.co)
        if hit is not None and (v.co - hit).dot(nrm) < 0.002:
            v.co = hit + nrm * 0.002
    # Tüm yüzeyi yumuşat (ayakkabıda parmakları siler)
    if smooth:
        taubin(bm, [v for v in bm.verts if not v.is_boundary], smooth)
    if soft:
        # Kumaş göğüs gibi bölgelerde vücudun ince ayrıntısını izlemez, tepeler arasında gerilir.
        # Düz Laplace ile ayrıntıyı sil; şişirme payının %60'ından fazla içeri girmesine izin verme.
        region = [v for v in bm.verts if not v.is_boundary and soft(mw @ v.co)]
        nb = {v: [e.other_vert(v) for e in v.link_edges] for v in region}
        for _ in range(soft_iters):
            new = {v: v.co.lerp(sum((u.co for u in nb[v]), Vector()) / len(nb[v]), 0.5) for v in region if nb[v]}
            for v, c in new.items():
                v.co = c
        lim = inflate * 0.6 if soft_floor is None else max(0.0, inflate - soft_floor)
        for v in region:
            hit, nrm, _, _ = tree.find_nearest(v.co)
            if hit is not None and (v.co - hit).dot(nrm) < -lim:
                v.co = hit - nrm * lim
        print("   yumuşak bölge", name, len(region))
    if envelope:
        # Kumaş zarfı: önce yalnızca DIŞA doğru yumuşat (göğüs arası, omurga ve kürek çukurları dolar),
        # sonra kısa bir düz yumuşatma ile küçük tümsekleri (göğüs ucu, göbek) düzleştir; deri dışarı taşmasın.
        region_fn, out_it, in_it = envelope
        reg = [v for v in bm.verts if not v.is_boundary and region_fn(mw @ v.co, dominant(body, body.data.vertices[v[orig]], idx))]
        bm.normal_update()
        n0 = {v: v.normal.copy() for v in reg}
        nb = {v: [e.other_vert(v) for e in v.link_edges] for v in reg}
        for _ in range(out_it):
            new = {}
            for v in reg:
                ns = nb[v]
                if not ns:
                    continue
                avg = sum((u.co for u in ns), Vector()) / len(ns)
                dd = (avg - v.co).dot(n0[v])
                if dd > 0:
                    new[v] = v.co + n0[v] * dd * 0.7
            for v, c in new.items():
                v.co = c
        floor_ = inflate * 0.3
        for _ in range(in_it):
            new = {v: v.co.lerp(sum((u.co for u in nb[v]), Vector()) / len(nb[v]), 0.5) for v in reg if nb[v]}
            for v, c in new.items():
                v.co = c
        for v in reg:
            hit, nrm, _, _ = tree.find_nearest(v.co)
            if hit is not None and (v.co - hit).dot(nrm) < -floor_:
                v.co = hit - nrm * floor_
        print("   zarf", name, len(reg))
    if drape and os.environ.get("DRAPE", "1") == "1":
        # Kumaş düşümü: gövdede asılı kalma, kol/paçada açılma, manşette toplanma
        inv3 = mw.inverted().to_3x3()
        moved = 0
        for v in bm.verts:
            bv = body.data.vertices[v[orig]]
            off = drape(mw @ v.co, dominant(body, bv, idx))
            if off is not None and off.length > 1e-5:
                v.co += inv3 @ off
                moved += 1
        # Düşüm sonrası yüzeyi biraz yumuşat (basamak kalmasın)
        taubin(bm, [v for v in bm.verts if not v.is_boundary], 3)
        print("   düşüm", name, moved)
    bm.normal_update()
    zmin = min((v.co.z for v in bm.verts), default=0)
    nrm_fix = {}
    for v in bm.verts:
        if v.is_boundary:
            inner = [e.other_vert(v) for e in v.link_edges if not e.other_vert(v).is_boundary]
            if inner:
                n = sum((u.normal for u in inner), Vector())
                if n.length > 1e-6:
                    nrm_fix[v] = n.normalized()
    for v, n in nrm_fix.items():
        v.normal = n
    for v in bm.verts:
        k = 1.0
        if thick is not None:
            k = thick(mw @ v.co, sv.get(v[orig], 0.0) if not v.is_boundary else 0.0)
        v.co += v.normal * inflate * k
        if sole and v.co.z < zmin + 0.03:
            v.co.z = zmin - sole  # düz taban
    bm.to_mesh(dup.data)
    bm.free()
    mat = bpy.data.materials.new(mat_name or ("G_" + name))
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.75
    dup.data.materials.clear()
    dup.data.materials.append(mat)
    print("  giysi", name, len(dup.data.vertices), "köşe")
    return dup


def garments(body, rig, sex, eyes=None):
    L = Land(rig, body)
    up = Vector((0, 0, 1))
    arm_len = (L.wrL - L.shL).length
    neckZ = L.neck.z
    armpitZ = L.shL.z - 0.07
    waistZ = L.spine.z + 0.02
    hipZ = L.hipL.z
    kneeZ = L.kneeL.z
    ankZ = L.ankL.z
    halfNeck = 0.065 if sex == "f" else 0.075
    fwd = L.fwd
    mwb = body.matrix_world
    vidx = vg_names(body)

    midX0 = (L.hipL.x + L.hipR.x) / 2
    crotchZ = min(((mwb @ bv.co).z for bv in body.data.vertices
                   if abs((mwb @ bv.co).x - midX0) < 0.012 and kneeZ < (mwb @ bv.co).z < hipZ + 0.05
                   and dominant(body, bv, vidx) in (HIPS | UPLEG)), default=hipZ - 0.08)
    print("  kasık", round(crotchZ, 3), "kalça", round(hipZ, 3))

    # ---------- Kumaş düşümü (drape) ----------
    # Gövde kabuğu: açı × yükseklik ızgarasında gövdenin en dış yarıçapı. Kumaş, üstteki en geniş
    # noktadan (göğüs, kürek) aşağı neredeyse dik düşer; bele yapışmaz.
    TC = Vector((L.spine2.x, L.spine2.y, 0))
    ZB, AB = 0.02, 48
    z0, z1 = hipZ - 0.16, armpitZ + 0.06
    nz = int((z1 - z0) / ZB) + 1
    R = [[0.0] * AB for _ in range(nz)]
    # Her yükseklik diliminin kendi merkezi (bel çukuru öne kıvrılır; sabit merkez "dışarı"yı içeri çevirirdi)
    sums = [[0.0, 0.0, 0] for _ in range(nz)]
    tor = []
    for bv in body.data.vertices:
        p = mwb @ bv.co
        if not (z0 <= p.z <= z1):
            continue
        d = dominant(body, bv, vidx)
        if not (d in TORSO or d in HIPS or (d in UPLEG and p.z > crotchZ + 0.015)):
            continue
        zi = int((p.z - z0) / ZB)
        sums[zi][0] += p.x
        sums[zi][1] += p.y
        sums[zi][2] += 1
        tor.append((p, zi))
    CEN = []
    for zi in range(nz):
        n_ = sums[zi][2]
        CEN.append(Vector((sums[zi][0] / n_, sums[zi][1] / n_, 0)) if n_ else TC.copy())
    # orta yumuşatma (dilimler arası sıçrama olmasın)
    CEN = [sum((CEN[max(0, min(nz - 1, zi + k))] for k in (-2, -1, 0, 1, 2)), Vector()) / 5 for zi in range(nz)]
    # Her dilimin DIŞBÜKEY zarfı: kumaş göğüs uçları, göğüs arası, omurga çukuru ve göbek gibi
    # ayrıntıları izlemez, tepeler arasında gerilir. Zarf yarıçapı açı ızgarasına örneklenir.
    def chull(pts):
        pts = sorted(set(pts))
        if len(pts) < 3:
            return pts
        def cr(o, a, b):
            return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
        lo, up_ = [], []
        for q in pts:
            while len(lo) >= 2 and cr(lo[-2], lo[-1], q) <= 0:
                lo.pop()
            lo.append(q)
        for q in reversed(pts):
            while len(up_) >= 2 and cr(up_[-2], up_[-1], q) <= 0:
                up_.pop()
            up_.append(q)
        return lo[:-1] + up_[:-1]

    def ray_hull(poly, c, ang):
        dx, dy = math.cos(ang), math.sin(ang)
        best = 0.0
        n_ = len(poly)
        for k in range(n_):
            ax, ay = poly[k][0] - c.x, poly[k][1] - c.y
            bx, by = poly[(k + 1) % n_][0] - c.x, poly[(k + 1) % n_][1] - c.y
            ex, ey = bx - ax, by - ay
            den = dx * ey - dy * ex
            if abs(den) < 1e-9:
                continue
            t = (ax * ey - ay * ex) / den
            u = (ax * dy - ay * dx) / den
            if t > 0 and -1e-6 <= u <= 1 + 1e-6:
                best = max(best, t)
        return best

    slices = [[] for _ in range(nz)]
    for p, zi in tor:
        slices[zi].append((round(p.x, 4), round(p.y, 4)))
    for zi in range(nz):
        poly = chull(slices[zi])
        if len(poly) < 3:
            continue
        for a in range(AB):
            ang = (a + 0.5) / AB * 2 * math.pi - math.pi
            R[zi][a] = ray_hull(poly, CEN[zi], ang)
    # boş dilimleri komşudan doldur, sonra açı ve yükseklikte yumuşat (göğüs ucu kabarcığı kalmasın)
    for zi in range(nz):
        if max(R[zi]) == 0.0:
            src = next((R[k] for d_ in range(1, nz) for k in (zi - d_, zi + d_) if 0 <= k < nz and max(R[k]) > 0), None)
            if src:
                R[zi] = list(src)
    R = [[max(R[max(0, min(nz - 1, zi + dz))][(a + da) % AB] for dz in (-2, -1, 0, 1, 2) for da in (-2, -1, 0, 1, 2)) for a in range(AB)] for zi in range(nz)]
    for _ in range(3):
        R = [[(R[zi][(a - 1) % AB] + 2 * R[zi][a] + R[zi][(a + 1) % AB]) / 4 for a in range(AB)] for zi in range(nz)]
    for _ in range(2):
        R = [[(R[max(0, zi - 1)][a] + 2 * R[zi][a] + R[min(nz - 1, zi + 1)][a]) / 4 for a in range(AB)] for zi in range(nz)]
    RH = R

    def hull(slope):
        H = [[0.0] * AB for _ in range(nz)]
        for a in range(AB):
            run = 0.0
            for zi in range(nz - 1, -1, -1):
                run = max(R[zi][a], run - slope * ZB)
                H[zi][a] = run
        return H

    def torso_hang(slope, bulk=0.0, hem=None):
        H = hull(slope)
        hem_z = hipZ if hem is None else hem

        def f(p, d):
            if not (d in TORSO or d in HIPS or d in UPLEG) or p.z > armpitZ - 0.02 or p.z < z0:
                return None
            zi = min(nz - 1, max(0, int((p.z - z0) / ZB)))
            dxy = Vector((p.x, p.y, 0)) - CEN[zi]
            r = dxy.length
            if r < 1e-4:
                return None
            a = int(((math.atan2(dxy.y, dxy.x) + math.pi) / (2 * math.pi)) * AB) % AB
            # Koltuk altı ve omuz yanında etkiyi yumuşat (omuz biçimi bozulmasın); göğüs ve sırt
            # ortasında koltuk altının üstüne kadar tam etki (göğüs ucu ve kürek çizgisi görünmesin)
            k = min(1.0, (armpitZ - 0.02 - p.z) / 0.08)
            # Etek ucunda kumaş yeniden kalçaya/bele oturur (arkada içi görünmesin)
            k *= 0.6 + 0.4 * smooth01((p.z - hem_z) / 0.13)
            want = (H[zi][a] + bulk - r) * k
            return dxy.normalized() * want if want > 0 else None

        return f

    def arm_radial(p, side):
        a, b = (L.shL, L.wrL) if side == "L" else (L.shR, L.wrR)
        t = max(0.0, min(1.0, along(p, a, b)))
        q = a + (b - a) * t
        d = p - q
        return (d.normalized() if d.length > 1e-5 else None), t

    def sleeve(profile):
        """profile(t) → dışa ek (m); t omuz 0 → bilek 1. Taraf ve konum geometriden (kemik sınırında basamak olmasın);
        koltuk altından yumuşak başlar."""
        sgnL = (L.shL - L.spine2).dot(L.right)

        def f(p, d):
            if is_hand(d):
                return None
            side_ = "L" if (p - L.spine2).dot(L.right) * sgnL > 0 else "R"
            dirv, t = arm_radial(p, side_)
            a, b = (L.shL, L.wrL) if side_ == "L" else (L.shR, L.wrR)
            tt = along(p, a, b)
            if dirv is None or tt < 0.0:
                return None
            # yalnızca kolun kendisi: eksene yakın noktalar (A pozunda kalça da "kol yönünde" kalıyor)
            q = a + (b - a) * max(0.0, min(1.0, tt))
            if (p - q).length > 0.085 or (arm_t(p, d) is None and tt > 0.25):
                return None
            ramp = smooth01((tt - 0.03) / 0.14)
            if ramp <= 0:
                return None
            return dirv * profile(t) * ramp

        return f

    def leg_radial(p, side):
        hp, kn, an = (L.hipL, L.kneeL, L.ankL) if side == "L" else (L.hipR, L.kneeR, L.ankR)
        if p.z > kn.z:
            a, b = hp, kn
        else:
            a, b = kn, an
        t = max(0.0, min(1.0, along(p, a, b)))
        q = a + (b - a) * t
        d = Vector((p.x - q.x, p.y - q.y, 0))
        return d.normalized() if d.length > 1e-5 else None

    midX = (L.hipL.x + L.hipR.x) / 2

    def legwear(profile):
        """profile(z) → dışa ek (m). İç bacakta yarısı (iki paça birbirine girmesin)."""
        def f(p, d):
            if not (d in UPLEG or d in LEG or d in FOOT):
                return None
            if p.z > hipZ - 0.04:
                return None
            side = "L" if (p.x - midX) * (L.hipL.x - midX) > 0 else "R"
            dirv = leg_radial(p, side)
            if dirv is None:
                return None
            outward = Vector((p.x - midX, 0, 0)).normalized() if abs(p.x - midX) > 1e-4 else Vector((0, 0, 0))
            inner = dirv.dot(outward) < -0.3
            k = 0.5 if inner else 1.0
            # Kalçadan bacağa geçişte yumuşak başla
            k *= min(1.0, (hipZ - 0.04 - p.z) / 0.1)
            return dirv * profile(p.z) * k

        return f

    def waist_tuck(p, d):
        """Altların bel bandı üstlerin altında kalsın: kalça çizgisinden yukarısı 8 mm içeri."""
        if p.z < hipZ - 0.03 or p.z < z0 or p.z > z1:
            return None
        zi = min(nz - 1, max(0, int((p.z - z0) / ZB)))
        dxy = Vector((p.x, p.y, 0)) - CEN[zi]
        if dxy.length < 1e-4:
            return None
        return dxy.normalized() * (-0.013 * smooth01((p.z - (hipZ - 0.03)) / 0.05))

    def pelvis_fill(cap=0.02):
        """Kasık ve kalça çizgisini kumaşla doldur: dilimin dışbükey zarfına (en çok cap kadar) it."""
        def f(p, d):
            if not (d in HIPS or d in UPLEG or d == B("Spine")):
                return None
            if p.z < crotchZ or p.z > hipZ + 0.02 or p.z < z0 or p.z > z1:
                return None
            zi = min(nz - 1, max(0, int((p.z - z0) / ZB)))
            dxy = Vector((p.x, p.y, 0)) - CEN[zi]
            r = dxy.length
            if r < 1e-4:
                return None
            a = int(((math.atan2(dxy.y, dxy.x) + math.pi) / (2 * math.pi)) * AB) % AB
            rh = RH[zi][a]
            if r < 0.55 * rh:
                return None
            want = min(cap, rh - r) * smooth01((p.z - crotchZ) / 0.07) * (1 - smooth01((p.z - (hipZ - 0.04)) / 0.06))
            return dxy.normalized() * want if want > 0 else None

        return f

    def combine(*fs):
        def f(p, d):
            tot = None
            for g in fs:
                o = g(p, d)
                if o is not None:
                    tot = o if tot is None else tot + o
            return tot

        return f

    def smooth01(x):
        x = max(0.0, min(1.0, x))
        return x * x * (3 - 2 * x)

    def cuff(t, start, gather):
        """Manşet: start'tan sonra dar (0), hemen öncesinde gather kadar kabarık."""
        if t > start:
            return 0.0
        return gather * smooth01(1 - abs(t - (start - 0.07)) / 0.07)

    def front(p):  # öne doğru (+) uzaklık, gövde ortasına göre
        return (p - L.spine2).dot(fwd)

    def side(p):
        return abs((p - L.spine2).dot(L.right))

    neckC = Vector((L.neck.x, L.neck.y, 0))

    def neck_dist(p):
        return (Vector((p.x, p.y, 0)) - neckC).length

    def neckline(p, depth_front, depth_back):
        """Yaka: boyun çevresinde, önde daha derin bir oyuk."""
        r = halfNeck + 0.012
        if neck_dist(p) > r + 0.02:
            return False
        dz = depth_front if front(p) > 0.01 else depth_back
        return p.z > neckZ - dz

    def upper_body(p, d):
        """Gövde + omuz üstü (boyun kemiğine düşen omuz köşeleri dahil)."""
        if d in TORSO or (d in HIPS and p.z > hipZ - 0.06) or d in UPLEG and p.z > hipZ - 0.06:
            return True
        return d in NECK and neck_dist(p) > halfNeck + 0.012 and p.z < neckZ + 0.03

    def is_hand(d):
        return d.startswith(HANDS_PREFIX) and d not in (B("LeftHand"), B("RightHand"))

    def arm_t(p, d):
        """Kol kemiklerine düşen köşe için omuzdan bileğe konum (omuz içi negatif); değilse None."""
        if d in ARM_L or d == B("LeftForeArm") or d == B("LeftHand"):
            return along(p, L.shL, L.wrL)
        if d in ARM_R or d == B("RightForeArm") or d == B("RightHand"):
            return along(p, L.shR, L.wrR)
        return None

    def torso_ok(p, d, top_z):
        if d in TORSO or (d in HIPS and p.z > hipZ - 0.02):
            return p.z < top_z
        return False

    out = []
    neckBase = Vector((L.neck.x, L.neck.y, neckZ))

    def crew(p, d, drop_front, drop_back, rad):
        """Yuvarlak yaka alanı (>0 giysi): boyun çevresinde yatay elips, önde daha derin."""
        if d in HEADS or (d in NECK and p.z > neckZ + 0.05):
            return -0.05
        rel = p - neckBase
        fr = rel.dot(fwd)
        sd = rel.dot(L.right)
        k = 0.5 + 0.5 * math.tanh(fr / 0.03)
        zc = -(drop_back + (drop_front - drop_back) * k)
        e = math.hypot(sd / rad, fr / (rad * 1.08))
        return max((e - 1.0) * rad, zc - rel.z)

    def body_part(d):
        return d in TORSO or d in HIPS or d in UPLEG or d in NECK

    def top_field(hem_z, sleeve_t, neck):
        def f(p, d, v):
            if is_hand(d) or d in LEG or d in FOOT:
                return -0.05
            t = arm_t(p, d)
            if t is not None:
                return (sleeve_t - t) * arm_len
            if d in HEADS:
                return -0.05
            if not body_part(d):
                return -0.05
            return min(p.z - hem_z, neck(p, d))

        return f

    # -- Üstler --
    def tank(p, d, v):
        if is_hand(d) or arm_t(p, d) is not None or d in HEADS or d in LEG or d in FOOT:
            return -0.05
        if not body_part(d):
            return -0.05
        hem = p.z - (hipZ + 0.05)
        sd = side(p)
        so = halfNeck + (0.04 if sex == "f" else 0.055)
        si = halfNeck + 0.008
        arm = max(so - sd, (armpitZ - 0.01) - p.z)
        k = 0.5 + 0.5 * math.tanh(front(p) / 0.03)
        nzz = armpitZ + 0.1 - 0.055 * k
        neck = max(sd - si, nzz - p.z)
        return min(hem, arm, neck)

    def chest(p):
        return front(p) > 0.02 and armpitZ - 0.2 < p.z < armpitZ + 0.04 and side(p) < 0.17

    rad = halfNeck + 0.022

    def torso_env(p, d):
        return (d in TORSO or d in HIPS or d in NECK) and p.z > hipZ - 0.05

    ENV = (torso_env, 45, 6)

    def hem_ease(gain):
        """Üstün belden aşağısı bollaşır: altların bel bandının her zaman dışında kalır, etek hafif açılır."""
        def t(p, sv_):
            return 1.0 + gain * smooth01((waistZ + 0.03 - p.z) / 0.08)

        return t
    out.append(make_garment(body, "tank", tank, 0.006, thick=hem_ease(1.6), envelope=(torso_env, 25, 4)))
    out.append(make_garment(body, "tee", top_field(hipZ + 0.035, 0.36, lambda p, d: crew(p, d, 0.05, 0.015, rad)), 0.009, thick=hem_ease(0.9), envelope=ENV,
                            drape=sleeve(lambda t: 0.003 + 0.022 * smooth01(t / 0.36))))

    def turtle(extra):
        def f(p, d):
            if d in HEADS:
                return -0.05
            return (neckZ + extra) - p.z

        return f

    out.append(make_garment(body, "sweat", top_field(hipZ, 0.97, lambda p, d: crew(p, d, 0.035, 0.012, rad)), 0.016, thick=hem_ease(0.5), envelope=ENV,
                            drape=sleeve(lambda t: 0.008 * smooth01(t / 0.2) + cuff(t, 0.9, 0.01))))
    out.append(make_garment(body, "sweater", top_field(hipZ, 0.97, turtle(0.07)), 0.02, thick=hem_ease(0.4), envelope=ENV,
                            drape=sleeve(lambda t: 0.009 * smooth01(t / 0.2) + cuff(t, 0.9, 0.009))))
    hoodie = make_garment(body, "hoodie", top_field(hipZ, 0.97, lambda p, d: crew(p, d, 0.035, 0.012, rad)), 0.018, thick=hem_ease(0.5), envelope=ENV,
                          drape=sleeve(lambda t: 0.011 * smooth01(t / 0.2) + cuff(t, 0.9, 0.012)))
    out.append(hoodie)

    headC = Vector((L.head.x, L.head.y, L.head.z))

    def head_front(p):
        return (p - headC).dot(fwd)

    # Sırta düşmüş kapüşon: boyun çevresinde kalın bir yaka rulosu + sırtta üstü geniş, ucu
    # kürek kemikleri arasında sivrilen yumuşak bir torba.
    hz_hi = neckZ + 0.03
    hz_lo = neckZ - 0.3

    def hood_w(z):
        t = max(0.0, min(1.0, (z - hz_lo) / (hz_hi - hz_lo)))
        return 0.03 + 0.16 * t ** 0.8

    def hood(p, d, v):
        if is_hand(d) or arm_t(p, d) is not None:
            return False
        if p.z > hz_hi or p.z < hz_lo:
            return False
        fr = front(p)
        collar = neck_dist(p) < halfNeck + 0.075 and p.z > neckZ - 0.06 and fr < 0.045
        bag = fr < -0.02 and side(p) < hood_w(p.z)
        return collar or bag

    back_dir = (-fwd * 0.92 + Vector((0, 0, 0.25))).normalized()

    def hood_bulge(p, d):
        t = max(0.0, min(1.0, (p.z - hz_lo) / (hz_hi - hz_lo)))
        sn = min(1.0, side(p) / max(0.02, hood_w(p.z)))
        fr = front(p)
        bag = 0.0
        if fr < 0.0:
            bag = 0.06 * (1 - sn * sn) ** 0.6 * smooth01(t / 0.35) * (1.0 - 0.25 * t)
        # Yaka rulosu: boyun tabanında her yönde kalın
        roll = 0.025 * smooth01(1 - abs(p.z - (neckZ - 0.025)) / 0.045) if neck_dist(p) < halfNeck + 0.08 else 0.0
        dxy = Vector((p.x - L.neck.x, p.y - L.neck.y, 0))
        rdir = dxy.normalized() if dxy.length > 1e-4 else back_dir
        return back_dir * bag + rdir * roll

    out.append(make_garment(body, "hood", hood, 0.02, edge_smooth=14, smooth=6, drape=hood_bulge))

    # Alt katman: her zaman giyili (kadında spor sütyeni + külot, erkekte boxer)
    if sex == "f":
        def bra(p, d, v):
            if not (d in TORSO):
                return False
            top = armpitZ + 0.02
            bottom = L.spine2.z - 0.09
            if p.z < bottom or p.z > top + 0.04:
                return False
            if p.z > top and side(p) < halfNeck + 0.01:
                return False
            return side(p) < (halfNeck + 0.06) or p.z < top
        out.append(make_garment(body, "bra", bra, 0.004))

    def brief(p, d, v):
        if d in HIPS or d in UPLEG:
            lo = hipZ - (0.1 if sex == "f" else 0.16)
            return lo < p.z < waistZ - 0.03
        return False

    out.append(make_garment(body, "brief", brief, 0.003, drape=pelvis_fill(0.012)))

    # -- Altlar --
    def pants(bottom_z, top_z=waistZ):
        def f(p, d, v):
            if d in HIPS or d in UPLEG or d in LEG or d == B("Spine") or d == B("Spine1"):
                return min(top_z - p.z, p.z - bottom_z)
            return -0.05

        return f

    short_z = hipZ - (hipZ - kneeZ) * 0.55
    bike_z = hipZ - (hipZ - kneeZ) * 0.8
    out.append(make_garment(body, "shorts", pants(short_z), 0.016, drape=combine(waist_tuck, pelvis_fill(0.025), legwear(lambda z: 0.006 + 0.03 * smooth01((hipZ - 0.04 - z) / (hipZ - 0.04 - short_z))))))
    out.append(make_garment(body, "bball", pants(kneeZ - 0.03), 0.022, drape=combine(waist_tuck, pelvis_fill(0.03), legwear(lambda z: 0.012 + 0.05 * smooth01((hipZ - 0.04 - z) / (hipZ - kneeZ))))))
    out.append(make_garment(body, "bike", pants(bike_z), 0.005, drape=pelvis_fill(0.01)))
    out.append(make_garment(body, "leggings", pants(ankZ + 0.02), 0.005, drape=pelvis_fill(0.01)))
    out.append(make_garment(body, "joggers", pants(ankZ + 0.03), 0.014, drape=combine(waist_tuck, pelvis_fill(0.025), legwear(lambda z: (0.0 if z < ankZ + 0.09 else 0.016 + 0.012 * smooth01(1 - abs(z - (ankZ + 0.15)) / 0.07)) * smooth01((z - ankZ - 0.03) / 0.06)))))
    out.append(make_garment(body, "track", pants(ankZ + 0.015), 0.016, drape=combine(waist_tuck, pelvis_fill(0.025), legwear(lambda z: 0.012 + 0.02 * smooth01((kneeZ - z) / (kneeZ - ankZ))))))

    # -- Ayakkabılar --
    def shoe(top_z):
        def f(p, d, v):
            return (d in FOOT or d in LEG) and p.z < top_z

        return f

    out.append(build_shoe(body, rig, "runner", 0.0))
    out.append(build_shoe(body, rig, "hightop", 0.085))

    def sock(p, d, v):
        return (d in LEG or d in FOOT) and ankZ - 0.01 < p.z < ankZ + 0.13

    out.append(make_garment(body, "socks", sock, 0.004, smooth=4))

    # -- Saç -- (göz ve kulak konumlarından gerçek saç çizgisi)
    eyeP = [eyes.matrix_world @ v.co for v in eyes.data.vertices] if eyes else []
    if eyeP:
        M = sum(eyeP, Vector()) / len(eyeP)
    else:
        M = Vector((L.head.x, L.head.y, L.head.z + 0.06)) + fwd * 0.08
    # kulak: göz hizasının biraz altında, gözlerin epey arkasında en dışa taşan nokta
    ear = None
    for bv in body.data.vertices:
        q = mwb @ bv.co
        r_ = q - M
        if -0.045 < r_.z < 0.01 and r_.dot(fwd) < -0.05 and r_.dot(L.right) > 0:
            if ear is None or r_.dot(L.right) > (ear - M).dot(L.right):
                ear = q
    ear = ear or (M - fwd * 0.09 + L.right * 0.075)
    earY, earZ, earX = (ear - M).dot(fwd), (ear - M).z, (ear - M).dot(L.right)
    print("  göz", tuple(round(c, 3) for c in M), "kulak y/z/x", round(earY, 3), round(earZ, 3), round(earX, 3))
    HAIR_BONES = HEADS | NECK

    def hair_field(front_z, recede, side_z, nape_z):
        def f(p, d, v):
            if d not in HAIR_BONES or is_hand(d) or arm_t(p, d) is not None:
                return -0.05
            r_ = p - M
            x = abs(r_.dot(L.right))
            y = r_.dot(fwd)
            z = r_.z
            # alın çizgisi ortada en alçak, şakaklara doğru yuvarlanarak yükselir (kâse kesimi gibi düz değil)
            zf_front = front_z + recede * smooth01((x - 0.012) / 0.04) + 0.007 * min(1.0, (x / 0.05) ** 2)
            # önden (alın) yana: şakakta favoriye iner; kulak arkasında ense çizgisine
            k = smooth01((y - (earY + 0.028)) / 0.04)
            zf = side_z + (zf_front - side_z) * k
            k2 = smooth01((y - (earY - 0.005)) / 0.03)
            zf = nape_z + (zf - nape_z) * k2
            # gerçek saç çizgisi düz değildir: birkaç milimetrelik düzensizlik
            jag = 0.0018 * math.sin(x * 410 + 1.3) * math.sin(y * 370 + 0.4) + 0.0012 * math.sin(x * 1150 + y * 830)
            line = z - zf + jag
            # kulak ve çevresi açık
            ex = (y - (earY + 0.006)) / 0.034
            ez = (z - (earZ + 0.004)) / 0.042
            ear_s = (math.hypot(ex, ez) - 1.0) * 0.03 if x > earX - 0.035 else 0.05
            return min(line, ear_s)

        return f

    def hair_thick(top_gain, edge=0.012, floor=0.3):
        def t(p, sv_):
            z = (p - M).z
            vol = 1.0 + top_gain * smooth01((z - 0.03) / 0.07)
            return (floor + (1 - floor) * smooth01(sv_ / edge)) * vol

        return t

    # cilt boyaması için doğal saçın çizgisi (saç dibinin koyuluğu, yumuşak geçiş)
    globals()["_HAIR_PARAMS"] = ((0.06, 0.01, -0.002, -0.082) if sex == "m" else (0.057, -0.004, -0.004, -0.092), earY, earZ, earX)
    if sex == "m":
        out.append(make_garment(body, "hair_short", hair_field(0.06, 0.01, -0.002, -0.082), 0.006, smooth=4, edge_smooth=2, thick=hair_thick(1.6, 0.022, 0.12)))
        out.append(make_garment(body, "hair_long", hair_field(0.06, 0.0, -0.01, -0.095), 0.009, smooth=4, edge_smooth=2, thick=hair_thick(1.4)))
    else:
        out.append(make_garment(body, "hair_short", hair_field(0.058, 0.0, 0.0, -0.085), 0.006, smooth=4, edge_smooth=2, thick=hair_thick(1.3)))
        out.append(make_garment(body, "hair_long", hair_field(0.057, -0.004, -0.004, -0.092), 0.0055, smooth=4, edge_smooth=2, thick=hair_thick(0.45, 0.012, 0.2)))
    globals()["_HAIR_REF"] = (M.copy(), earY)
    return out


def build_shoe(body, rig, name, collar):
    """Ayak ölçüsüne göre sıfırdan ayakkabı: kesitleri topuktan buruna dizilmiş yuvarlatılmış kutu.
    collar: bilekten yukarı yaka yüksekliği (basket botu için)."""
    L = Land(rig, body)
    mw = body.matrix_world
    me = bpy.data.meshes.new("G_" + name)
    obj = bpy.data.objects.new("G_" + name, me)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    groups = {}
    up = Vector((0, 0, 1))
    for side in ("Left", "Right"):
        ank = mw @ rig.data.bones[B(side + "Foot")].head_local
        toe = mw @ rig.data.bones[B(side + "ToeBase")].head_local
        fwd = Vector((toe.x - ank.x, toe.y - ank.y, 0)).normalized()
        rgt = fwd.cross(up).normalized()
        # Ayak köşelerinden boy/en
        pts = [mw @ v.co for v in body.data.vertices if (mw @ v.co).z < ank.z + 0.02 and (mw @ v.co - ank).length < 0.3]
        pts = [p for p in pts if (p - ank).dot(rgt) * (1 if side == "Left" else -1) > -0.2]
        fw = [(p - ank).dot(fwd) for p in pts]
        rw = [(p - ank).dot(rgt) for p in pts]
        heel, tip = min(fw) - 0.01, max(fw) + 0.012
        cr = (max(rw) + min(rw)) / 2
        width = (max(rw) - min(rw)) + 0.016
        top = ank.z + 0.06
        N = 18  # kesit noktası
        S = 14  # kesit sayısı
        rings = []
        for i in range(S):
            t = i / (S - 1)
            f = heel + (tip - heel) * t
            # Genişlik: topukta dar, parmaklarda geniş, burunda yuvarlanır
            wk = 0.78 + 0.22 * math.sin(min(1, t * 1.25) * math.pi * 0.62)
            if t > 0.86:
                wk *= math.cos((t - 0.86) / 0.14 * math.pi * 0.42)
            hk = top - (top - 0.055) * min(1, max(0, (t - 0.42) / 0.58)) ** 0.7
            h = max(0.035, hk)
            if t > 0.9:
                h *= 0.85
            w = width * wk / 2
            ring = []
            for j in range(N):
                a = (j / N) * math.pi * 2
                cx, cz = math.cos(a), math.sin(a)
                # yuvarlatılmış dikdörtgen (superellipse)
                ex = math.copysign(abs(cx) ** 0.55, cx)
                ez = math.copysign(abs(cz) ** 0.55, cz)
                local = Vector((0, 0, 0)) + rgt * (cr + ex * w) + fwd * f
                z = h / 2 + ez * h / 2
                p = Vector((ank.x, ank.y, 0)) + local
                p.z = max(0.0, z)
                ring.append(bm.verts.new(p))
            rings.append(ring)
        for i in range(S - 1):
            for j in range(N):
                a, b2 = rings[i][j], rings[i][(j + 1) % N]
                c, d = rings[i + 1][(j + 1) % N], rings[i + 1][j]
                bm.faces.new((a, b2, c, d))
        # burun ve topuk kapakları
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
        # Bilek yakası (basket botu): ayak bileğini saran tüp
        if collar > 0:
            leg = mw @ rig.data.bones[B(side + "Leg")].head_local
            axis = (leg - ank).normalized()
            rad = 0.052 if True else 0.05
            cring = []
            for k in range(4):
                z = top - 0.01 + collar * k / 3
                c0 = ank + axis * ((z - ank.z) / max(1e-4, axis.z)) + fwd * 0.005
                ring = []
                for j in range(N):
                    a = (j / N) * math.pi * 2
                    p = c0 + rgt * math.cos(a) * rad * (1.0 - 0.06 * k) + fwd * math.sin(a) * rad * 1.1 * (1.0 - 0.06 * k)
                    p.z = z
                    ring.append(bm.verts.new(p))
                cring.append(ring)
            for k in range(3):
                for j in range(N):
                    bm.faces.new((cring[k][j], cring[k][(j + 1) % N], cring[k + 1][(j + 1) % N], cring[k + 1][j]))
            groups.setdefault(side + "Leg", []).extend(v for v in cring[3] + cring[2])
            groups.setdefault(side + "Foot", []).extend(v for v in cring[0] + cring[1])
        for i, ring in enumerate(rings):
            key = side + ("ToeBase" if i > S * 0.62 else "Foot")
            groups.setdefault(key, []).extend(ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    bm.to_mesh(me)
    vmap = {}
    for idx, v in enumerate(bm.verts):
        vmap[v] = idx
    for gname, vs in groups.items():
        vg = obj.vertex_groups.new(name=B(gname))
        vg.add([vmap[v] for v in vs], 1.0, "REPLACE")
    bm.free()
    me.validate()
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    mat = bpy.data.materials.new("G_" + name)
    me.materials.append(mat)
    for poly in me.polygons:
        poly.use_smooth = True
    print("  ayakkabı", name, len(me.vertices))
    return obj


def split_feet(body, rig):
    """Ayakkabının altında kalan çıplak ayağı ayrı mesh yap (oyunda hep gizli)."""
    L = Land(rig, body)
    cut = L.ankL.z + 0.02
    mw = body.matrix_world
    keep = {v.index for v in body.data.vertices if (mw @ v.co).z < cut}
    dup = body.copy()
    dup.data = body.data.copy()
    dup.name = "Feet"
    bpy.context.collection.objects.link(dup)
    for obj, inside in ((dup, True), (body, False)):
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        if inside:
            drop = [f for f in bm.faces if not all(v.index in keep for v in f.verts)]
        else:
            drop = [f for f in bm.faces if all(v.index in keep for v in f.verts)]
        bmesh.ops.delete(bm, geom=drop, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(obj.data)
        bm.free()
    return dup


def ponytail(rig, sex):
    """Ensenin üstünden bağlanan, sırta doğru kıvrılıp sivrilen tutamlı at kuyruğu."""
    body = bpy.data.objects["Body"]
    L = Land(rig, body)
    mw = body.matrix_world
    M, earY = globals().get("_HAIR_REF", (Vector((L.head.x, L.head.y, L.head.z + 0.06)), -0.09))
    fwd, right, upv = L.fwd, L.right, Vector((0, 0, 1))
    back = -fwd
    # bağlama noktası: göz hizasının 3 cm üstünde kafanın en arka yüzeyi
    zA = M.z + 0.035
    best = None
    for v in body.data.vertices:
        q = mw @ v.co
        if abs(q.z - zA) < 0.012 and abs((q - M).dot(right)) < 0.02:
            if best is None or (q - M).dot(back) > (best - M).dot(back):
                best = q
    A = (best or (M + back * 0.17)) + back * 0.008
    P = [A, A + back * 0.032 - upv * 0.006, A + back * 0.048 - upv * 0.075, A + back * 0.045 - upv * 0.17, A + back * 0.034 - upv * 0.27]

    def bez(t):
        # Catmull-Rom benzeri: kontrol noktaları arasında yumuşak eğri
        n = len(P) - 1
        x = t * n
        i = min(n - 1, int(x))
        u = x - i
        p0, p1, p2, p3 = P[max(0, i - 1)], P[i], P[i + 1], P[min(n, i + 2)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)

    NS, NR = 40, 18
    me = bpy.data.meshes.new("G_ponytail")
    obj = bpy.data.objects.new("G_ponytail", me)
    bpy.context.collection.objects.link(obj)
    bm = bmesh.new()
    rings, ts = [], []
    for i in range(NS + 1):
        t = i / NS
        c = bez(t)
        tan = (bez(min(1, t + 0.01)) - bez(max(0, t - 0.01))).normalized()
        side = right - tan * right.dot(tan)
        side.normalize()
        nrm = tan.cross(side).normalized()
        # yarıçap: bağda ince, hemen kabarır, uca doğru sivrilir
        if t < 0.04:
            r = 0.017 + 0.003 * (t / 0.04)
        else:
            r = 0.018 + 0.011 * math.sin(min(1.0, (t - 0.04) / 0.16) * math.pi / 2)
            r *= (1 - smoothstep_py((t - 0.3) / 0.7)) * 0.85 + 0.15 * (1 - t)
            r = max(r, 0.003)
        ring = []
        for j in range(NR):
            ang = j / NR * 2 * math.pi
            # tutamlar: açı boyunca dalgalı kesit, uca doğru belirginleşir
            clump = 1 + (0.08 + 0.18 * t) * math.sin(6 * ang + 3.1 * t) + (0.04 + 0.08 * t) * math.sin(13 * ang + 9 * t)
            off = (side * math.cos(ang) * 1.0 + nrm * math.sin(ang) * 0.82) * r * clump
            ring.append(bm.verts.new(c + off))
        rings.append(ring)
        ts.append(t)
    for i in range(NS):
        for j in range(NR):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % NR], rings[i + 1][(j + 1) % NR], rings[i + 1][j]))
    tip = bm.verts.new(bez(1.0) + (bez(1.0) - bez(0.98)).normalized() * 0.01)
    for j in range(NR):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % NR], tip))
    cap = bm.verts.new(bez(0.0) - (bez(0.02) - bez(0.0)).normalized() * 0.006)
    for j in range(NR):
        bm.faces.new((rings[0][(j + 1) % NR], rings[0][j], cap))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.verts.index_update()
    bm.to_mesh(me)
    wt = {}
    for i, ring in enumerate(rings):
        for v in ring:
            wt[v.index] = ts[i]
    wt[tip.index] = 1.0
    wt[cap.index] = 0.0
    bm.free()
    gh = obj.vertex_groups.new(name=B("Head"))
    gn = obj.vertex_groups.new(name=B("Neck"))
    gs = obj.vertex_groups.new(name=B("Spine2"))
    for i, t in wt.items():
        h = 1.0 - smoothstep_py((t - 0.15) / 0.85) * 0.75
        gh.add([i], h, "REPLACE")
        rest = 1.0 - h
        gn.add([i], rest * 0.4, "REPLACE")
        gs.add([i], rest * 0.6, "REPLACE")
    for poly in me.polygons:
        poly.use_smooth = True
    obj.parent = rig
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    mat = bpy.data.materials.new("G_ponytail")
    me.materials.append(mat)
    print("  at kuyruğu", len(me.vertices))
    return obj


def smoothstep_py(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def import_xbot():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=XBOT)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new if o.type == "ARMATURE")
    meshes = [o for o in new if o.type == "MESH"]
    acts = {}
    for a in list(bpy.data.actions):
        if not a.name.startswith("src_"):
            acts[a.name] = a
            a.name = "src_" + a.name
    if arm.animation_data:
        arm.animation_data_clear()
    # Boyu hedefe eşitle
    bpy.context.view_layer.update()
    return arm, meshes, acts


def animate(rig, body):
    src, src_meshes, src_actions = import_xbot()
    top_t = max((body.matrix_world @ v.co).z for v in body.data.vertices)
    hs = (src.matrix_world @ src.data.bones["mixamorig:HeadTop_End"].head_local).z
    src.scale = src.scale * (top_t / max(0.1, hs))
    bpy.context.view_layer.update()
    g = {"tgt": rig, "src": src, "src_meshes": src_meshes, "src_actions": src_actions, "scene": bpy.context.scene, "FPS": FPS, "__name__": "anim"}
    code = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "anim_block.py")).read()
    exec(compile(code, "anim_block.py", "exec"), g)
    print("REST_DOWN", round(g.get("REST_DOWN", 0), 1))
    g["rest_pose"]()
    rig.animation_data.action = bpy.data.actions.get("idle")
    for a in bpy.data.actions:
        a.use_fake_user = True


if __name__ == "__main__" and os.environ.get("STAGE", "") in ("garments", "full"):
    for sex in ("f", "m"):
        reset_scene()
        body, rig = make_human(sex)
        eyes, hair = split_helpers(body)
        bpy.data.objects.remove(hair, do_unlink=True)
        bpy.context.view_layer.update()
        gs = garments(body, rig, sex, eyes)
        if sex == "f":
            gs.append(ponytail(rig, sex))
        feet = split_feet(body, rig)
        skin_material([body, feet], skin_texture(os.path.join(OUT_DIR, f"skin_{sex}.png"), body, eyes, sex, rig))
        em = bpy.data.materials.new("EyeMat")
        eyes.data.materials.clear()
        eyes.data.materials.append(em)
        if os.environ.get("STAGE") == "full":
            animate(rig, body)
            export(rig, [body, feet, eyes] + gs, os.path.join(OUT_DIR, f"athlete_{sex}.glb"))
        else:
            export(rig, [body, feet, eyes] + gs, os.path.join(OUT_DIR, f"gar_{sex}.glb"))

if __name__ == "__main__" and os.environ.get("STAGE", "") == "base":
    for sex in ("f", "m"):
        reset_scene()
        body, rig = make_human(sex)
        eyes, hair = split_helpers(body)
        bpy.context.view_layer.update()
        top = max((body.matrix_world @ v.co).z for v in body.data.vertices)
        print(sex, "boy", round(top, 3), "kemik", [b.name.replace("mixamorig:", "") for b in rig.data.bones])
        export(rig, [body, eyes, hair], os.path.join(OUT_DIR, f"base_{sex}.glb"))
