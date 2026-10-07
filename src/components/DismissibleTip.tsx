// Banner informativ care poate fi închis definitiv (persistat în localStorage).
// Folosit pentru sfaturi care sunt utile prima dată, dar devin zgomot după aceea.

import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

const KEY_PREFIX = 'en2.ui.tip.';

export default function DismissibleTip({
  id,
  className = 'info-banner',
  children,
}: {
  /** Cheie stabilă — odată închis, tip-ul nu mai apare pe acest dispozitiv. */
  id: string;
  className?: string;
  children: ReactNode;
}) {
  const [hidden, setHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(KEY_PREFIX + id) === '1';
    } catch {
      return false;
    }
  });

  if (hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(KEY_PREFIX + id, '1');
    } catch { /* stocare indisponibilă — se ascunde doar pe sesiune */ }
    setHidden(true);
  }

  return (
    <div className={`${className} tip-dismissible`}>
      <span className="tip-content">{children}</span>
      <button type="button" className="tip-close" onClick={dismiss} aria-label="Nu mai arăta">
        <Icon name="x" size={15} />
      </button>
    </div>
  );
}
