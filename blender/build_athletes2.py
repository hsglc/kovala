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
    "f": {"gender": 0.0, "age": 0.45, "muscle": 0.68, "weight": 0.42, "proportions": 0.75, "height": 0.78, "cupsize": 0.45, "firmness": 0.7,
          "race": {"asian": 0.15, "caucasian": 0.7, "african": 0.15}},
    "m": {"gender": 1.0, "age": 0.45, "muscle": 0.75, "weight": 0.45, "proportions": 0.75, "height": 0.6, "cupsize": 0.5, "firmness": 0.5,
          "race": {"asian": 0.1, "caucasian": 0.7, "african": 0.2}},
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


def skin_texture(path):
    """MakeHuman UV maskelerinden ten dokusu: beyaz zemin (oyunda ten rengiyle çarpılır), dudak ve göz kapağı tonları."""
    from PIL import Image, ImageChops, ImageFilter
    tex = "/root/.config/blender/5.2/extensions/user_default/mpfb/data/textures/"
    S = 1024
    base = Image.new("RGB", (S, S), (255, 255, 255))

    def tint(mask_file, rgb, blur=2):
        m = Image.open(tex + mask_file).convert("L").resize((S, S)).filter(ImageFilter.GaussianBlur(blur))
        layer = Image.new("RGB", (S, S), rgb)
        return Image.composite(layer, base, m)

    base = tint("mpfb_eyelids.jpg", (214, 186, 178))
    base = tint("mpfb_lips.jpg", (178, 104, 100), 1.5)
    base = tint("mpfb_fingernails.jpg", (255, 236, 230), 1)
    base = tint("mpfb_toenails.jpg", (255, 236, 230), 1)
    base.save(path)
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


