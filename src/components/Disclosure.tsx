// Secțiune pliabilă cu stare persistată per utilizator (localStorage) — informația rămâne
// disponibilă, dar discretă: un rând compact care se deschide la atingere.

import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

const KEY_PREFIX = 'en2.ui.open.';

export default function Disclosure({
  id,
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
}: {
  /** Cheie stabilă — sub ea se memorează starea deschis/închis. */
  id: string;
  title: string;
  icon?: IconName;
  /** Rezumat scurt vizibil și când secțiunea e închisă (ex. „2/5"). */
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(KEY_PREFIX + id);
      return saved == null ? defaultOpen : saved === '1';
    } catch {
      return defaultOpen;
    }
  });

  function toggle() {
    setOpen((o) => {
      try {
        localStorage.setItem(KEY_PREFIX + id, o ? '0' : '1');
      } catch { /* stocare indisponibilă — starea rămâne doar pe sesiune */ }
      return !o;
    });
  }

  return (
    <div className="card disclosure">
      <button type="button" className="disclosure-head" onClick={toggle} aria-expanded={open}>
        {icon && <Icon name={icon} size={16} />}
        <span className="disclosure-title">{title}</span>
        {badge != null && badge !== '' && <span className="disclosure-badge">{badge}</span>}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={17} />
      </button>
      {open && <div className="disclosure-body">{children}</div>}
    </div>
  );
}
