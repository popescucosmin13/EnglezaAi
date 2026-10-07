// Primitive de layout și control: Screen (.page), Card, Button, chips, banere,
// stat tiles, bare de progres, tabs, spinner, pastile — echivalentele claselor CSS globale.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { usePalette, RADIUS, RADIUS_SM } from '../theme';
import { Icon, type IconName } from '../components/Icon';
import { useNavigationChrome } from '../navigation/NavigationChromeContext';
import { resolveScreenTopPadding } from './safeArea';

// ---------- Screen (.page) ----------

interface ScreenProps {
  children: ReactNode;
  /** false pentru ecrane care își gestionează singure scroll-ul (chat). */
  scroll?: boolean;
  /** Spațiu suplimentar jos (peste tab bar / safe area). */
  padBottom?: number;
  style?: StyleProp<ViewStyle>;
}

export function Screen({ children, scroll = true, padBottom = 24, style }: ScreenProps) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { reportScroll, reset: resetNavigationChrome } = useNavigationChrome();
  useEffect(() => resetNavigationChrome(), [resetNavigationChrome]);
  const requestedPaddingTop = StyleSheet.flatten(style)?.paddingTop;
  const safePaddingTop = resolveScreenTopPadding(insets.top, requestedPaddingTop);
  const pad = {
    paddingLeft: 18 + insets.left,
    paddingRight: 18 + insets.right,
  };
  const safeTop = { paddingTop: safePaddingTop };
  if (!scroll) {
    return (
      <View style={[{ flex: 1, backgroundColor: p.bg }, pad, { paddingBottom: padBottom + insets.bottom }, style, safeTop]}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.bg }}
      contentContainerStyle={[pad, { paddingBottom: padBottom + insets.bottom + 60 }, style, safeTop]}
      keyboardShouldPersistTaps="handled"
      onScroll={(event) => reportScroll(event.nativeEvent.contentOffset.y)}
      scrollEventThrottle={16}
    >
      {children}
    </ScrollView>
  );
}

// ---------- Card ----------

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, onPress, style }: CardProps) {
  const p = usePalette();
  const base: ViewStyle = {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.border,
    borderRadius: RADIUS,
    padding: 16,
    marginVertical: 10,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }, style]}>
      {children}
    </Pressable>
  );
}

// ---------- Button ----------

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'success' | 'ghost';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  /** Afișează spinner în locul iconiței. */
  busy?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({ title, onPress, variant = 'default', icon, disabled, busy, small, style, textStyle }: ButtonProps) {
  const p = usePalette();
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    default: { bg: p.card, fg: p.ink, border: p.border },
    primary: { bg: p.grad, fg: p.white, border: 'transparent' },
    danger: { bg: p.dangerSoft, fg: p.danger, border: 'transparent' },
    success: { bg: p.successSoft, fg: p.success, border: 'transparent' },
    ghost: { bg: 'transparent', fg: p.primary, border: 'transparent' },
  };
  const c = colors[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        st.btn,
        small && st.btnSmall,
        { backgroundColor: c.bg, borderColor: c.border },
        pressed && { transform: [{ scale: 0.98 }] },
        (disabled || busy) && { opacity: 0.45 },
        style,
      ]}
    >
      {variant === 'primary' ? (
        <LinearGradient
          colors={[p.primary, p.violet]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[StyleSheet.absoluteFill, { borderRadius: small ? 10 : 13 }]}
        />
      ) : null}
      {busy ? (
        <ActivityIndicator size="small" color={c.fg} />
      ) : (
        icon && <Icon name={icon} size={small ? 14 : 17} color={c.fg} strokeWidth={2.2} />
      )}
      <Text style={[st.btnText, small && { fontSize: 13.5 }, { color: c.fg }, textStyle]}>{title}</Text>
    </Pressable>
  );
}

/** Buton doar-iconiță (echivalent button[aria-label] cu .app-icon:only-child). */
export function IconButton({
  icon,
  onPress,
  size = 18,
  color,
  style,
  disabled,
}: {
  icon: IconName;
  onPress?: () => void;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.6 }, disabled && { opacity: 0.4 }, style]}
    >
      <Icon name={icon} size={size} color={color ?? p.ink2} />
    </Pressable>
  );
}

export function ButtonRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[st.btnRow, style]}>{children}</View>;
}

// ---------- Hero button (Începe sesiunea) ----------

export function HeroButton({
  title,
  subtitle,
  onPress,
  icon,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
  icon?: IconName;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [st.hero, pressed && { transform: [{ scale: 0.99 }] }]}
    >
      <LinearGradient
        colors={[p.primary, p.violet]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 22 }]}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon && <Icon name={icon} size={26} color={p.white} strokeWidth={2.2} />}
        <View style={{ flex: 1 }}>
          <Text style={[st.heroTitle, { color: p.white }]}>{title}</Text>
          {subtitle ? <Text style={[st.heroSub, { color: p.white }]}>{subtitle}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

// ---------- Chips ----------

export function ChipRow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[st.chipRow, style]}>{children}</View>;
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const p = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [
        st.chip,
        { backgroundColor: selected ? p.primarySoft : p.card, borderColor: selected ? p.primary : p.border },
        pressed && { opacity: 0.8 },
      ]}
    >
      {icon && <Icon name={icon} size={15} color={selected ? p.primaryDeep : p.ink2} />}
      <Text style={[st.chipText, { color: selected ? p.primaryDeep : p.ink2 }]}>{label}</Text>
    </Pressable>
  );
}

