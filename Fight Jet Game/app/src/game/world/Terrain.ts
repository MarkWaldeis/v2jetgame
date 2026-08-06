import * as THREE from 'three';
import { CONFIG } from '../config';

// Kleines, schnelles Value-Noise (deterministisch, kein Seed nötig)
function hash(x: number, y: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash(xi, yi), b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, octaves: number): number {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

// Terrain: prozedurale Heightmap (Berge im Norden/Osten, Meer im Südwesten),
// Höhenabfrage für Kollision & KI.
export class Terrain {
  readonly mesh: THREE.Mesh;
  private heights: Float32Array;
  private seg: number;
  /** Spielbare Kantenlänge (m) — kann bei Map-Wechsel angepasst werden */
  size: number;

  constructor(worldSize?: number) {
    const size = worldSize ?? CONFIG.world.size;
    const { segments, maxHeight } = CONFIG.world;
    this.size = size;
    this.seg = segments;
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    this.heights = new Float32Array((segments + 1) * (segments + 1));

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.computeHeight(x, z, maxHeight);
      pos.setY(i, h);
      const ix = Math.round(((x + size / 2) / size) * segments);
      const iz = Math.round(((z + size / 2) / size) * segments);
      this.heights[iz * (segments + 1) + ix] = h;
    }
    geo.computeVertexNormals();

    // Vertex-Farben: Strand, Gras, Fels, Schnee nach Höhe & Steigung
    const colors = new Float32Array(pos.count * 3);
    const cSand = new THREE.Color(0xc9b98a);
    const cGrass = new THREE.Color(0x5d7d43);
    const cForest = new THREE.Color(0x3d5c33);
    const cRock = new THREE.Color(0x7a7468);
    const cSnow = new THREE.Color(0xeef2f5);
    const tmp = new THREE.Color();
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i);
      const ny = nrm.getY(i); // 1 = flach
      const f = fbm(pos.getX(i) * 0.004, pos.getZ(i) * 0.004, 3);
      if (h < 6) tmp.copy(cSand);
      else if (h < 120) tmp.copy(cGrass).lerp(cForest, f);
      else if (h < 420) tmp.copy(cForest).lerp(cRock, Math.min(1, (h - 120) / 300 + (1 - ny) * 0.9));
      else if (h < 640) tmp.copy(cRock);
      else tmp.copy(cRock).lerp(cSnow, Math.min(1, (h - 640) / 200) * Math.max(0.3, ny));
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = 'terrain';
  }

  private computeHeight(x: number, z: number, maxH: number): number {
    const s = this.size;
    // Meer im Südwesten: Höhe sinkt Richtung (-x, +z)
    const coast = fbm(x * 0.0004 + 7.3, z * 0.0004 + 2.1, 3);
    const landMask = smooth(Math.min(1, Math.max(0, (x / s + 0.62 - z / s * 0.35) + (coast - 0.5) * 0.8)));
    const base = fbm(x * 0.00035, z * 0.00035, 5);
    const ridges = Math.pow(fbm(x * 0.0012 + 40, z * 0.0012 + 40, 4), 2.2);
    let h = (base * 0.55 + ridges * 0.75) * maxH * landMask;
    // Am Kartenrand leicht anheben (natürliche Begrenzung)
    const edge = Math.max(Math.abs(x), Math.abs(z)) / (s / 2);
    if (edge > 0.92) h += (edge - 0.92) * maxH * 2.5;
    return h;
  }

  // Höhe an Weltposition (bilinear)
  getHeight(x: number, z: number): number {
    const half = this.size / 2;
    if (x < -half || x > half || z < -half || z > half) return 0;
    const gx = ((x + half) / this.size) * this.seg;
    const gz = ((z + half) / this.size) * this.seg;
    const x0 = Math.min(Math.floor(gx), this.seg - 1);
    const z0 = Math.min(Math.floor(gz), this.seg - 1);
    const fx = gx - x0, fz = gz - z0;
    const row = this.seg + 1;
    const h00 = this.heights[z0 * row + x0];
    const h10 = this.heights[z0 * row + x0 + 1];
    const h01 = this.heights[(z0 + 1) * row + x0];
    const h11 = this.heights[(z0 + 1) * row + x0 + 1];
    return h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
  }
}

// Meer: große animierte Plane auf Meereshöhe
export class Sea {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshPhongMaterial;
  constructor(worldSize?: number) {
    const s = (worldSize ?? CONFIG.world.size) * 2.4;
    const geo = new THREE.PlaneGeometry(s, s, 48, 48);
    geo.rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshPhongMaterial({
      color: 0x1d4e6b,
      shininess: 140,
      specular: 0x99bbcc,
      transparent: true,
      opacity: 0.94,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = CONFIG.world.seaLevel;
  }
  setVisible(v: boolean) {
    this.mesh.visible = v;
  }
  update(t: number) {
    if (!this.mesh.visible) return;
    const pos = (this.mesh.geometry as THREE.PlaneGeometry).attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, Math.sin(x * 0.002 + t * 0.8) * 1.2 + Math.cos(z * 0.0023 + t * 0.6) * 1.2);
    }
    pos.needsUpdate = true;
  }
}
