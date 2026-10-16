import sys, importlib, bpy
import addon_utils
bpy.ops.extensions.repo_refresh_all() if hasattr(bpy.ops.extensions, "repo_refresh_all") else None
mods = [m.__name__ for m in addon_utils.modules()]
print("mods", [m for m in mods if "mpfb" in m])
print(addon_utils.enable("bl_ext.user_default.mpfb", default_set=True, handle_error=lambda e: print("ERR", repr(e)[:400])))
def imp(p, k):
    for m in list(sys.modules):
        if m.endswith(p):
            return getattr(importlib.import_module(m), k)
    raise SystemExit("no "+p)
HumanService = imp("mpfb.services.humanservice", "HumanService")
TargetService = imp("mpfb.services.targetservice", "TargetService")
HOP = imp("mpfb.entities.objectproperties", "HumanObjectProperties")
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
h = HumanService.create_human()
print("human", h.name, len(h.data.vertices), [vg.name for vg in h.vertex_groups][:40], len(h.vertex_groups))
HOP.set_value("gender", 1.0, entity_reference=h)
TargetService.reapply_macro_details(h)
rig = HumanService.add_builtin_rig(h, "mixamo")
print("rig", rig.name, len(rig.data.bones), [b.name for b in rig.data.bones][:12])
print("objects", [(o.name, o.type) for o in bpy.data.objects])
print("dims", h.dimensions[:])
