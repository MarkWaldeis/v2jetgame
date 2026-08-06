import * as THREE from 'three';
import { FlightModel } from './FlightModel';
import { buildF16, Contrails } from './JetModel';
import { EngineFx } from './EngineFx';
import { computeFxAnchors, type FxAnchors } from './FxAnchors';
import { PropellerSystem } from './PropellerSystem';
import { WingFlutter } from './WindAndFlutter';
import type { EngineType, FlightPhysicsProfile } from './JetCatalog';

/** Chase-Cam-Anpassung je nach Modellgröße (wingspan / height). */
export type CamFit = {
  /** Multiplikator auf Chase-Distanz (1 = Standard) */
  distScale: number;
  /** Multiplikator auf Chase-Höhe */
  heightScale: number;
  /** Zusätzlicher Look-Down (rad) bei großen Jets */
  lookDownBias: number;
};

// Basis-Klasse für alle Jets (Spieler & KI).
export abstract class Aircraft {
  readonly object = new THREE.Group();
  readonly flight: FlightModel;
  contrails: Contrails;
  hp: number;
  alive = true;
  abstract readonly isPlayer: boolean;
  readonly name: string;
  readonly engineFx: EngineFx;
  /** Sichtbare Raketen am Jet; Stationen entsprechen getHardpoints(). */
  readonly missileRack = new THREE.Group();
  private mountedMissiles: THREE.Object3D[] = [];
  private deathTimer = 0;
  private visual: THREE.Object3D;
  /** Zuletzt berechnete FX-Anker (Mündungen für die Kanone). */
  protected anchors: FxAnchors | null = null;
  /** Per-Jet Kamera-Fit aus gemessener Geometrie */
  camFit: CamFit = { distScale: 1, heightScale: 1, lookDownBias: 0 };
  /** Rumpflänge / Spannweite (m), für HUD & Cam */
  visualLength = 15.5;
  visualSpan = 10;
  /** Propeller-Animation (nur piston) */
  readonly propeller = new PropellerSystem();
  /** Visuelles Wing-Flutter / Buffeting */
  readonly flutter = new WingFlutter();
  engineType: EngineType = 'jet';
  /** 0..1 Kamera-Buffeting aus Flutter/Stall */
  get buffeting() {
    return this.flutter.buffeting;
  }

  constructor(
    name: string,
    colors: { bodyColor: number; accentColor: number },
    hp: number,
    nation: 'us' | 'enemy' = 'us',
    withCockpit = false
  ) {
    this.name = name;
    this.hp = hp;
    const { group, afterburner, abLight } = buildF16({
      bodyColor: colors.bodyColor,
      accentColor: colors.accentColor,
      nation,
      withCockpit,
    });
    afterburner.visible = false;
    abLight.intensity = 0;

    this.visual = group;
    this.object.add(group);

    // EngineFx als Kind von object → folgt Position + Quaternion des Jets
    this.engineFx = new EngineFx([new THREE.Vector3(0, -0.05, 7.3)]);
    this.object.add(this.engineFx.group);
    this.missileRack.name = 'missileRack';
    this.object.add(this.missileRack);

    this.flight = new FlightModel(this.object);
    this.contrails = new Contrails(this.object);
    this.object.add(this.contrails.group);
  }

  applyFlightPhysics(profile: FlightPhysicsProfile, engineType: EngineType = 'jet') {
    this.engineType = engineType;
    this.flight.applyPhysics(profile);
  }

