import * as THREE from 'three';
import { CONFIG } from '../config';

// Sky: Himmels-Gradient (Shader-Dome), Sonne mit Glow, bewegte Wolken-Billboards,
// Licht-Setup (Sonne + Hemisphärenlicht).
export class Sky {
  readonly group = new THREE.Group();
  private clouds: THREE.Mesh[] = [];
  private sunLight: THREE.DirectionalLight;

  constructor() {
    // Himmelskuppel mit Gradient
    const skyGeo = new THREE.SphereGeometry(50000, 24, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x2a5d9e) },
        midColor: { value: new THREE.Color(0x7fa8d0) },
        bottomColor: { value: new THREE.Color(0xd9e4ee) },
        sunDir: { value: new THREE.Vector3(0.5, 0.55, 0.4).normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor; uniform vec3 midColor; uniform vec3 bottomColor;
        uniform vec3 sunDir;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y, -0.05, 1.0);
          vec3 col = h < 0.12
            ? mix(bottomColor, midColor, smoothstep(-0.05, 0.12, h))
            : mix(midColor, topColor, smoothstep(0.12, 0.7, h));
          float sun = pow(max(dot(normalize(vDir), sunDir), 0.0), 350.0);
          float glow = pow(max(dot(normalize(vDir), sunDir), 0.0), 8.0);
          col += vec3(1.0, 0.9, 0.7) * sun * 1.4 + vec3(1.0, 0.85, 0.6) * glow * 0.18;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.group.add(new THREE.Mesh(skyGeo, skyMat));

    // Licht — kräftig genug, dass MeshStandardMaterial ohne Env-Map hell bleibt
    this.sunLight = new THREE.DirectionalLight(0xfff2dd, 3.4);
    this.sunLight.position.set(5000, 7000, 4000);
    this.group.add(this.sunLight);
    // Target muss im Scene-Graph hängen, sonst zeigt die Sonne dauerhaft auf (0,0,0)
    this.group.add(this.sunLight.target);
    this.group.add(new THREE.HemisphereLight(0xd0e4f8, 0x6a7a58, 1.15));
    this.group.add(new THREE.AmbientLight(0xffffff, 0.55));
    // Fülllicht von vorne unten — verhindert Silhouetten-Schwarz
    const fill = new THREE.DirectionalLight(0xc8daf0, 0.85);
    fill.position.set(-3000, 2000, -4000);
    this.group.add(fill);

    // Wolken: weiche Sprite-Cluster (siehe rebuildClouds)
    this.rebuildClouds(CONFIG.world.size);
  }

  private cloudMat: THREE.MeshBasicMaterial | null = null;

  /** Wolken an neue Weltgröße anpassen (Map-Wechsel) */
  rebuildClouds(worldSize: number) {
    for (const c of this.clouds) {
      this.group.remove(c);
      c.geometry.dispose();
    }
    this.clouds = [];
    if (!this.cloudMat) {
      const cloudTex = Sky.makeCloudTexture();
      this.cloudMat = new THREE.MeshBasicMaterial({
        map: cloudTex, transparent: true, opacity: 0.38, depthWrite: false, fog: true,
      });
    }
    const half = worldSize / 2 - 500;
    for (let i = 0; i < 30; i++) {
      const a = Sky.seeded(i, 3), b = Sky.seeded(i, 7);
      const c = Sky.seeded(i, 11), d = Sky.seeded(i, 17);
      const w = 1000 + a * 1800;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.72), this.cloudMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set(
        (b * 2 - 1) * half,
        2750 + c * 1250,
        (d * 2 - 1) * half
      );
      m.userData.drift = 3.5 + Sky.seeded(i, 23) * 5;
      m.renderOrder = 1;
      this.clouds.push(m);
      this.group.add(m);
    }
    this.worldSize = worldSize;
  }

  private worldSize: number = CONFIG.world.size;

  private static makeCloudTexture(): THREE.Texture {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    for (let i = 0; i < 34; i++) {
      const x = 12 + Sky.seeded(i, 31) * 104;
      const y = 34 + Sky.seeded(i, 37) * 60;
      const r = 17 + Sky.seeded(i, 41) * 28;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.55)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private static seeded(index: number, salt: number): number {
    const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  }

  update(dt: number, playerPos: THREE.Vector3) {
    // Kuppel folgt dem Spieler, Wolken driften
    this.group.position.set(playerPos.x, 0, playerPos.z);
    // Sonne bleibt relativ zur Gruppe (Gruppe sitzt schon auf playerPos)
    this.sunLight.position.set(5000, 7000, 4000);
    this.sunLight.target.position.set(0, 0, 0);

    for (const c of this.clouds) {
      c.position.x += dt * (c.userData.drift as number);
      if (c.position.x > this.worldSize / 2) {
        c.position.x -= this.worldSize;
      }
    }
  }
}
