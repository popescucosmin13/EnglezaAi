// Banner informativ care poate fi închis definitiv (persistat în storage) — portat de pe web.

import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from './Icon';
import { storage } from '../storage';
import { Banner } from '../ui';
import { usePalette } from '../theme';

const KEY_PREFIX = 'en2.ui.tip.';

export default function DismissibleTip({
  id,
  kind = 'info',
  children,
}: {
  /** Cheie stabilă — odată închis, tip-ul nu mai apare pe acest dispozitiv. */
  id: string;
  kind?: 'info' | 'error' | 'warn' | 'success';
  children: ReactNode;
}) {
  const p = usePalette();
  const [hidden, setHidden] = useState<boolean>(() => storage.getItem(KEY_PREFIX + id) === '1');

  if (hidden) return null;

  function dismiss() {
    storage.setItem(KEY_PREFIX + id, '1');
    setHidden(true);
  }

  return (
    <View style={{ position: 'relative' }}>
      <Banner kind={kind} style={{ paddingRight: 36 }}>
        {children}
      </Banner>
      <Pressable onPress={dismiss} hitSlop={8} style={{ position: 'absolute', top: 18, right: 10, opacity: 0.65 }}>
        <Icon name="x" size={15} color={p.ink2} />
      </Pressable>
    </View>
  );
}
