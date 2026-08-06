import * as THREE from 'three';
import { CONFIG } from '../config';

// Engine: Renderer, Szene, Kamera, Resize-Handling.
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Etwas hellere Exposure: Jets bleiben lesbar ohne Env-Map-Reflexionen
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = false; // Performance: weiche "fake" Schatten reichen

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9db8d6, CONFIG.world.fogNear, CONFIG.world.fogFar);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.baseFov,
      1, // wird in resize gesetzt
      0.5,
      80000
    );

    window.addEventListener('resize', this.resize);
    this.resize();
  }

  setFog(near: number, far: number, color = 0x9db8d6) {
    this.scene.fog = new THREE.Fog(color, near, far);
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
