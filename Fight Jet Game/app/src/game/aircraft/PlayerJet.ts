import * as THREE from 'three';
import { Aircraft } from './Aircraft';
import { CONFIG } from '../config';
import type { Input } from '../core/Input';
import type { HeightField } from '../world/GlbMapTerrain';
import type { Damageable } from '../combat/GroundTarget';
import { getJetDef, jetFxVectors, type JetDef, type JetId } from './JetCatalog';

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
    this.flight.update(dt, input, ab, {
      aimDir: opts?.aimDir ?? null,
      mouseAim: !!opts?.mouseAim && this.fbwBlend > 0.02,
      fbwBlend: this.fbwBlend,
      airbrake: input.airbrake,
      wind: this.wind,
    });

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

    const ground = Math.max(CONFIG.world.seaLevel, terrain.getHeight(p.x, p.z));
    if (p.y <= ground + 4) {
      p.y = ground + 4;
      this.alive = false;
      this.crashed = true;
      onCrash();
    }
    if (p.y > 9000) p.y = 9000;

    this.cannonCooldown -= dt;
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