def make_garment(body, name, pred, inflate, mat_name=None, sole=0.0, smooth=0, edge_smooth=16, soft=None, soft_iters=14, soft_floor=None, drape=None):
    """pred(p, dom, v) True olan köşelerden oluşan yüzleri kopyalar, normal boyunca şişirir."""
    idx = vg_names(body)
    mw = body.matrix_world
    keep = set()
    for v in body.data.vertices:
        if pred(mw @ v.co, dominant(body, v, idx), v):
            keep.add(v.index)
    # Delik kapatma: komşularının çoğu seçili olan köşe de seçilir (ağırlık sınırındaki yamalar)
    nbr = {}
    for e in body.data.edges:
        a, b = e.vertices
        nbr.setdefault(a, []).append(b)
        nbr.setdefault(b, []).append(a)
    for _ in range(4):
        add = [i for i, ns in nbr.items() if i not in keep and len(ns) >= 3 and sum(1 for j in ns if j in keep) / len(ns) >= 0.6]
        if not add:
            break
        keep.update(add)
    # Kalan küçük delikler: seçili olmayan köşelerden oluşan, 120'den küçük adacıklar
    seen = set()
    for i in list(nbr.keys()):
        if i in keep or i in seen:
            continue
        comp, stack, border_ok = [], [i], True
        while stack and len(comp) <= 120:
            x = stack.pop()
            if x in seen:
                continue
            seen.add(x)
            comp.append(x)
            for j in nbr.get(x, []):
                if j not in keep and j not in seen:
                    stack.append(j)
        if len(comp) <= 120 and not stack:
            # yalnızca tamamen seçililerle çevriliyse (giysinin içinde kalan delik)
            ring = {j for x in comp for j in nbr.get(x, []) if j not in comp}
            if ring and all(j in keep for j in ring):
                keep.update(comp)
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
    drop = [f for f in bm.faces if sum(1 for v in f.verts if v.index in keep) < len(f.verts)]
    bmesh.ops.delete(bm, geom=drop, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
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
    for v in bm.verts:
        v.co += v.normal * inflate
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


def garments(body, rig, sex):
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
        if not (d in TORSO or d in HIPS):
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
    for p, zi in tor:
        dxy = Vector((p.x, p.y, 0)) - CEN[zi]
        a = int(((math.atan2(dxy.y, dxy.x) + math.pi) / (2 * math.pi)) * AB) % AB
        zi = int((p.z - z0) / ZB)
        R[zi][a] = max(R[zi][a], dxy.length)
    # boş hücreleri komşu açılardan doldur
    for zi in range(nz):
        for a in range(AB):
            if R[zi][a] == 0.0:
                R[zi][a] = max(R[zi][(a - 1) % AB], R[zi][(a + 1) % AB])

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
            # Koltuk altına doğru etkiyi yumuşat (omuz biçimi bozulmasın)
            k = min(1.0, (armpitZ - 0.02 - p.z) / 0.08)
            # Etek ucunda kumaş yeniden kalçaya/bele oturur (arkada içi görünmesin)
            k *= 0.25 + 0.75 * smooth01((p.z - hem_z) / 0.13)
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
        """profile(t) → dışa ek (m); t omuz 0 → bilek 1."""
        def f(p, d):
            side = "L" if (d in ARM_L or d in (B("LeftForeArm"), B("LeftHand"))) else "R" if (d in ARM_R or d in (B("RightForeArm"), B("RightHand"))) else None
            if side is None:
                return None
            dirv, t = arm_radial(p, side)
            if dirv is None:
                return None
            return dirv * profile(t)

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
    # -- Üstler --
    def tank(p, d, v):
        if not torso_ok(p, d, neckZ - 0.03) and not (d in UPLEG and p.z > hipZ + 0.0):
            return False
        if p.z < hipZ + 0.05:
            return False
        strap_in = halfNeck + 0.005
        strap_out = halfNeck + (0.045 if sex == "f" else 0.06)
        if p.z > armpitZ:
            s = side(p)
            if s > strap_out:
                return False  # kol oyuğu
            if s < strap_in and p.z > armpitZ + (0.05 if front(p) > 0 else 0.1):
                return False  # yaka oyuğu (önde derin)
        return True

    def chest(p):
        return front(p) > 0.02 and armpitZ - 0.2 < p.z < armpitZ + 0.04 and side(p) < 0.17

    out.append(make_garment(body, "tank", tank, 0.006, soft=chest, soft_floor=0.0055, drape=torso_hang(0.55, 0.0, hipZ + 0.05)))

    def tee(p, d, v):
        t = arm_t(p, d)
        if t is not None:
            return t < 0.33 and not is_hand(d)
        if upper_body(p, d):
            return p.z > hipZ + 0.035 and not neckline(p, 0.045, 0.015)
        return False

    out.append(make_garment(body, "tee", tee, 0.009, soft=chest, drape=combine(torso_hang(0.22, 0.006, hipZ + 0.035), sleeve(lambda t: 0.004 + 0.03 * smooth01(t / 0.33)))))

    def longsleeve(top_extra):
        def f(p, d, v):
            t = arm_t(p, d)
            if t is not None:
                return t < 0.97 and not is_hand(d)
            if top_extra > 0 and (d in NECK or upper_body(p, d)):
                return p.z > hipZ + 0.0 and p.z < neckZ + top_extra
            if upper_body(p, d):
                return p.z > hipZ + 0.0 and not neckline(p, 0.03, 0.01)
            return False

        return f

    out.append(make_garment(body, "sweat", longsleeve(0.0), 0.016, soft=chest, drape=combine(torso_hang(0.12, 0.012), sleeve(lambda t: 0.01 * smooth01(t / 0.2) + cuff(t, 0.9, 0.012)))))
    out.append(make_garment(body, "sweater", longsleeve(0.07), 0.02, soft=chest, drape=combine(torso_hang(0.15, 0.012), sleeve(lambda t: 0.011 * smooth01(t / 0.2) + cuff(t, 0.9, 0.01)))))
    hoodie = make_garment(body, "hoodie", longsleeve(0.0), 0.018, soft=chest, drape=combine(torso_hang(0.08, 0.018), sleeve(lambda t: 0.013 * smooth01(t / 0.2) + cuff(t, 0.9, 0.015))))
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

    out.append(make_garment(body, "brief", brief, 0.003))

    # -- Altlar --
    def pants(bottom_z, top_z=waistZ):
        def f(p, d, v):
            if d in HIPS or d in UPLEG or d in LEG or (d == B("Spine") and p.z < top_z):
                return bottom_z < p.z < top_z
            return False

        return f

    short_z = hipZ - (hipZ - kneeZ) * 0.55
    bike_z = hipZ - (hipZ - kneeZ) * 0.8
    out.append(make_garment(body, "shorts", pants(short_z), 0.016, drape=legwear(lambda z: 0.006 + 0.03 * smooth01((hipZ - 0.04 - z) / (hipZ - 0.04 - short_z)))))
    out.append(make_garment(body, "bball", pants(kneeZ - 0.03), 0.022, drape=legwear(lambda z: 0.012 + 0.05 * smooth01((hipZ - 0.04 - z) / (hipZ - kneeZ)))))
    out.append(make_garment(body, "bike", pants(bike_z), 0.005))
    out.append(make_garment(body, "leggings", pants(ankZ + 0.02), 0.005))
    out.append(make_garment(body, "joggers", pants(ankZ + 0.03), 0.014, drape=legwear(lambda z: (0.0 if z < ankZ + 0.09 else 0.016 + 0.012 * smooth01(1 - abs(z - (ankZ + 0.15)) / 0.07)) * smooth01((z - ankZ - 0.03) / 0.06))))
    out.append(make_garment(body, "track", pants(ankZ + 0.015), 0.016, drape=legwear(lambda z: 0.012 + 0.02 * smooth01((kneeZ - z) / (kneeZ - ankZ)))))

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

    # -- Saç --
    def scalp(margin_front, low_back):
        def f(p, d, v):
            if p.z < neckZ or is_hand(d) or arm_t(p, d) is not None:
                return False
            fr = head_front(p)
            sd = abs((p - headC).dot(L.right))
            ear = sd > 0.06 and p.z < L.head.z + 0.075 and fr > -0.035
            face = fr > 0.0 and p.z < L.headTop - margin_front
            neck_cut = p.z < L.head.z + low_back
            return not (face or ear or neck_cut)

        return f

    out.append(make_garment(body, "hair_short", scalp(0.05, 0.035), 0.012, smooth=3, edge_smooth=10))
    out.append(make_garment(body, "hair_long", scalp(0.055, -0.03), 0.017, smooth=3, edge_smooth=10))
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
    """Kafa kemiğine bağlı at kuyruğu (kadın) — basit dönen tüp."""
    L = Land(rig, bpy.data.objects["Body"])
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=0.045, radius2=0.012, depth=0.26)
    pt = bpy.context.active_object
    pt.name = "G_ponytail"
    back = -L.fwd
    base = Vector((L.head.x, L.head.y, L.headTop - 0.07)) + back * 0.095
    pt.location = base + back * 0.06 + Vector((0, 0, -0.1))
    pt.rotation_euler = (back.to_track_quat("Z", "Y") @ Quaternion((1, 0, 0), math.radians(-150))).to_euler()
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    vg = pt.vertex_groups.new(name=B("Head"))
    vg.add([v.index for v in pt.data.vertices], 1.0, "REPLACE")
    pt.parent = rig
    mod = pt.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    mat = bpy.data.materials.new("G_ponytail")
    pt.data.materials.append(mat)
    return pt


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
        gs = garments(body, rig, sex)
        if sex == "f":
            gs.append(ponytail(rig, sex))
        feet = split_feet(body, rig)
        skin_material([body, feet], skin_texture(os.path.join(OUT_DIR, f"skin_{sex}.png")))
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
