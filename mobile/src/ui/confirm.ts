// window.confirm de pe web → Alert.alert promisificat.

import { Alert } from 'react-native';

export function confirm(message: string, title = 'Confirmare'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Anulează', style: 'cancel', onPress: () => resolve(false) },
      { text: 'OK', onPress: () => resolve(true) },
    ]);
  });
}
