import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';
import SubscriptionGate from '../pages/SubscriptionGate';
import { Muted, Screen, Spinner } from '../ui';

export default function ProFeatureGate({
  children,
  feature,
}: {
  children: ReactNode;
  feature: string;
}) {
  const access = useRevenueCat();
  if (access.loading && !access.accessInfo && !access.customerInfo) {
    return (
      <Screen>
        <View style={{ minHeight: 360, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
          <Spinner size="large" />
          <Muted>Se verifică planul contului…</Muted>
        </View>
      </Screen>
    );
  }
  if (!access.isPro) return <SubscriptionGate lockedFeature={feature} />;
  return <>{children}</>;
}
