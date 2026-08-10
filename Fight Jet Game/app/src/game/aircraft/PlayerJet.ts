import * as THREE from 'three';
import { Aircraft } from './Aircraft';
import { CONFIG } from '../config';
import type { Input } from '../core/Input';
import type { HeightField } from '../world/GlbMapTerrain';
import type { Damageable } from '../combat/GroundTarget';
import { getJetDef, jetFxVectors, type JetDef, type JetId } from './JetCatalog';

export type PlayerGroundState = 'airborne' | 'grounded';

// Spieler-Jet: Stats & Loadout kommen aus dem Hangar (JetDef).
export class PlayerJet extends Aircraft {
  readonly isPlayer = true;
  jetId: JetId = 'f16';
  loadout: JetDef = getJetDef('f16');
  missilesLeft: number = CONFIG.player.missileCount;
  flaresLeft: number = CONFIG.player.flareCount;
  /** Abklingzeit zwischen Flare-Salven (s) */
  flareCooldown = 0;
  /** Solange > 0: aktive IR-Wolke (visuell + kurze Spoof-Fenster) */
  flareCloudTimer = 0;
  /** Nächster Hardpoint-Index (rotiert L/R) */
  missileStation = 0;
  cannonCooldown = 0;
  /** Kanonen-Munition (War-Thunder-Stil) */
  ammo: number = CONFIG.player.cannonAmmo;
  maxAmmo: number = CONFIG.player.cannonAmmo;
  reloading = false;
  reloadTimer = 0;
  lockTarget: Damageable | null = null;
  lockProgress = 0;
  score = 0;
  crashed = false;
  groundState: PlayerGroundState = 'airborne';
  private landedEvent = false;
  private tookOffEvent = false;
  private takeoffGrace = 0;
  /** Fallback-Mündungen aus dem Katalog, bis GLB-Anker kalibriert sind. */
  private catalogMuzzles: THREE.Vector3[] = jetFxVectors(getJetDef('f16')).muzzles;
  /** Aktueller Wind (von Game gesetzt) */
  wind = new THREE.Vector3();

  constructor() {
    super('VIPER 01', { bodyColor: 0x9aa4ae, accentColor: 0xc8352e }, CONFIG.player.hp, 'us', true);
    this.applyLoadout(getJetDef('f16'));
  }

  applyLoadout(def: JetDef) {
    this.jetId = def.id;
    this.loadout = def;
    this.hp = def.stats.hp;
    this.missilesLeft = def.stats.missiles;
    this.flaresLeft = def.stats.flareCount;
    this.flareCooldown = 0;
    this.flareCloudTimer = 0;
    this.maxAmmo = CONFIG.player.cannonAmmo;
    this.ammo = this.maxAmmo;
    this.reloading = false;
    this.reloadTimer = 0;
    this.flight.speedMult = def.stats.speedMult;
    this.flight.turnMult = def.stats.turnMult;
    this.applyFlightPhysics(def.physics, def.engineType);
    this.landingGear.configure(def.landingGear);
    this.landingGear.setExtended(this.groundState === 'grounded', true);
    this.catalogMuzzles = jetFxVectors(def).muzzles;
  }

  /** Mündungen: kalibrierte GLB-Anker bevorzugt, sonst Katalog. */
  getMuzzles(): THREE.Vector3[] {
    if (this.anchors?.muzzles?.length) return this.anchors.muzzles.map((v) => v.clone());
    return this.catalogMuzzles.map((v) => v.clone());
  }

  /** 0..1 FBW-Blend nach Manual-Override (Smooth Recapture) */
  fbwBlend = 1;

