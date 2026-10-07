// Placeholder de încărcare în forma conținutului (dashboards). Animația e definită în global.css (.skeleton).
import type { CSSProperties } from 'react';

export function Skeleton({
  width = '100%',
  height = 16,
  radius,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
}) {
  return <span className="skeleton" aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}

/** Grup de skeleton-uri cu semnalizare de „se încarcă" pentru cititoarele de ecran. */
export function SkeletonGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="page" aria-busy="true" aria-label="Se încarcă">
      {children}
    </div>
  );
}
