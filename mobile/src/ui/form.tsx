// Controale de formular: Field (label + TextInput), Select (picker în bottom-sheet),
// Switch-ul rămâne cel nativ RN.

import { useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, RADIUS_SM } from '../theme';
import { Icon } from '../components/Icon';

interface FieldProps {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secure?: boolean;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: 'email' | 'password' | 'new-password' | 'off';
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
  multiline,
  keyboardType,
  autoCapitalize,
  autoComplete,
  editable = true,
  style,
}: FieldProps) {
  const p = usePalette();
  const [focused, setFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  return (
    <View style={[st.field, style]}>
      {label ? <Text style={[st.label, { color: p.ink2 }]}>{label}</Text> : null}
      <View style={{ position: 'relative' }}>
      <TextInput
        accessibilityLabel={label || placeholder}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={p.muted}
        secureTextEntry={secure && !passwordVisible}
        autoCorrect={secure || keyboardType === 'email-address' ? false : undefined}
        spellCheck={secure || keyboardType === 'email-address' ? false : undefined}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize ?? (secure || keyboardType === 'email-address' ? 'none' : undefined)}
        autoComplete={autoComplete}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          st.input,
          {
            backgroundColor: p.card,
            color: p.ink,
            borderColor: focused ? p.primary : p.border,
          },
          multiline && { minHeight: 88, textAlignVertical: 'top' },
          secure && { paddingRight: 76 },
        ]}
      />
      {secure ? <Pressable accessibilityRole="button" accessibilityLabel={passwordVisible ? 'Ascunde parola' : 'Arată parola'} onPress={() => setPasswordVisible(value => !value)} style={{ position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 12 }}><Text style={{ color: p.primaryDeep, fontWeight: '700', fontSize: 12 }}>{passwordVisible ? 'Ascunde' : 'Arată'}</Text></Pressable> : null}
      </View>
    </View>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

/** Înlocuitorul <select>-ului web: buton care deschide un bottom-sheet cu opțiuni. */
export function Select({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label?: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const current = options.find((o) => o.value === value);
  return (
    <View style={st.field}>
      {label ? <Text style={[st.label, { color: p.ink2 }]}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        style={({ pressed }) => [
          st.input,
          st.selectBtn,
          { backgroundColor: p.card, borderColor: p.border },
          pressed && { opacity: 0.8 },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Text style={{ color: p.ink, fontSize: 16, flex: 1 }} numberOfLines={1}>
          {current?.label ?? value}
        </Text>
        <Icon name="chevronDown" size={16} color={p.muted} />
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={st.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[st.sheet, { backgroundColor: p.bg, paddingBottom: 20 + insets.bottom }]}
            onPress={(e) => e.stopPropagation()}
          >
            {label ? (
              <Text style={[st.sheetTitle, { color: p.muted }]}>{label.toUpperCase()}</Text>
            ) : null}
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => {
                const is = o.value === value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => {
                      setOpen(false);
                      if (o.value !== value) onChange(o.value);
                    }}
                    style={({ pressed }) => [
                      st.option,
                      { borderColor: p.border },
                      is && { backgroundColor: p.primarySoft },
                      pressed && { opacity: 0.75 },
                    ]}
                  >
                    <Text style={{ color: is ? p.primaryDeep : p.ink, fontSize: 16, fontWeight: is ? '700' : '400', flex: 1 }}>
                      {o.label}
                    </Text>
                    {is && <Icon name="check" size={17} color={p.primaryDeep} />}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Bottom-sheet generic (echivalentul .modal-backdrop + .modal de pe web). */
export function Sheet({
  visible,
  onClose,
  children,
  maxHeightRatio = 0.9,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeightRatio?: number;
}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={st.backdrop} onPress={onClose}>
        <Pressable
          style={[
            st.sheet,
            { backgroundColor: p.bg, maxHeight: `${Math.round(maxHeightRatio * 100)}%` as any, paddingBottom: 20 + insets.bottom },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  field: { marginVertical: 12 },
  label: { fontSize: 13.5, fontWeight: '600', marginBottom: 5 },
  input: {
    fontSize: 16,
    borderWidth: 1.5,
    borderRadius: RADIUS_SM,
    paddingVertical: 10,
    paddingHorizontal: 13,
    minHeight: 46,
  },
  selectBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10, 12, 24, 0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 18,
  },
  sheetTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
});