  reset() {
    const s = this.loadout.stats;
    this.hp = s.hp;
    this.alive = true;
    this.crashed = false;
    this.groundState = 'airborne';
    this.landedEvent = false;
    this.tookOffEvent = false;
    this.takeoffGrace = 0;
    this.landingGear.setExtended(false, true);
    this.missilesLeft = s.missiles;
    this.missileStation = 0;
    this.resetMountedMissiles(s.missiles);
    this.flaresLeft = s.flareCount;
    this.flareCooldown = 0;
    this.flareCloudTimer = 0;
    this.maxAmmo = CONFIG.player.cannonAmmo;
    this.ammo = this.maxAmmo;
    this.reloading = false;
    this.reloadTimer = 0;
    this.cannonCooldown = 0;
    this.score = 0;
    this.lockTarget = null;
    this.lockProgress = 0;
    this.flight.speedMult = s.speedMult;
    this.flight.turnMult = s.turnMult;
    this.applyFlightPhysics(this.loadout.physics, this.loadout.engineType);
    this.object.position.set(0, 900, 3000);
    this.object.rotation.set(0, 0, 0);
    this.object.quaternion.identity();
    this.flight.speed = CONFIG.flight.cruiseSpeed * s.speedMult;
    this.flight.snapVelocityToNose();
    this.fbwBlend = 1;
    this.flutter.reset();
  }

  get maxHp() {
    return this.loadout.stats.hp;
  }
  get cannonDamage() {
    return this.loadout.stats.cannonDamage;
  }
  get lockRange() {
    return this.loadout.stats.lockRange;
  }
  get lockTime() {
    return this.loadout.stats.lockTime;
  }
  get lockAngleDeg() {
    return this.loadout.stats.lockAngleDeg;
  }
  get hasMissiles() {
    return this.loadout.stats.missiles > 0 && this.loadout.stats.lockRange > 0;
  }
  get hasFlares() {
    return this.loadout.stats.flareCount > 0;
  }
  get maxFlares() {
    return this.loadout.stats.flareCount;
  }
  get hasAfterburner() {
    return this.loadout.physics.hasAfterburner;
  }

  /**
   * Eine Flare-Salve abfeuern. true = erfolgreich.
   * Cooldown verhindert Spam; verbraucht 1 Flare pro Salve.
   */
  tryPopFlares(): boolean {
    if (!this.alive || !this.hasFlares) return false;
    if (this.flaresLeft <= 0 || this.flareCooldown > 0) return false;
    this.flaresLeft -= 1;
    this.flareCooldown = CONFIG.player.flareCooldown ?? 0.85;
    this.flareCloudTimer = CONFIG.player.flareCloudDuration ?? 2.4;
    return true;
  }

