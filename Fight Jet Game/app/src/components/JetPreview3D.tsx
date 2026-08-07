import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { getJetDef, type JetId } from '../game/aircraft/JetCatalog';
import { loadJetGlb } from '../game/aircraft/GlbJetLoader';

export type PreviewMode = 'hero' | 'hangar' | 'thumb';

type Props = {
  jetId: JetId;
  mode?: PreviewMode;
  className?: string;
  /** Auto-spin when not dragging (hero/hangar) */
  autoRotate?: boolean;
  interactive?: boolean;
  onReady?: () => void;
};

/**
 * Interactive hangar / command-screen jet viewer.
 * Drag to orbit, wheel to zoom. Uses the same GLB loader as the game.
 */
export function JetPreview3D({
  jetId,
  mode = 'hero',
  className = '',
  autoRotate = true,
  interactive = true,
  onReady,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    let jetRoot: THREE.Object3D | null = null;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080a07, mode === 'hero' ? 0.012 : 0.018);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    Object.assign(renderer.domElement.style, {
      width: '100%',
      height: '100%',
      display: 'block',
      cursor: interactive ? 'grab' : 'default',
      touchAction: 'none',
    });

    // Lighting — hangar spot feel
    const hemi = new THREE.HemisphereLight(0xc8d4b0, 0x1a1810, 0.55);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2d0, 1.35);
    key.position.set(8, 12, 6);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fae5a, 0.45);
    fill.position.set(-10, 4, -6);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc9a227, 0.55);
    rim.position.set(-2, 3, 12);
    scene.add(rim);
    const groundBounce = new THREE.DirectionalLight(0x6b7a35, 0.25);
    groundBounce.position.set(0, -8, 0);
    scene.add(groundBounce);

    // Floor disc
    const floorGeo = new THREE.CircleGeometry(22, 64);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x121610,
      metalness: 0.55,
      roughness: 0.65,
      transparent: true,
      opacity: mode === 'thumb' ? 0 : 0.85,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(7.2, 7.45, 64),
      new THREE.MeshBasicMaterial({
        color: 0xc9a227,
        transparent: true,
        opacity: mode === 'thumb' ? 0 : 0.35,
        side: THREE.DoubleSide,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    // Orbit state
    const pivot = new THREE.Group();
    scene.add(pivot);

    let yaw = mode === 'hero' ? 0.55 : 0.85;
    let pitch = 0.22;
    let distance = mode === 'hero' ? 22 : mode === 'hangar' ? 18 : 16;
    let targetDist = distance;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let idleSpin = 0;
    let userInteracted = false;

    const applyCamera = () => {
      const cp = Math.cos(pitch);
      camera.position.set(
        Math.sin(yaw) * cp * distance,
        Math.sin(pitch) * distance + 1.2,
        Math.cos(yaw) * cp * distance
      );
      camera.lookAt(0, 0.6, 0);
    };
    applyCamera();

    const resize = () => {
      const w = host.clientWidth || 1;
      const h = host.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const onDown = (e: PointerEvent) => {
      if (!interactive) return;
      dragging = true;
      userInteracted = true;
      lastX = e.clientX;
      lastY = e.clientY;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || !interactive) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      yaw -= dx * 0.006;
      pitch = Math.max(-0.15, Math.min(0.85, pitch + dy * 0.0045));
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (interactive) renderer.domElement.style.cursor = 'grab';
    };
    const onWheel = (e: WheelEvent) => {
      if (!interactive) return;
      e.preventDefault();
      userInteracted = true;
      targetDist = Math.max(10, Math.min(40, targetDist + e.deltaY * 0.02));
    };

    if (interactive) {
      renderer.domElement.addEventListener('pointerdown', onDown);
      renderer.domElement.addEventListener('pointermove', onMove);
      renderer.domElement.addEventListener('pointerup', onUp);
      renderer.domElement.addEventListener('pointercancel', onUp);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    }

    const tick = () => {
      if (disposed) return;
      raf = requestAnimationFrame(tick);
      distance += (targetDist - distance) * 0.12;
      if (autoRotate && !dragging && !userInteracted) {
        idleSpin += 0.004;
        yaw = (mode === 'hero' ? 0.55 : 0.85) + idleSpin;
      } else if (autoRotate && !dragging && userInteracted) {
        // gentle drift after interaction
        yaw += 0.0012;
      }
      applyCamera();
      if (jetRoot) {
        jetRoot.rotation.y = 0; // orbit is camera-based
      }
      ring.rotation.z += 0.0015;
      renderer.render(scene, camera);
    };

    const def = getJetDef(jetId);
    setStatus('loading');
    setErrMsg(null);

    loadJetGlb(def.modelUrl, {
      orient: {
        lengthIsLargest: def.era === 'modern' || def.era === 'early_jet',
        ...def.modelOrient,
      },
      targetLength: def.physics.modelLengthM ?? 15.5,
    })
      .then((loaded) => {
        if (disposed) {
          loaded.group.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.geometry?.dispose();
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              mats.forEach((mat) => mat?.dispose?.());
            }
          });
          return;
        }
        jetRoot = loaded.group;
        // Sit on floor
        const box = new THREE.Box3().setFromObject(jetRoot);
        const size = box.getSize(new THREE.Vector3());
        const minY = box.min.y;
        jetRoot.position.y = -minY;
        // Slight nose-in presentation yaw on model
        jetRoot.rotation.y = -0.35;
        pivot.add(jetRoot);

        // Frame distance from size
        const span = Math.max(size.x, size.z, size.y);
        const base = mode === 'hero' ? 1.55 : mode === 'hangar' ? 1.35 : 1.4;
        targetDist = Math.max(12, Math.min(36, span * base));
        distance = targetDist;

        setStatus('ready');
        onReady?.();
        tick();
      })
      .catch((err) => {
        console.error('[JetPreview3D]', jetId, err);
        if (!disposed) {
          setStatus('error');
          setErrMsg(err instanceof Error ? err.message : 'Modell konnte nicht geladen werden');
        }
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      if (interactive) {
        renderer.domElement.removeEventListener('pointerdown', onDown);
        renderer.domElement.removeEventListener('pointermove', onMove);
        renderer.domElement.removeEventListener('pointerup', onUp);
        renderer.domElement.removeEventListener('pointercancel', onUp);
        renderer.domElement.removeEventListener('wheel', onWheel);
      }
      if (jetRoot) {
        pivot.remove(jetRoot);
        jetRoot.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) {
            m.geometry?.dispose();
            const mats = Array.isArray(m.material) ? m.material : [m.material];
            mats.forEach((mat) => mat?.dispose?.());
          }
        });
      }
      floorGeo.dispose();
      floorMat.dispose();
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === host) {
        host.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onReady is optional fire-once
  }, [jetId, mode, autoRotate, interactive]);

  return (
    <div className={`jet-preview3d jet-preview3d--${mode} ${className}`} ref={hostRef}>
      {status === 'loading' && (
        <div className="jet-preview3d-status">
          <div className="jet-preview3d-spinner" />
          <span>Airframe laden…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="jet-preview3d-status is-error">
          <span>Modell-Fehler</span>
          {errMsg && <span className="jet-preview3d-err">{errMsg}</span>}
        </div>
      )}
      {status === 'ready' && interactive && mode !== 'thumb' && (
        <div className="jet-preview3d-hint">Ziehen · Scrollen zoomt</div>
      )}
    </div>
  );
}
