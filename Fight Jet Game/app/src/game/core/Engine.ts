import * as THREE from 'three';
import { CONFIG } from '../config';
import type { GraphicsQuality } from '../../lib/gameSettings';

// Engine: Renderer, Szene, Kamera, Resize-Handling + WebGL-Context-Recovery.
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private canvas: HTMLCanvasElement;
  private contextLost = false;
  /** Max. devicePixelRatio je Qualitätsstufe */
  private pixelRatioCap = 2;
  private baseFogNear: number = CONFIG.world.fogNear;
  private baseFogFar: number = CONFIG.world.fogFar;
  private fogColor = 0x9db8d6;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      // Kein failIfMajorPerformanceCaveat — sonst leerer Canvas auf manchen GPUs
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // Etwas hellere Exposure: Jets bleiben lesbar ohne Env-Map-Reflexionen
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = false; // Performance: weiche "fake" Schatten reichen
    this.renderer.setClearColor(0x0a1628, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x9db8d6, CONFIG.world.fogNear, CONFIG.world.fogFar);
    this.scene.background = new THREE.Color(0x0a1628);

    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.baseFov,
      1, // wird in resize gesetzt
      0.5,
      80000
    );

    canvas.addEventListener('webglcontextlost', this.onContextLost, false);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored, false);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  setFog(near: number, far: number, color = 0x9db8d6) {
    this.baseFogNear = near;
    this.baseFogFar = far;
    this.fogColor = color;
    this.scene.fog = new THREE.Fog(color, near, far);
  }

  /**
   * Grafikprofil: Pixelratio, Sichtweite (Fog), Antialias-Hinweis.
   * Low: max 1 · Medium: max 1.5 · High: max 2
   */
  applyGraphicsQuality(quality: GraphicsQuality, fogFarScale = 1) {
    if (quality === 'low') this.pixelRatioCap = 1;
    else if (quality === 'medium') this.pixelRatioCap = 1.5;
    else this.pixelRatioCap = 2;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));

    const far = this.baseFogFar * fogFarScale;
    this.scene.fog = new THREE.Fog(this.fogColor, this.baseFogNear, far);
    // Kamera-Far-Plane anpassen, damit Low wirklich weniger zeichnet
    this.camera.far = quality === 'low' ? Math.min(45000, far * 1.15) : 80000;
    this.camera.updateProjectionMatrix();
    this.resize();
  }

  getPixelRatioCap() {
    return this.pixelRatioCap;
  }

  /** Nach Menü→Spiel: Größe + PixelRatio neu setzen (Canvas war oft opacity:0). */
  forceResize() {
    this.resize();
  }

  isContextLost() {
    return this.contextLost || this.renderer.getContext()?.isContextLost?.() === true;
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    console.warn('[Engine] WebGL context lost — warte auf Restore');
  };

  private onContextRestored = () => {
    this.contextLost = false;
    console.info('[Engine] WebGL context restored');
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap));
    this.resize();
  };

  private resize = () => {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  render() {
    if (this.contextLost) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.dispose();
  }
}
