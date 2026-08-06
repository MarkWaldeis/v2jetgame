import os
import shutil
from gradio_client import Client, handle_file

image_path = r"C:\Users\Mark Waldeis\Desktop\Kampf Jet 3d spiel\aero_credits.jpg"
output_dir = r"c:\Users\Mark Waldeis\Desktop\Kampf Jet 3d spiel"
glb_dest_path = os.path.join(output_dir, "aero_credits_3d.glb")

print(f"Connecting to HuggingFace TRELLIS Space (trellis-community/TRELLIS)...")
client = Client("trellis-community/TRELLIS")

print("Submitting aero credits image for 3D model GLB generation...")
result = client.predict(
    image=handle_file(image_path),
    api_name="/preprocess_image"
)

print("Preprocess Result:", result)

result2 = client.predict(
    image=handle_file(result),
    multiimages=[],
    seed=42,
    ss_guidance_strength=7.5,
    ss_sampling_steps=12,
    slat_guidance_strength=3.0,
    slat_sampling_steps=12,
    multiimage_algo="stochastic",
    mesh_simplify=0.95,
    texture_size=1024,
    api_name="/generate_and_extract_glb"
)

print("Raw API Result:", result2)

if isinstance(result2, (tuple, list)):
    glb_path = result2[1] or result2[2]
    if glb_path and os.path.exists(str(glb_path)):
        shutil.copy(str(glb_path), glb_dest_path)
        print(f"Successfully downloaded generated 3D GLB model to: {glb_dest_path}")
    else:
        print("GLB file path returned:", glb_path)
