import sys, runpy
sys.argv = ["x", "--", sys.argv[-2], "/dev/null"]
# Build script'i dışa aktarmadan çalıştırmak için export'u kapat
import bpy
orig = bpy.ops.export_scene.gltf
bpy.ops.export_scene.gltf = lambda **k: None
g = runpy.run_path("build_athlete.py")
rest_pose, torso, leg, arm, bone_world_head, FWD, RIGHT, B, tgt = (g[k] for k in ["rest_pose","torso","leg","arm","bone_world_head","FWD","RIGHT","B","tgt"])
def pos(n):
    pb = tgt.pose.bones[n]; return tgt.matrix_world @ pb.head
def rep(label, fn):
    rest_pose(); fn(); bpy.context.view_layer.update()
    hip = pos(B("Hips")); headp = pos(B("Head")); knee = pos(B("LeftLeg")); hand = pos(B("LeftHand"))
    f = lambda v: round((v - hip).dot(FWD), 2)
    print(label, "head fwd", f(headp), "knee fwd", f(knee), "hand fwd", f(hand), "hand up", round((hand-hip).z,2))
rep("rest", lambda: None)
rep("lean+60", lambda: torso(60))
rep("thigh+80", lambda: leg("L", 80, 0))
rep("arm fwd+90", lambda: arm("L", 90, 0, 72))

def foot(label, fn):
    rest_pose(); fn(); bpy.context.view_layer.update()
    hip = pos(B("Hips")); ft = pos(B("LeftFoot")); hd = tgt.matrix_world @ tgt.pose.bones[B("HeadTop_End")].head; h0 = pos(B("Head"))
    print(label, "foot fwd", round((ft-hip).dot(FWD),2), "foot up", round((ft-hip).z,2), "headtop fwd", round((hd-h0).dot(FWD),2))
foot("knee+90", lambda: leg("L", 0, 90))
g["head"] = g["head"]
foot("head+40", lambda: g["head"](40))

def hand(label, fn):
    rest_pose(); fn(); bpy.context.view_layer.update()
    hip = pos(B("Hips")); h = pos(B("LeftHand")); e = pos(B("LeftForeArm"))
    print(label, "hand-elbow fwd", round((h-e).dot(FWD),2), "up", round((h-e).z,2))
hand("arm down elbow0", lambda: arm("L", 0, 0, 72))
hand("arm down elbow+90", lambda: arm("L", 0, 90, 72))
hand("arm fwd40 elbow+90", lambda: arm("L", 40, 90, 72))
P = g["P"]
def full(label, fn):
    rest_pose(); fn(); bpy.context.view_layer.update()
    hip = pos(B("Hips")); h = pos(B("Head")); hand = pos(B("LeftHand")); ft = pos(B("LeftFoot"))
    f = lambda v: (round((v-hip).dot(FWD),2), round((v-hip).z,2))
    print(label, "head", f(h), "hand", f(hand), "foot", f(ft))
full("dive", P(lean=110, dz=-0.55, L=(-40, 5), R=(-45, 15), aL=(75, 0), aR=(80, 0), hp=-65, down=75))
full("lean80only", lambda: g["torso"](80))
