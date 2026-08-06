import * as THREE from 'three';

// Effekte mit Objekt-Pooling: Explosionen (Feuerball + Rauch), Tracer, Rauchspuren.
// Keine Allokation im Game-Loop — alles wird wiederverwendet.

const MAX_PARTICLES = 400;

interface Particle {
  alive: boolean;
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
  growth: number;
  fade: boolean;
}

class ParticlePool {
  readonly points: THREE.Points;
  private particles: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private geo: THREE.BufferGeometry;
  private cursor = 0;

  constructor() {
    this.positions = new Float32Array(MAX_PARTICLES * 3);
    this.colors = new Float32Array(MAX_PARTICLES * 3);
    this.sizes = new Float32Array(MAX_PARTICLES);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({ alive: false, life: 0, maxLife: 1, vel: new THREE.Vector3(), growth: 0, fade: true });
      this.positions[i * 3 + 1] = -99999;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
      vertexColors: true,
      uniforms: {},
      vertexShader: /* glsl */ `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color, size: number, life: number, growth = 0) {
    const p = this.particles[this.cursor];
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.alive = true; p.life = 0; p.maxLife = life; p.growth = growth;
    p.vel.copy(vel);
    this.positions[i * 3] = pos.x; this.positions[i * 3 + 1] = pos.y; this.positions[i * 3 + 2] = pos.z;
    this.colors[i * 3] = color.r; this.colors[i * 3 + 1] = color.g; this.colors[i * 3 + 2] = color.b;
    this.sizes[i] = size;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.alive = false;
        this.positions[i * 3 + 1] = -99999;
        continue;
      }
      this.positions[i * 3] += p.vel.x * dt;
      this.positions[i * 3 + 1] += p.vel.y * dt;
      this.positions[i * 3 + 2] += p.vel.z * dt;
      p.vel.multiplyScalar(1 - dt * 0.8); // Luftwiderstand
      p.vel.y += dt * 3; // Rauch steigt
      this.sizes[i] += p.growth * dt;
      const fade = 1 - p.life / p.maxLife;
      this.colors[i * 3] *= (0.98 + fade * 0.02);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

/** Einzelner brennender Flare-Köder (Mesh-basiert, WT/Ace-Combat-Feel) */
interface FlarePellet {
  alive: boolean;
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  life: number;
  maxLife: number;
  vel: THREE.Vector3;
  spin: number;
}

const MAX_FLARE_PELLETS = 64;

export class Effects {
  readonly group = new THREE.Group();
  private pool = new ParticlePool();
  private cFire = new THREE.Color(1, 0.55, 0.15);
  private cFireBright = new THREE.Color(1, 0.9, 0.4);
  private cSmoke = new THREE.Color(0.25, 0.25, 0.27);
  private cSpark = new THREE.Color(1, 0.8, 0.3);
  private flarePellets: FlarePellet[] = [];
  private flareCursor = 0;
  /** Gestaffelte Salven: Flares nacheinander auswerfen */
  private flareQueue: {
    t: number;
    pos: THREE.Vector3;
    back: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
    jetVel: THREE.Vector3;
    side: number;
  }[] = [];

  constructor() {
    this.group.add(this.pool.points);
    this.initFlarePellets();
  }

  private initFlarePellets() {
    const coreGeo = new THREE.SphereGeometry(0.22, 8, 6);
    const glowGeo = new THREE.SphereGeometry(0.55, 8, 6);
    for (let i = 0; i < MAX_FLARE_PELLETS; i++) {
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xffee88,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        toneMapped: false,
      });
      const glowMat = new THREE.MeshBasicMaterial({
        color: 0xff7a20,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(coreGeo, coreMat);
      const glow = new THREE.Mesh(glowGeo, glowMat);
      mesh.visible = false;
      glow.visible = false;
      mesh.frustumCulled = false;
      glow.frustumCulled = false;
      this.group.add(mesh);
      this.group.add(glow);
      this.flarePellets.push({
        alive: false,
        mesh,
        glow,
        life: 0,
        maxLife: 1,
        vel: new THREE.Vector3(),
        spin: 0,
      });
    }
  }

  private spawnFlarePellet(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life = 3.2 + Math.random() * 1.4
  ) {
    const p = this.flarePellets[this.flareCursor];
    this.flareCursor = (this.flareCursor + 1) % MAX_FLARE_PELLETS;
    p.alive = true;
    p.life = 0;
    p.maxLife = life;
    p.vel.copy(vel);
    p.spin = (Math.random() - 0.5) * 8;
    p.mesh.visible = true;
    p.glow.visible = true;
    p.mesh.position.copy(pos);
    p.glow.position.copy(pos);
    p.mesh.scale.setScalar(0.7 + Math.random() * 0.5);
    p.glow.scale.setScalar(1);
    (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1;
    (p.glow.material as THREE.MeshBasicMaterial).opacity = 0.55;
  }

  explosion(pos: THREE.Vector3, big = false) {
    const n = big ? 40 : 22;
    const spread = big ? 60 : 30;
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3().randomDirection();
      const speed = Math.random() * spread;
      const vel = dir.multiplyScalar(speed);
      const bright = Math.random() > 0.5;
      this.pool.spawn(
        pos, vel,
        bright ? this.cFireBright : this.cFire,
        (big ? 26 : 14) + Math.random() * 20,
        0.5 + Math.random() * 0.7,
        30
      );
    }
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3().randomDirection().multiplyScalar(Math.random() * spread * 0.5);
      this.pool.spawn(pos, dir, this.cSmoke, 20 + Math.random() * 26, 1.6 + Math.random() * 2.2, 22);
    }
  }

  hitSparks(pos: THREE.Vector3) {
    for (let i = 0; i < 6; i++) {
      this.pool.spawn(
        pos,
        new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 40),
        this.cSpark, 4 + Math.random() * 4, 0.3 + Math.random() * 0.25, -6
      );
    }
  }

  missileSmoke(pos: THREE.Vector3) {
    this.pool.spawn(
      pos,
      new THREE.Vector3((Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4),
      this.cSmoke, 6 + Math.random() * 4, 1.4 + Math.random(), 10
    );
  }

  damageSmoke(pos: THREE.Vector3) {
    this.pool.spawn(
      pos,
      new THREE.Vector3((Math.random() - 0.5) * 3, 1, (Math.random() - 0.5) * 3),
      this.cSmoke, 8 + Math.random() * 6, 0.8 + Math.random() * 0.6, 14
    );
  }

  /**
   * War-Thunder / Ace-Combat Style: gestaffelte Flare-Salve.
   * Viele kleine brennende Köder schießen nach hinten/seitlich und fallen brennend ab.
   */
  flareBurst(
    origin: THREE.Vector3,
    backDir: THREE.Vector3,
    opts?: {
      right?: THREE.Vector3;
      up?: THREE.Vector3;
      jetVelocity?: THREE.Vector3;
      count?: number;
    }
  ) {
    const right = opts?.right?.clone().normalize() ?? new THREE.Vector3(1, 0, 0);
    const up = opts?.up?.clone().normalize() ?? new THREE.Vector3(0, 1, 0);
    const back = backDir.clone().normalize();
    const jetVel = opts?.jetVelocity?.clone() ?? new THREE.Vector3();
    const count = opts?.count ?? 14;

    // Sofortiger Muzzle-Flash am Heck
    const cWhite = new THREE.Color(1, 0.98, 0.85);
    const cHot = new THREE.Color(1, 0.55, 0.12);
    for (let i = 0; i < 8; i++) {
      this.pool.spawn(
        origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2)),
        back
          .clone()
          .multiplyScalar(12 + Math.random() * 20)
          .add(right.clone().multiplyScalar((Math.random() - 0.5) * 18))
          .add(up.clone().multiplyScalar((Math.random() - 0.5) * 10)),
        Math.random() > 0.5 ? cWhite : cHot,
        8 + Math.random() * 14,
        0.25 + Math.random() * 0.2,
        30
      );
    }

    // Queue: abwechselnd links/rechts, zeitlich gestaffelt → „Schauer“ hinter dem Jet
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.flareQueue.push({
        t: i * 0.038 + Math.random() * 0.012,
        pos: origin.clone(),
        back: back.clone(),
        right: right.clone(),
        up: up.clone(),
        jetVel: jetVel.clone(),
        side,
      });
    }
  }

  private ejectOneFlare(item: {
    pos: THREE.Vector3;
    back: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
    jetVel: THREE.Vector3;
    side: number;
  }) {
    // Start leicht unter/seitlich am Heck (wie Dispenser)
    const start = item.pos
      .clone()
      .addScaledVector(item.back, 1.5 + Math.random() * 2)
      .addScaledVector(item.right, item.side * (2.2 + Math.random() * 1.4))
      .addScaledVector(item.up, -0.8 - Math.random() * 0.6);

    // Geschwindigkeit: Jet-Erbe + kräftig nach hinten + seitlich raus + leicht runter
    const vel = item.jetVel
      .clone()
      .multiplyScalar(0.55)
      .addScaledVector(item.back, 28 + Math.random() * 22)
      .addScaledVector(item.right, item.side * (12 + Math.random() * 16))
      .addScaledVector(item.up, -6 - Math.random() * 10)
      .add(
        new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 6
        )
      );

    this.spawnFlarePellet(start, vel);

    // Kurzer Spark-Burst am Auswurf
    const cFlare = new THREE.Color(1, 0.9, 0.35);
    for (let i = 0; i < 3; i++) {
      this.pool.spawn(
        start,
        vel
          .clone()
          .normalize()
          .multiplyScalar(8 + Math.random() * 12)
          .add(new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10)),
        cFlare,
        5 + Math.random() * 6,
        0.35 + Math.random() * 0.25,
        8
      );
    }
  }

  private updateFlarePellets(dt: number) {
    // Gestaffelte Auswürfe abarbeiten
    for (let i = this.flareQueue.length - 1; i >= 0; i--) {
      this.flareQueue[i].t -= dt;
      if (this.flareQueue[i].t <= 0) {
        this.ejectOneFlare(this.flareQueue[i]);
        this.flareQueue.splice(i, 1);
      }
    }

    const cSmoke = this.cSmoke;
    for (const p of this.flarePellets) {
      if (!p.alive) continue;
      p.life += dt;
      const u = p.life / p.maxLife;
      if (u >= 1) {
        p.alive = false;
        p.mesh.visible = false;
        p.glow.visible = false;
        continue;
      }

      // Physik: Luftwiderstand + Schwerkraft (fallen brennend nach unten)
      p.vel.y -= 14 * dt;
      p.vel.multiplyScalar(1 - dt * 0.35);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.glow.position.copy(p.mesh.position);

      // Flackern / Pulse
      const flicker = 0.85 + Math.sin(p.life * 28 + p.spin) * 0.12 + Math.sin(p.life * 51) * 0.08;
      const burn = u < 0.15 ? u / 0.15 : u > 0.7 ? 1 - (u - 0.7) / 0.3 : 1;
      const intensity = Math.max(0, burn * flicker);

      const coreMat = p.mesh.material as THREE.MeshBasicMaterial;
      const glowMat = p.glow.material as THREE.MeshBasicMaterial;
      coreMat.opacity = intensity;
      glowMat.opacity = 0.25 + intensity * 0.45;
      // Farbe: weiß-heiß → orange → dunkelrot
      if (u < 0.35) {
        coreMat.color.setRGB(1, 0.95, 0.7);
        glowMat.color.setRGB(1, 0.7, 0.25);
      } else if (u < 0.7) {
        coreMat.color.setRGB(1, 0.75, 0.25);
        glowMat.color.setRGB(1, 0.45, 0.1);
      } else {
        coreMat.color.setRGB(1, 0.35, 0.08);
        glowMat.color.setRGB(0.7, 0.15, 0.05);
      }

      const s = (0.85 + intensity * 0.5) * (1 + Math.sin(p.life * 40) * 0.08);
      p.mesh.scale.setScalar(s * 0.9);
      p.glow.scale.setScalar(s * (1.6 + intensity * 1.2));

      // Rauchspur (nicht jedes Frame → Performance)
      if (Math.random() < dt * 18 * intensity) {
        this.pool.spawn(
          p.mesh.position.clone(),
          p.vel
            .clone()
            .multiplyScalar(0.08)
            .add(new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3)),
          cSmoke,
          5 + Math.random() * 8,
          1.2 + Math.random() * 1.4,
          12
        );
      }
      // Gelegentliche Funken
      if (Math.random() < dt * 6 * intensity) {
        this.pool.spawn(
          p.mesh.position.clone(),
          new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12),
          this.cFireBright,
          3 + Math.random() * 4,
          0.25 + Math.random() * 0.2,
          -4
        );
      }
    }
  }

  update(dt: number) {
    this.updateFlarePellets(dt);
    this.pool.update(dt);
  }
}
