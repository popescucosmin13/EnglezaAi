import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './Icon';
import { usePalette } from '../theme';

export default function TutorSessionHeader({
  title,
  stepLabel,
  detail,
  timeLabel,
  currentStep,
  totalSteps,
  actionLabel,
  onAction,
  onBack,
  disabled,
}: {
  title: string;
  stepLabel?: string;
  detail?: string;
  timeLabel?: string;
  currentStep?: number;
  totalSteps?: number;
  actionLabel: string;
  onAction: () => void;
  onBack?: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  const steps = totalSteps && currentStep ? Array.from({ length: totalSteps }, (_, index) => index + 1) : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Înapoi"
            hitSlop={10}
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: p.card, borderColor: p.border },
              pressed && styles.pressed,
            ]}
          >
            <Icon name="arrowLeft" size={22} color={p.ink} strokeWidth={2.2} />
          </Pressable>
        ) : null}

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[styles.title, { color: p.ink }]}>{title}</Text>
          </View>
          {stepLabel || detail ? (
            <Text numberOfLines={1} style={[styles.detail, { color: p.muted }]}>
              {[stepLabel, detail].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
        </View>

        {timeLabel ? <Text style={[styles.time, { color: p.ink2 }]}>{timeLabel}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          hitSlop={8}
          disabled={disabled}
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed, disabled && styles.disabled]}
        >
          <Text style={[styles.actionText, { color: p.primary }]}>{actionLabel}</Text>
        </Pressable>
      </View>

      {steps.length ? (
        <View accessibilityLabel={`Pasul ${currentStep} din ${totalSteps}`} style={styles.progressRow}>
          {steps.map((step, index) => {
            const complete = step < currentStep!;
            const active = step === currentStep;
            return (
              <View key={step} style={styles.progressItem}>
                {index > 0 ? (
                  <View style={[styles.progressLine, { backgroundColor: step <= currentStep! ? p.primary : p.border }]} />
                ) : null}
                <View
                  style={[
                    styles.progressDot,
                    { backgroundColor: complete || active ? p.primary : p.bgSoft, borderColor: active ? p.primary : 'transparent' },
                    active && { shadowColor: p.primary },
                  ]}
                >
                  {complete ? (
                    <Icon name="check" size={13} color={p.white} strokeWidth={3} />
                  ) : (
                    <Text style={[styles.progressNumber, { color: active ? p.white : p.muted }]}>{step}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={[styles.singleRail, { backgroundColor: p.border }]}> 
          <View style={[styles.singleRailActive, { backgroundColor: p.primary }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, paddingBottom: 5 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  backButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  titleBlock: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  title: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  detail: { marginTop: 2, fontSize: 11.5, lineHeight: 16, fontWeight: '500' },
  time: { fontSize: 14, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  action: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 3 },
  actionText: { fontSize: 14, lineHeight: 20, fontWeight: '800' },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.4 },
  progressRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7 },
  progressItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  progressLine: { height: 2, flex: 1 },
  progressDot: {
    width: 27,
    height: 27,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  progressNumber: { fontSize: 12, lineHeight: 15, fontWeight: '700' },
  singleRail: { height: 3, borderRadius: 999, overflow: 'hidden' },
  singleRailActive: { width: '42%', height: '100%', borderRadius: 999 },
});