// ---------- Banere ----------

export function Banner({
  kind,
  children,
  icon,
  style,
}: {
  kind: 'error' | 'info' | 'success' | 'warn';
  children: ReactNode;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const map = {
    error: { bg: p.dangerSoft, fg: p.danger },
    info: { bg: p.primarySoft, fg: p.primaryDeep },
    success: { bg: p.successSoft, fg: p.success },
    warn: { bg: p.warnSoft, fg: p.warnInk },
  } as const;
  const c = map[kind];
  return (
    <View style={[st.banner, { backgroundColor: c.bg }, style]}>
      {icon && <Icon name={icon} size={16} color={c.fg} style={{ marginTop: 2 }} />}
      <Text style={[st.bannerText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

// ---------- Stat tiles ----------

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={st.statGrid}>{children}</View>;
}

export function StatTile({ value, label }: { value: string | number; label: string }) {
  const p = usePalette();
  return (
    <View style={[st.statTile, { backgroundColor: p.card, borderColor: p.border }]}>
      <Text style={[st.statValue, { color: p.primaryDeep }]}>{value}</Text>
      <Text style={[st.statLabel, { color: p.muted }]}>{label}</Text>
    </View>
  );
}

// ---------- Bară de progres ----------

export function Bar({ ratio, green, style }: { ratio: number; green?: boolean; style?: StyleProp<ViewStyle> }) {
  const p = usePalette();
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <View style={[st.bar, { backgroundColor: p.bgSoft }, style]}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: green ? p.success : p.grad }} />
    </View>
  );
}

// ---------- Tabs (segmente interne de pagină) ----------

export function TabsBar({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  const p = usePalette();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
      <View style={[st.tabs, { backgroundColor: p.bgSoft }]}>
        {tabs.map((t) => {
          const is = t.key === active;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              style={[st.tabBtn, is && { backgroundColor: p.card }]}
            >
              <Text style={[st.tabText, { color: is ? p.primaryDeep : p.ink2 }]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

// ---------- Spinner ----------

export function Spinner({ size = 'small' }: { size?: 'small' | 'large' }) {
  const p = usePalette();
  return <ActivityIndicator size={size} color={p.primary} />;
}

// ---------- Skeleton (placeholder de încărcare) ----------

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const p = usePalette();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: p.border, opacity }, style]}
    />
  );
}

// ---------- Pastile (xp-pill / level-pill / badge) ----------

export function Pill({
  kind,
  icon,
  children,
}: {
  kind: 'xp' | 'level' | 'badge' | 'badgeSoft';
  icon?: IconName;
  children: ReactNode;
}) {
  const p = usePalette();
  const map = {
    xp: { bg: p.warnSoft, fg: p.warnInk },
    level: { bg: p.primarySoft, fg: p.primaryDeep },
    badge: { bg: p.grad, fg: p.white },
    badgeSoft: { bg: p.primarySoft, fg: p.primaryDeep },
  } as const;
  const c = map[kind];
  return (
    <View style={[st.pill, { backgroundColor: c.bg }]}>
      {icon && <Icon name={icon} size={13} color={c.fg} />}
      <Text style={[st.pillText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

// ---------- Rânduri cheie-valoare (Setări) ----------

export function KvRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  const p = usePalette();
  return (
    <View style={[st.kvRow, !last && { borderBottomWidth: 1, borderBottomColor: p.border }]}>
      <Text style={{ color: p.ink2, fontSize: 14.5, flexShrink: 1 }}>{k}</Text>
      <Text style={{ color: p.ink, fontWeight: '700', fontSize: 14.5, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}

// ---------- Rând de rutină / misiune ----------

export function RoutineItem({ done, children, last }: { done?: boolean; children: ReactNode; last?: boolean }) {
  const p = usePalette();
  return (
    <View style={[st.routineItem, !last && { borderBottomWidth: 1, borderBottomColor: p.border }]}>
      <View style={{ width: 22, alignItems: 'center' }}>
        <Icon name={done ? 'checkCircle' : 'clock'} size={16} color={done ? p.success : p.muted} />
      </View>
      <Text style={{ flex: 1, fontSize: 14.5, color: done ? p.success : p.ink }}>{children}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 11, minHeight: 32, borderRadius: 11 },
  btnText: { fontSize: 15.5, fontWeight: '600' },
  iconBtn: { padding: 5, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12, alignItems: 'center' },
  hero: { borderRadius: 22, padding: 20, overflow: 'hidden' },
  heroTitle: { fontSize: 19, fontWeight: '700' },
  heroSub: { fontSize: 13.5, opacity: 0.92, marginTop: 3, fontWeight: '500' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 15,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
  banner: { flexDirection: 'row', gap: 8, borderRadius: RADIUS_SM, paddingVertical: 11, paddingHorizontal: 14, marginVertical: 10 },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statTile: { flexGrow: 1, flexBasis: 105, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14 },
  statValue: { fontSize: 23, fontWeight: '800', lineHeight: 28, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  bar: { height: 8, borderRadius: 99, overflow: 'hidden' },
  tabs: { flexDirection: 'row', gap: 6, borderRadius: 16, padding: 5, marginVertical: 10 },
  tabBtn: { borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  tabText: { fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 99,
    paddingVertical: 4,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12.5, fontWeight: '700' },
  kvRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
  },
  routineItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
});
