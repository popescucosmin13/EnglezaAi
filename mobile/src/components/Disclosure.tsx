// Secțiune pliabilă cu stare persistată per utilizator (storage) — portat de pe web.

import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { storage } from '../storage';
import { usePalette, RADIUS } from '../theme';

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
  const p = usePalette();
  const [open, setOpen] = useState<boolean>(() => {
    const saved = storage.getItem(KEY_PREFIX + id);
    return saved == null ? defaultOpen : saved === '1';
  });

  function toggle() {
    setOpen((o) => {
      storage.setItem(KEY_PREFIX + id, o ? '0' : '1');
      return !o;
    });
  }

  return (
    <View style={[st.card, { backgroundColor: p.card, borderColor: p.border }]}>
      <Pressable onPress={toggle} style={({ pressed }) => [st.head, pressed && { opacity: 0.7 }]}>
        {icon && <Icon name={icon} size={16} color={p.muted} />}
        <Text style={[st.title, { color: p.muted }]} numberOfLines={1}>
          {title.toUpperCase()}
        </Text>
        {badge != null && badge !== '' && (
          <View style={[st.badge, { backgroundColor: p.primarySoft }]}>
            <Text style={{ color: p.primaryDeep, fontSize: 12, fontWeight: '700' }}>{badge}</Text>
          </View>
        )}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={17} color={p.muted} />
      </Pressable>
      {open && <View style={st.body}>{children}</View>}
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: RADIUS, marginVertical: 10, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 15 },
  title: { flex: 1, fontSize: 12.5, fontWeight: '700', letterSpacing: 1 },
  badge: { borderRadius: 99, paddingVertical: 2, paddingHorizontal: 9 },
  body: { paddingHorizontal: 15, paddingBottom: 14 },
});
