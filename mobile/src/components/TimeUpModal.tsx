// Popup afișat când timpul unui pas a expirat: utilizatorul alege dacă trece
// mai departe sau mai rămâne. Este afișat doar între replici, nu în mijlocul conversației.

import { View } from 'react-native';
import { Icon } from './Icon';
import { Sheet, H3, Muted, Button, ButtonRow } from '../ui';
import { usePalette } from '../theme';

export default function TimeUpModal({
  stepTitle,
  nextLabel,
  allowStay = true,
  onStay,
  onNext,
}: {
  stepTitle: string;
  nextLabel?: string;
  allowStay?: boolean;
  onStay: () => void;
  onNext: () => void;
}) {
  const p = usePalette();
  return (
    <Sheet visible onClose={allowStay ? onStay : onNext}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="clock" size={20} color={p.ink} />
        <H3 style={{ marginVertical: 0, flexShrink: 1 }}>Timpul pentru „{stepTitle}” s-a terminat</H3>
      </View>
      <Muted>{allowStay ? 'Treci la pasul următor sau mai rămâi puțin aici?' : 'În planul Free, sesiunea continuă cu pasul următor.'}</Muted>
      <ButtonRow>
        <Button title={nextLabel ?? 'Pasul următor →'} variant="primary" onPress={onNext} />
        {allowStay ? <Button title="Mai rămân aici" variant="ghost" onPress={onStay} /> : null}
      </ButtonRow>
    </Sheet>
  );
}
