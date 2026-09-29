import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SamSite, AaaTruck } from './GroundTarget';

/**
 * Lädt die Blender-Ground-Vehicles (models/ground-vehicles.glb)
 * und rüstet SAM-/AAA-Akteure mit den GLB-Visuals aus.
 * Node-Konvention im GLB:
 *   SAM_Site   → Kind 'SAM_Dish'   (Radar-Drehung um Y)
 *   AAA_Truck  → Kind 'AAA_Turret' (Yaw) ⊃ 'AAA_Guns' (Pitch)
 * Prozedurale Modelle bleiben Fallback, falls das GLB fehlt.
 */

const URL = './models/ground-vehicles.glb';

let templatePromise: Promise<THREE.Group | null> | null = null;

export function preloadGroundVehicles(): Promise<THREE.Group | null> {
  if (!templatePromise) {
    templatePromise = new GLTFLoader()
      .loadAsync(URL)
      .then((gltf) => {
        gltf.scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = false;
            mesh.receiveShadow = false;
          }
        });
        return gltf.scene;
      })
      .catch((err) => {
        console.warn('[FightJet] ground-vehicles.glb nicht ladbar — nutze Procedural-Modelle:', err);
        return null;
      });
  }
  return templatePromise;
}

/** GLB-Visual an einen Boden-Akteur hängen (async, fire-and-forget). */
export function attachGroundVisual(actor: SamSite | AaaTruck) {
  void preloadGroundVehicles().then((root) => {
    if (!root || !actor.alive) return;
    const name = actor instanceof SamSite ? 'SAM_Site' : 'AAA_Truck';
    const node = root.getObjectByName(name);
    if (!node) return;
    const clone = node.clone(true);
    // Knoten sitzen auf Blender-Positionen (SAM bei 0, AAA bei +24) — zentrieren
    clone.position.set(0, 0, 0);
    actor.attachGlb(clone);
  });
}
