// Echivalentele tipografice ale h1/h2/h3/.muted/.tiny din global.css.

import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import type { ReactNode } from 'react';
import { usePalette } from '../theme';

interface TProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}

export function H1({ children, style }: TProps) {
  const p = usePalette();
  return <Text style={[st.h1, { color: p.ink }, style]}>{children}</Text>;
}

/** h2 de secțiune: uppercase, muted, cu linie de continuare la dreapta. */
export function H2({ children, style }: TProps) {
  const p = usePalette();
  return (
    <View style={st.h2Row}>
      <Text style={[st.h2, { color: p.muted }, style]}>{children}</Text>
      <View style={[st.h2Line, { backgroundColor: p.border }]} />
    </View>
  );
}

export function H3({ children, style }: TProps) {
  const p = usePalette();
  return <Text style={[st.h3, { color: p.ink }, style]}>{children}</Text>;
}

export function P({ children, style }: TProps) {
  const p = usePalette();
  return <Text style={[st.p, { color: p.ink }, style]}>{children}</Text>;
}

export function Muted({ children, style }: TProps) {
  const p = usePalette();
  return <Text style={[st.muted, { color: p.ink2 }, style]}>{children}</Text>;
}

export function Tiny({ children, style }: TProps) {
  const p = usePalette();
  return <Text style={[st.tiny, { color: p.muted }, style]}>{children}</Text>;
}

const st = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, marginTop: 6, marginBottom: 4 },
  h2Row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, marginBottom: 8 },
  h2: { fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2 },
  h2Line: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  h3: { fontSize: 16, fontWeight: '650' as any, marginTop: 12, marginBottom: 6 },
  p: { fontSize: 16, lineHeight: 24, marginVertical: 6 },
  muted: { fontSize: 14.5, lineHeight: 21 },
  tiny: { fontSize: 13, lineHeight: 18 },
});
