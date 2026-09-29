# Blender headless: SAM-Site + AAA-Truck für Fight Jet 3D.
# Nodes:
#   SAM_Site (root)  ├ SAM_Dish  (radar dish — code spins .rotation.y)
#   AAA_Truck (root) ├ AAA_Turret (yaw pivot) └ AAA_Guns (pitch pivot)
# Export: public/models/ground-vehicles.glb + Sicht-Render zur QA.
import bpy
import math
import os

# ---------- Reset ----------
bpy.ops.wm.read_factory_settings(use_empty=True)

# ---------- Materials ----------
def mat(name, color, rough=0.75, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m

M_OLIVE   = mat("olive_drab",  (0.16, 0.19, 0.11), 0.82, 0.15)
M_OLIVE2  = mat("olive_dark",  (0.11, 0.13, 0.08), 0.85, 0.1)
M_METAL   = mat("gunmetal",    (0.09, 0.09, 0.10), 0.45, 0.75)
M_RUBBER  = mat("rubber",      (0.03, 0.03, 0.03), 0.95, 0.0)
M_CONCRETE= mat("concrete",    (0.42, 0.41, 0.36), 0.95, 0.0)
M_AMBER   = mat("amber_mark",  (0.75, 0.55, 0.10), 0.7, 0.1)
M_RADAR   = mat("radar_green", (0.20, 0.28, 0.14), 0.6, 0.3)
M_CAB     = mat("cab_glass",   (0.10, 0.14, 0.16), 0.25, 0.6)

def cube(name, loc, scale, m, parent=None, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (scale[0], scale[1], scale[2])
    bpy.ops.object.transform_apply(scale=True)
    if m: o.data.materials.append(m)
    if bevel > 0:
        mod = o.modifiers.new("bev", 'BEVEL')
        mod.width = bevel
        mod.segments = 1
    if parent: o.parent = parent
    return o

def cyl(name, loc, radius, depth, m, parent=None, rot=(0,0,0), verts=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if m: o.data.materials.append(m)
    if parent: o.parent = parent
    return o

def cone(name, loc, r1, r2, depth, m, parent=None, rot=(0,0,0), verts=12):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    if m: o.data.materials.append(m)
    if parent: o.parent = parent
    return o

def empty(name, loc=(0,0,0), parent=None):
    o = bpy.data.objects.new(name, None)
    o.location = loc
    bpy.context.collection.objects.link(o)
    if parent: o.parent = parent
    return o

# Roots (glTF: +Y up, +Z = Blender -Y "forward")
SAM = empty("SAM_Site")
AAA = empty("AAA_Truck")

# ══════════════════════════════════════════════════════════════════════════
# SAM SITE — TELAR-style launcher + rotating radar dish  (~14 m footprint)
# Blender coords: X right, Y back(→ glTF -Z), Z up
# ══════════════════════════════════════════════════════════════════════════
# Octagonal concrete pad
cyl("pad", (0, 0, 0.4), 7.0, 0.8, M_CONCRETE, SAM, verts=8)
# Amber warning ring
cyl("ring", (0, 0, 0.82), 6.6, 0.12, M_AMBER, SAM, verts=8)

# Central radar mast
cyl("mast", (0, 0, 3.2), 0.35, 5.0, M_METAL, SAM)
cube("mast_base", (0, 0, 1.2), (1.6, 1.6, 1.0), M_OLIVE2, SAM, bevel=0.1)

# Rotating dish pivot (spun around local Y in code => around world Z here = glTF Y)
dish_pivot = empty("SAM_Dish", (0, 0, 6.0), SAM)
# Dish face: flattened UV sphere half-shell, tilted ~60° up
bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=2.4, location=(0, 0, 0))
dish = bpy.context.active_object
dish.name = "dish_face"
dish.scale = (1.0, 0.35, 0.75)
bpy.ops.object.transform_apply(scale=True)
dish.data.materials.append(M_RADAR)
dish.rotation_euler = (math.radians(62), 0, 0)
dish.parent = dish_pivot
# Feed horn
cone("feed", (0, -0.4, 0.9), 0.12, 0.35, 1.2, M_METAL, dish_pivot, rot=(math.radians(62),0,0), verts=8)

# Two launcher racks (±4.2 m), each 4 tubes angled ~50° up, pointing -Y (glTF +Z)
for side in (-1, 1):
    bx = side * 4.2
    cube(f"rack_base_{side}", (bx, 0.4, 1.1), (2.4, 4.6, 0.7), M_OLIVE, SAM, bevel=0.08)
    rack = empty(f"rack_{side}", (bx, 0.2, 1.5), SAM)
    rack.rotation_euler = (math.radians(52), 0, 0)  # tilt tubes up, pointing -Y (glTF +Z)
    for i in range(4):
        tx = -0.75 + (i % 2) * 1.5
        ty = -0.6 + (i // 2) * 1.2
        cyl(f"tube_{side}_{i}", (tx, ty, 1.1), 0.34, 4.4, M_METAL, rack, verts=10)
        # Missile tip on top of tube (along rack-local +Z)
        cone(f"tip_{side}_{i}", (tx, ty, 3.75), 0.34, 0.0, 0.9, M_OLIVE2, rack, verts=10)

# Support crates
cube("crate1", (-5.2, -3.4, 1.35), (1.4, 1.1, 0.9), M_OLIVE2, SAM, bevel=0.06)
cube("crate2", (-4.6, -3.2, 2.1), (1.0, 0.8, 0.6), M_OLIVE, SAM, bevel=0.05)

# ══════════════════════════════════════════════════════════════════════════
# AAA TRUCK — 6-wheel flak truck, guns point glTF +Z (Blender -Y = forward)
# footprint ~7.8 m long
# ══════════════════════════════════════════════════════════════════════════
FWD = -1  # Blender -Y = forward

# Frame + chassis
cube("frame", (0, 0, 0.95), (1.7, 7.6, 0.28), M_METAL, AAA)
cube("hull",  (0, 0.2, 1.55), (2.0, 6.8, 0.9), M_OLIVE, AAA, bevel=0.12)

# Cab (front = -Y)
cube("cab",    (0, -2.6, 2.5), (2.05, 1.8, 1.4), M_OLIVE, AAA, bevel=0.15)
cube("cab_glass", (0, -3.51, 2.65), (1.7, 0.05, 0.55), M_CAB, AAA)
cube("hood",   (0, -3.9, 1.9), (1.9, 1.1, 0.85), M_OLIVE, AAA, bevel=0.1)

# Wheels: 3 axles — y at -2.9, 0.2, 2.4 ; wheels along X axis
for i, wy in enumerate((-2.9, 0.2, 2.4)):
    for sx in (-1.15, 1.15):
        cyl(f"wheel_{i}_{sx}", (sx, wy, 0.62), 0.62, 0.42, M_RUBBER, AAA,
            rot=(0, math.radians(90), 0), verts=12)
        cyl(f"hub_{i}_{sx}", (sx * 1.02, wy, 0.62), 0.3, 0.46, M_METAL, AAA,
            rot=(0, math.radians(90), 0), verts=8)

# Rear flatbed + turret ring
cube("deck", (0, 1.6, 2.15), (1.9, 3.2, 0.22), M_OLIVE2, AAA)

# Turret yaw pivot (code: rotation.y = yaw)
turret = empty("AAA_Turret", (0, 1.4, 2.6), AAA)
cyl("turret_ring", (0, 0, 0.12), 1.15, 0.35, M_OLIVE2, turret, verts=12)
# Gun shield (angled plate)
sh = cube("gun_shield", (0, -0.55, 0.85), (1.7, 0.16, 1.25), M_OLIVE, turret, bevel=0.06)
sh.rotation_euler = (math.radians(12), 0, 0)
cube("turret_box", (0, 0.35, 0.55), (1.3, 1.1, 0.8), M_OLIVE2, turret, bevel=0.06)

# Guns pitch pivot (code: rotation.x = -elev) — forward -Y (glTF +Z)
guns = empty("AAA_Guns", (0, -0.35, 0.9), turret)
guns.rotation_euler = (math.radians(-30), 0, 0)  # Ruhe-Elevation 30° (Code überschreibt im Spiel)
for gx in (-0.32, 0.32):
    cyl(f"barrel_{gx}", (gx, -1.55, 0), 0.09, 2.9, M_METAL, guns,
        rot=(math.radians(90), 0, 0), verts=8)
    cone(f"muzzle_{gx}", (gx, -3.05, 0), 0.13, 0.09, 0.28, M_METAL, guns,
         rot=(math.radians(90), 0, 0), verts=8)

# Ammo racks on deck sides
for sx in (-0.75, 0.75):
    cube(f"ammo_{sx}", (sx, 2.9, 2.55), (0.5, 0.8, 0.55), M_OLIVE2, AAA, bevel=0.05)

# ══════════════════════════════════════════════════════════════════════════
# Export GLB (whole scene)
# ══════════════════════════════════════════════════════════════════════════
out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "models")
os.makedirs(out_dir, exist_ok=True)
glb = os.path.join(out_dir, "ground-vehicles.glb")
bpy.ops.export_scene.gltf(
    filepath=glb,
    export_format='GLB',
    export_yup=True,
    export_apply=True,
    export_animations=False,
)
print("EXPORTED", glb)

# ══════════════════════════════════════════════════════════════════════════
# QA render — 3/4 view per vehicle (SAM left, AAA right of origin)
# ══════════════════════════════════════════════════════════════════════════
SAM.location = (0, 0, 0)
AAA.location = (24, 0, 0)   # parked east, out of the SAM close-up

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 1280
scene.render.resolution_y = 720
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("w")
scene.world.use_nodes = True
bg = scene.world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.12, 0.14, 0.10, 1.0)
bg.inputs[1].default_value = 1.6

# Sun + fill
bpy.ops.object.light_add(type='SUN', location=(10, -15, 20))
sun = bpy.context.active_object
sun.rotation_euler = (math.radians(40), math.radians(15), math.radians(25))
sun.data.energy = 4.5
bpy.ops.object.light_add(type='AREA', location=(-8, -8, 14))
area = bpy.context.active_object
area.data.energy = 1600
area.data.size = 12

# Ground hint
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-0.02))
pl = bpy.context.active_object
pl.data.materials.append(mat("ground", (0.07, 0.08, 0.05), 1.0, 0.0))

def look_at(cam, target):
    d = cam.location - target
    cam.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()

shots_dir = os.path.join(out_dir, "..", "..", "shots-assets")
os.makedirs(shots_dir, exist_ok=True)

import mathutils as mu
def render_one(cam_loc, target, path):
    bpy.ops.object.camera_add(location=cam_loc)
    cam = bpy.context.active_object
    look_at(cam, mu.Vector(target))
    scene.camera = cam
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("RENDER", path)
    bpy.data.objects.remove(cam, do_unlink=True)

# SAM site: 3/4 high view (tubes tilt along -Y visible from front-left)
render_one((11, -13, 9), (0, 0, 2.5),
           os.path.join(shots_dir, "sam-site-render.png"))
# AAA truck: 3/4 view from front-left
render_one((24 - 7, -8, 5.5), (24, 0, 1.8),
           os.path.join(shots_dir, "aaa-truck-render.png"))

# Save .blend source
blend_path = os.path.join(out_dir, "..", "..", "assets-src", "ground-vehicles.blend")
os.makedirs(os.path.dirname(blend_path), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print("BLEND", blend_path)