  update(
    dt: number,
    input: Input,
    terrain: HeightField,
    onCrash: () => void,
    opts?: {
      aimDir?: THREE.Vector3 | null;
      mouseAim?: boolean;
      freeLook?: boolean;
      /** Nur auf Maps mit sichtbarem Wasser gesetzt; null = gesamtes Terrain ist fest. */
      waterLevel?: number | null;
    }
  ) {
    if (!this.alive) return;

    this.flareCooldown = Math.max(0, this.flareCooldown - dt);
    this.flareCloudTimer = Math.max(0, this.flareCloudTimer - dt);

    // Nachladen (Taste R startet von Game)
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        this.reloadTimer = 0;
        this.ammo = this.maxAmmo;
      }
    }

    // Smooth Recapture: Manual Override drosselt FBW, Loslassen fährt weich hoch
    if (input.manualOverride || opts?.freeLook) {
      this.fbwBlend = 0;
    } else {
      this.fbwBlend = Math.min(1, this.fbwBlend + dt * CONFIG.flight.fbwRecaptureRate);
    }

    // Props / Early Jets ohne echten Nachbrenner: WEP nur leichte Notleistung
    const ab = input.afterburner && this.loadout.physics.hasAfterburner
      ? true
      : input.afterburner && !this.loadout.physics.hasAfterburner
        ? true // FlightModel drosselt auf 8 % Boost
        : false;

    this.flight.throttle = input.throttle;
    const previousY = this.position.y;
    if (this.groundState === 'grounded') {
      this.updateGroundRoll(dt, input, terrain);
    } else {
      this.flight.update(dt, input, ab, {
        aimDir: opts?.aimDir ?? null,
        mouseAim: !!opts?.mouseAim && this.fbwBlend > 0.02,
        fbwBlend: this.fbwBlend,
        airbrake: input.airbrake,
        wind: this.wind,
      });
      this.takeoffGrace = Math.max(0, this.takeoffGrace - dt);
    }

    // Engine-FX: Jets mit Flamme; Props ohne
    if (this.engineType === 'jet') {
      this.updateEngineFx(
        dt,
        input.throttle,
        input.afterburner && this.loadout.physics.hasAfterburner
      );
    } else {
      this.updateEngineFx(dt, 0, false);
    }

    const cruise = CONFIG.flight.cruiseSpeed * this.flight.speedMult;
    const maxSpd = CONFIG.flight.maxSpeed * this.flight.speedMult;
    this.updateLegacyFx(dt, input.throttle, this.wind.length(), cruise, maxSpd);
    this.contrails.update(dt, this.flight.speed, this.flight.gForce);

    const half = terrain.size / 2 - 300;
    const p = this.position;
    if (Math.abs(p.x) > half || Math.abs(p.z) > half) {
      p.x = THREE.MathUtils.clamp(p.x, -half, half);
      p.z = THREE.MathUtils.clamp(p.z, -half, half);
    }

    const terrainY = terrain.getHeight(p.x, p.z);
    const waterLevel = opts?.waterLevel;
    const overWater = waterLevel != null && terrainY <= waterLevel + 0.5;
    const surfaceY = overWater ? waterLevel : terrainY;
    const contactY = surfaceY + this.loadout.landingGear.groundClearance;
    const agl = p.y - contactY;
    const approaching =
      this.takeoffGrace <= 0 &&
      this.flight.velocityDir.y < -0.015 &&
      agl < 140 &&
      this.flight.speed <= this.loadout.landingGear.landingSpeed * 1.45 &&
      this.forward.y < 0.28;
    this.landingGear.setExtended(this.groundState === 'grounded' || approaching);
    this.landingGear.update(dt);

    if (this.groundState === 'airborne' && this.takeoffGrace <= 0 && p.y <= contactY) {
      const sinkRate = Math.max(0, (previousY - p.y) / Math.max(dt, 0.001));
      if (!overWater && this.canLand(terrain, sinkRate)) {
        this.completeLanding(contactY);
      } else {
        p.y = Math.max(contactY, waterLevel ?? contactY);
        this.alive = false;
        this.crashed = true;
        onCrash();
      }
    } else if (this.groundState === 'grounded') {
      p.y = contactY;
    }
    if (p.y > 9000) p.y = 9000;

    this.cannonCooldown -= dt;
  }

  get isGrounded(): boolean {
    return this.groundState === 'grounded';
  }

  consumeLandedEvent(): boolean {
    const value = this.landedEvent;
    this.landedEvent = false;
    return value;
  }

  consumeTookOffEvent(): boolean {
    const value = this.tookOffEvent;
    this.tookOffEvent = false;
    return value;
  }

  /** Füllt nur die Raketen auf; Kanonenmunition und Flares bleiben unverändert. */
  rearmMissiles() {
    this.missilesLeft = this.loadout.stats.missiles;
    this.missileStation = 0;
    this.resetMountedMissiles(this.missilesLeft);
  }

  private updateGroundRoll(dt: number, input: Input, terrain: HeightField) {
    const gear = this.loadout.landingGear;
    const throttleForce = input.throttle * (26 + this.loadout.physics.thrustMult * 12);
    const rollingDrag = this.flight.speed > 0.05 ? 3.2 + this.flight.speed * 0.025 : 0;
    const brakeForce = input.airbrake ? 62 : 0;
    this.flight.speed = THREE.MathUtils.clamp(
      this.flight.speed + (throttleForce - rollingDrag - brakeForce) * dt,
      0,
      gear.takeoffSpeed * 1.35
    );
    if (input.throttle < 0.01 && this.flight.speed < 0.08) this.flight.speed = 0;

    const currentForward = this.forward;
    let heading = Math.atan2(-currentForward.x, -currentForward.z);
    const steering = THREE.MathUtils.clamp(input.yaw + input.roll * 0.45, -1, 1);
    const steerAuthority = THREE.MathUtils.clamp(this.flight.speed / 28, 0.18, 1);
    heading += steering * steerAuthority * 0.62 * dt;
    this.object.quaternion.setFromEuler(new THREE.Euler(0, heading, 0, 'YXZ'));

    this.flight.velocityDir.copy(this.forward).normalize();
    this.position.addScaledVector(this.flight.velocityDir, this.flight.speed * dt);
    this.position.y = terrain.getHeight(this.position.x, this.position.z) + gear.groundClearance;
    this.flight.stalled = false;
    this.flight.gForce = 1;
    this.flight.aoa = 0;
    this.flight.sideslip = 0;
    this.flight.rollRateActual = 0;
    this.flight.bankSigned = 0;

    if (this.flight.speed >= gear.takeoffSpeed && input.pitch > 0.18) {
      const pitchUp = THREE.MathUtils.degToRad(8 + Math.min(4, input.pitch * 4));
      this.object.quaternion.setFromEuler(new THREE.Euler(pitchUp, heading, 0, 'YXZ'));
      this.position.y += 0.75;
      this.flight.snapVelocityToNose();
      this.groundState = 'airborne';
      this.takeoffGrace = 1.2;
      this.tookOffEvent = true;
      this.landingGear.setExtended(false);
    }
  }

  private canLand(terrain: HeightField, sinkRate: number): boolean {
    const gear = this.loadout.landingGear;
    const bankDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(Math.abs(this.flight.bankSigned), 0, 1)));
    const pitchDeg = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1)));
    const sample = 8;
    const dx = (terrain.getHeight(this.position.x + sample, this.position.z) - terrain.getHeight(this.position.x - sample, this.position.z)) / (sample * 2);
    const dz = (terrain.getHeight(this.position.x, this.position.z + sample) - terrain.getHeight(this.position.x, this.position.z - sample)) / (sample * 2);
    const slopeDeg = THREE.MathUtils.radToDeg(Math.atan(Math.hypot(dx, dz)));

    return (
      this.flight.speed <= gear.landingSpeed &&
      sinkRate <= 8 &&
      bankDeg <= 16 &&
      pitchDeg >= -6 &&
      pitchDeg <= 20 &&
      slopeDeg <= 12
    );
  }

  private completeLanding(contactY: number) {
    const heading = THREE.MathUtils.degToRad(this.headingDeg);
    this.position.y = contactY;
    this.object.quaternion.setFromEuler(new THREE.Euler(0, heading, 0, 'YXZ'));
    this.flight.speed = Math.min(this.flight.speed, this.loadout.landingGear.landingSpeed * 0.72);
    this.flight.velocityDir.copy(this.forward).normalize();
    this.flight.stalled = false;
    this.flight.gForce = 1;
    this.flight.rollRateActual = 0;
    this.flight.bankSigned = 0;
    this.groundState = 'grounded';
    this.landedEvent = true;
    this.landingGear.setExtended(true, true);
  }

  canFireCannon(): boolean {
    return this.ammo > 0 && !this.reloading && this.cannonCooldown <= 0;
  }

  firedCannon() {
    this.ammo = Math.max(0, this.ammo - 1);
    this.cannonCooldown = 60 / this.loadout.stats.cannonRPM;
  }

  /** Startet Nachladen (kein Auto-Reload). */
  startReload(): boolean {
    if (this.reloading || this.ammo >= this.maxAmmo || !this.alive) return false;
    this.reloading = true;
    this.reloadTimer = CONFIG.player.reloadTime;
    return true;
  }

  get reloadProgress(): number {
    if (!this.reloading) return 1;
    const total = CONFIG.player.reloadTime;
    return total > 0 ? 1 - this.reloadTimer / total : 1;
  }
}
