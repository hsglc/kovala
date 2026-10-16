import bpy, sys
M = sys.argv[-1]
bpy.ops.wm.read_factory_settings(use_empty=True)
for f in ["Xbot.glb", "Michelle.glb"]:
    bpy.ops.import_scene.gltf(filepath=f"{M}/{f}")
arms = [o for o in bpy.data.objects if o.type == "ARMATURE"]
for a in arms:
    names = [b.name for b in a.data.bones]
    print(a.name, len(names), names[:6], "dims", tuple(round(d,2) for d in a.dimensions), "scale", tuple(round(s,3) for s in a.scale))
    for b in ["mixamorig:Hips","mixamorig:LeftUpLeg","mixamorig:LeftArm","mixamorig:Head"]:
        if b in a.data.bones:
            bb=a.data.bones[b]; print("  ", b, tuple(round(v,3) for v in bb.head_local), tuple(round(v,3) for v in bb.tail_local))
meshes=[o for o in bpy.data.objects if o.type=="MESH"]
for m in meshes:
    print("mesh", m.name, len(m.data.vertices), "verts", "parent", m.parent.name if m.parent else None, "dims", tuple(round(d,2) for d in m.dimensions), "groups", len(m.vertex_groups), "mats", [s.material.name for s in m.material_slots])
print("actions", [a.name for a in bpy.data.actions])
for img in bpy.data.images: print("img", img.name, img.size[:])
