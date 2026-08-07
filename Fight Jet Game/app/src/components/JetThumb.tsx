import { useEffect, useState } from 'react';
import type { JetId } from '../game/aircraft/JetCatalog';
import { getJetThumbnail, peekJetThumbnail } from '../lib/jetThumbnails';
import { JetSilhouette } from './JetIcons';
import type { JetFaction } from '../game/aircraft/JetCatalog';

/** Hangar card image: real GLB render thumbnail with silhouette fallback. */
export function JetThumb({
  jetId,
  faction,
  locked = false,
  className = '',
}: {
  jetId: JetId;
  faction: JetFaction;
  locked?: boolean;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(() => peekJetThumbnail(jetId));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    const peek = peekJetThumbnail(jetId);
    if (peek) {
      setSrc(peek);
      return;
    }
    setSrc(null);
    getJetThumbnail(jetId)
      .then((url) => {
        if (alive) setSrc(url);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [jetId]);

  if (!src || failed) {
    return (
      <div className={`jet-thumb jet-thumb--fallback ${locked ? 'is-locked' : ''} ${className}`}>
        <JetSilhouette jetId={jetId} faction={faction} locked={locked} />
        {!failed && !src && <div className="jet-thumb-loading" />}
      </div>
    );
  }

  return (
    <div className={`jet-thumb ${locked ? 'is-locked' : ''} ${className}`}>
      <img src={src} alt="" draggable={false} />
      <div className="jet-thumb-fade" />
    </div>
  );
}
