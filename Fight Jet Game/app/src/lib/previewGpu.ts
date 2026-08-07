/**
 * Registry for menu / hangar WebGL renderers.
 * Disposed before mission start so the game canvas keeps a healthy context.
 */

type DisposableRenderer = {
  forceContextLoss?: () => void;
  dispose: () => void;
  domElement?: HTMLCanvasElement;
};

const live = new Set<DisposableRenderer>();

export function registerPreviewRenderer(r: DisposableRenderer) {
  live.add(r);
}

export function unregisterPreviewRenderer(r: DisposableRenderer) {
  live.delete(r);
}

/** Hard-kill all hangar/command preview WebGL contexts. */
export function disposePreviewRenderers() {
  for (const r of [...live]) {
    try {
      r.forceContextLoss?.();
    } catch {
      /* ignore */
    }
    try {
      r.dispose();
    } catch {
      /* ignore */
    }
    try {
      r.domElement?.remove();
    } catch {
      /* ignore */
    }
    live.delete(r);
  }
  live.clear();
}