  /**
   * Ersetzt das Visual und kalibriert Düsen/Mündungen am echten Modell-AABB.
   * @param catalogHint Katalog-Hinweis (Twin-Düsen etc.)
   */
  applyExternalVisual(
    visual: THREE.Object3D,
    catalogHint?: {
      nozzles: THREE.Vector3[];
      nozzleScale: number;
      wingHalfSpan: number;
      muzzles?: THREE.Vector3[];
      hardpoints?: THREE.Vector3[];
      hideEngineFx?: boolean;
    }
  ) {
    if (this.visual.parent === this.object) {
      this.object.remove(this.visual);
    }
    if (this.contrails.group.parent === this.object) {
      this.object.remove(this.contrails.group);
    }

    this.propeller.dispose();
    this.flutter.reset();

    this.visual = visual;
    this.object.add(visual);

    // Propeller + Flutter am neuen Visual
    if (this.engineType === 'piston') {
      this.propeller.attach(visual);
    }
    this.flutter.attach(visual);

    // Anker aus Geometrie messen (klebt am Heck/Bug des geladenen GLB)
    const twinN = (catalogHint?.nozzles.length ?? 1) >= 2;
    const twinM = (catalogHint?.muzzles?.length ?? 0) >= 2 || twinN;
    const auto = computeFxAnchors(visual, this.object, {
      twinNozzles: twinN,
      twinMuzzles: twinM,
    });

    // Düsen: Katalog ist am echten GLB kalibriert (autoritativ).
    // Hardpoints: IMMER aus Geometrie (Flügel-Unterseite) — Katalog-Y lag oft
    // 0.5–1.5 m zu hoch und setzte Raketen auf die Flügeloberkante.
    if (catalogHint?.nozzles.length) {
      auto.nozzles = catalogHint.nozzles.map((v) => v.clone());
    }
    if (catalogHint?.nozzleScale) auto.nozzleScale = catalogHint.nozzleScale;
    if (catalogHint?.wingHalfSpan) {
      auto.wingHalfSpan = catalogHint.wingHalfSpan;
    }

    this.anchors = auto;
    this.object.add(this.engineFx.group);
    this.engineFx.group.position.set(0, 0, 0);
    this.engineFx.group.quaternion.identity();

    // Propeller: keine Jet-Düse anzeigen
    if (catalogHint?.hideEngineFx || this.engineType === 'piston') {
      this.engineFx.configure([], 0.01);
      this.engineFx.group.visible = false;
    } else {
      this.engineFx.group.visible = true;
      this.engineFx.configure(auto.nozzles, auto.nozzleScale);
    }

    this.contrails = new Contrails(this.object, auto.wingHalfSpan);
    this.object.add(this.contrails.group);

    // Kamera/Fadenkreuz: aus realer Modellgröße kalibrieren
    this.visualSpan = Math.max(4, auto.wingHalfSpan * 2);
    // Länge aus Bug–Heck der Mündungen/Düsen abschätzen
    const noseZ = auto.muzzles.reduce((m, v) => Math.min(m, v.z), 0);
    const aftZ = auto.nozzles.reduce((m, v) => Math.max(m, v.z), 0);
    this.visualLength = Math.max(8, aftZ - noseZ + 1.5);
    this.camFit = computeCamFit(this.visualSpan, this.visualLength);

    // Ensure missile rack stays parented to the aircraft object
    this.object.add(this.missileRack);
    this.missileRack.position.set(0, 0, 0);
    this.missileRack.quaternion.identity();
  }

  /**
   * Propeller-Spin + Wing-Flutter pro Frame.
   * windStrength: |wind| in m/s für Flutter-Intensität.
   */
  updateLegacyFx(
    dt: number,
    throttle: number,
    windStrength = 0,
    cruiseSpeed = 140,
    maxSpeed = 260
  ) {
    const speedNorm = this.flight.speed / Math.max(40, cruiseSpeed);
    if (this.engineType === 'piston') {
      this.propeller.update(dt, throttle, speedNorm);
    }
    this.flutter.update(dt, {
      speed: this.flight.speed,
      cruiseSpeed,
      maxSpeed,
      gForce: this.flight.gForce,
      aoa: this.flight.aoa,
      stalled: this.flight.stalled,
      windStrength,
      susceptibility: this.flight.physics.windSusceptibility,
    });
  }

  /** Kanonen-Mündungen im Aircraft-Lokalraum (nach Visual-Kalibrierung). */
  getMuzzles(): THREE.Vector3[] {
    if (this.anchors?.muzzles?.length) {
      return this.anchors.muzzles.map((v) => v.clone());
    }
    return [new THREE.Vector3(-0.5, 0, -7.5)];
  }

  /** Raketen-Hardpoints im Aircraft-Lokalraum (Wingtip / Underwing). */
  getHardpoints(): THREE.Vector3[] {
    if (this.anchors?.hardpoints?.length) {
      return this.anchors.hardpoints.map((v) => v.clone());
    }
    const span = this.visualSpan * 0.5 || 5;
    return [
      new THREE.Vector3(-span * 0.9, -0.3, 0.5),
      new THREE.Vector3(span * 0.9, -0.3, 0.5),
      new THREE.Vector3(-span * 0.55, -0.55, 0.8),
      new THREE.Vector3(span * 0.55, -0.55, 0.8),
    ];
  }

  /**
   * Baut den sichtbaren Loadout neu auf. Die Modelle sitzen mit ihrer Nase
   * entlang local -Z und sind damit exakt deckungsgleich mit dem Launch-Pose.
   */
  configureMountedMissiles(factory: () => THREE.Object3D | null, count: number) {
    this.missileRack.clear();
    this.mountedMissiles = [];
    const hardpoints = this.getHardpoints();
    // Gerade Anzahl bevorzugt L/R-Paare von aussen; ungerade: Rest innen
    const stationCount = Math.min(count, hardpoints.length);
    for (let index = 0; index < stationCount; index++) {
      const visual = factory();
      if (!visual) continue;
      visual.name = `mountedMissile-${index}`;
      // Hardpoint = Aufhängepunkt (Flügelunterseite − Clearance); Raketen-Mesh
      // ist zentriert → leicht nach unten, damit der Körper unter dem Flügel hängt
      visual.position.copy(hardpoints[index]);
      visual.position.y -= 0.06;
      // Nase = local −Z (Flight-Richtung), Identity-Rotation
      visual.quaternion.identity();
      this.missileRack.add(visual);
      this.mountedMissiles[index] = visual;
    }
  }

  /** Blendet genau die Station aus, von der die fliegende Rakete startet. */
  releaseMountedMissile(station: number) {
    const visual = this.mountedMissiles[station];
    if (visual) visual.visible = false;
  }

  /** Stellt den sichtbaren Loadout beim Neustart wieder her. */
  resetMountedMissiles(count: number) {
    this.mountedMissiles.forEach((visual, index) => {
      if (visual) visual.visible = index < count;
    });
  }

  /**
   * Weltpunkt, auf den das Gun-Crosshair zielt:
   * Mittelpunkt der Mündungen + Forward * range (echter Boresight pro Jet).
   */
  getGunBoresight(range = 800): THREE.Vector3 {
    const muzzles = this.getMuzzles();
    const mid = new THREE.Vector3();
    for (const m of muzzles) mid.add(m);
    mid.multiplyScalar(1 / Math.max(1, muzzles.length));
    mid.applyQuaternion(this.object.quaternion).add(this.object.position);
    mid.addScaledVector(this.forward, range);
    return mid;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }
  get forward(): THREE.Vector3 {
    return this.flight.forward;
  }

  updateEngineFx(dt: number, throttle: number, afterburner: boolean) {
    this.engineFx.update(dt, throttle, afterburner);
  }

  setAfterburner(on: boolean) {
    this.engineFx.setAfterburner(on);
  }

  takeDamage(dmg: number): boolean {
    if (!this.alive) return false;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.alive = false;
      return true;
    }
    return false;
  }

  updateDeath(dt: number): boolean {
    this.deathTimer += dt;
    this.object.rotateZ(dt * 4);
    this.object.rotateX(dt * 1.5);
    this.object.position.y -= (60 + this.deathTimer * 80) * dt;
    this.object.translateZ(this.flight.speed * dt * 0.6);
    this.flight.speed = Math.max(0, this.flight.speed - dt * 60);
    this.engineFx.update(dt, 0.2, false);
    return this.deathTimer > 8;
  }

  get headingDeg(): number {
    const f = this.forward;
    return ((Math.atan2(-f.x, -f.z) * 180) / Math.PI + 360) % 360;
  }
  get speedKnots(): number {
    return this.flight.speed * 1.944;
  }
}

/** F-16 als Referenz: ~13 m Spannweite, ~15.5 m Länge → scale 1 */
function computeCamFit(span: number, length: number): CamFit {
  const refSpan = 13;
  const refLen = 15.5;
  const size = 0.55 * (span / refSpan) + 0.45 * (length / refLen);
  // Weite Jets (F-14, Su-34) etwas weiter weg, damit der Rumpf das Fadenkreuz nicht verdeckt
  const distScale = THREE.MathUtils.clamp(0.88 + (size - 1) * 0.55, 0.85, 1.35);
  const heightScale = THREE.MathUtils.clamp(0.92 + (size - 1) * 0.4, 0.85, 1.3);
  // Größere Jets: etwas mehr Look-Down, damit Nase/Kreuz frei vor dem Rumpf liegt
  const lookDownBias = THREE.MathUtils.clamp((size - 1) * 0.04, -0.02, 0.08);
  return { distScale, heightScale, lookDownBias };
}
