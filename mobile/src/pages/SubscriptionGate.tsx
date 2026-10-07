import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Purchases, { type PurchasesPackage } from 'react-native-purchases';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';
import {
  basePriceStringForPackage,
  introductoryDiscountForPackage,
  packageForPlan,
  trialLabelForPackage,
} from '../revenuecat/model';
import { Banner, Button, Screen } from '../ui';
import { usePalette } from '../theme';

const PUBLIC_WEB_BASE = 'http://localhost:3000';

export default function SubscriptionGate({ lockedFeature, preview = false }: { lockedFeature?: string; preview?: boolean }) {
  const p = usePalette();
  const { signOutUser, user } = useAuth();
  const revenueCat = useRevenueCat();
  const [message, setMessage] = useState('');
  const storeName = Platform.OS === 'android' ? 'Google Play' : 'App Store';

  // Paywall-ul oferă intenționat un singur produs: abonamentul lunar.
  // În preview folosim o ofertă localizată echivalentă cu cea întoarsă de magazin.
  const selectedPackage = useMemo(
    () => preview ? previewMonthlyPackage() : packageForPlan(revenueCat.offering, 'monthly'),
    [preview, revenueCat.offering]
  );
  const [introEligibility, setIntroEligibility] = useState<{
    item: PurchasesPackage; uid: string | undefined; customerInfo: typeof revenueCat.customerInfo; eligible: boolean;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setIntroEligibility(null);
    if (preview || Platform.OS !== 'ios' || !revenueCat.ready || revenueCat.loading || !selectedPackage) return;
    const item = selectedPackage;
    void Purchases.checkTrialOrIntroductoryPriceEligibility([item.product.identifier])
      .then((results) => {
        if (!cancelled) setIntroEligibility({
          item, uid: user?.uid, customerInfo: revenueCat.customerInfo,
          eligible: results[item.product.identifier]?.status === Purchases.INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE,
        });
      })
      .catch(() => { /* Unknown eligibility: display the standard store price. */ });
    return () => { cancelled = true; };
  }, [preview, selectedPackage, user?.uid, revenueCat.ready, revenueCat.loading, revenueCat.customerInfo]);
  const appleIntroEligible = preview || (!revenueCat.loading && introEligibility?.item === selectedPackage
    && introEligibility?.uid === user?.uid && introEligibility?.customerInfo === revenueCat.customerInfo
    && introEligibility?.eligible === true);
  const selectedTrial = trialLabelForPackage(selectedPackage, appleIntroEligible);
  const discount = introductoryDiscountForPackage(selectedPackage, appleIntroEligible);
  const basePrice = basePriceStringForPackage(selectedPackage);
  const hasStorePrice = Boolean(selectedPackage && basePrice);

  async function continueWithPlan() {
    setMessage('');
    if (preview) {
      setMessage(`Previzualizare: oferta va fi confirmată în fereastra securizată ${storeName}.`);
      return;
    }
    if (!hasStorePrice) return;
    try {
      const result = await revenueCat.purchasePlan('monthly');
      if (result === 'cancelled') setMessage('Achiziția a fost anulată. Poți reveni oricând.');
    } catch {
      // Mesajul normalizat este deja expus de RevenueCatContext.
    }
  }

  async function restore() {
    setMessage('');
    try {
      const restored = await revenueCat.restorePurchases();
      setMessage(restored ? 'Achiziția a fost restaurată. EnglezaAI Pro este activ.' : 'Nu am găsit un abonament activ.');
    } catch {
      // Mesajul normalizat este deja expus de RevenueCatContext.
    }
  }

  return (
    <Screen
      padBottom={0}
      style={[
        { paddingTop: 0, paddingLeft: 0, paddingRight: 0, backgroundColor: p.card },
        styles.screenContent,
      ]}
    >
      <LinearGradient
        colors={[p.primarySoft, p.bg, p.primarySoft]}
        locations={[0, 0.56, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Pressable
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="Înapoi la versiunea Free"
          hitSlop={10}
          style={({ pressed }) => [styles.backButton, { backgroundColor: p.card }, pressed && styles.pressed]}
        >
          <Icon name="arrowLeft" size={24} color={p.ink} strokeWidth={2.2} />
        </Pressable>

        <View style={[styles.heroIconHalo, { backgroundColor: `${p.primary}14` }]}>
          <View style={[styles.heroIcon, { backgroundColor: p.primary }]}>
            <Icon name="star" size={38} color={p.white} strokeWidth={2.15} />
          </View>
          <Icon name="sparkles" size={22} color={p.violet} style={styles.sparkle} />
        </View>

        <Text style={[styles.eyebrow, { color: p.primaryDeep }]}>PLANUL TĂU ESTE PREGĂTIT</Text>
        <Text
          accessibilityLabel={lockedFeature ? `${lockedFeature}. Vorbește liber. Învață din fiecare conversație.` : undefined}
          style={[styles.heroTitle, { color: p.ink }]}
        >
          Vorbește liber.{`\n`}Învață din fiecare conversație.
        </Text>
        <Text style={[styles.heroSubtitle, { color: p.ink2 }]}>
          AI-ul se adaptează nivelului, obiectivelor și greșelilor tale.
        </Text>
      </LinearGradient>

      <View style={styles.purchaseSection}>
        <Icon name="sparkles" size={27} color={p.primary} />
        <Text style={[styles.proTitle, { color: p.ink }]}>EnglezaAI Pro</Text>

        {!hasStorePrice ? (
          <Text accessibilityLiveRegion="polite" style={[styles.renewalLine, { color: p.ink2 }]}>
            {revenueCat.loading ? `Se încarcă prețul din ${storeName}…` : `Prețul nu este disponibil momentan în ${storeName}.`}
          </Text>
        ) : discount ? (
          <View style={styles.offerBlock}>
            <View style={[styles.offerBadge, { backgroundColor: p.successSoft }]}>
              <Icon name="sparkles" size={15} color={p.success} strokeWidth={2.3} />
              <Text style={[styles.offerBadgeText, { color: p.success }]}>OFERTĂ DE ÎNCEPUT · −{discount.discountPercent}%</Text>
            </View>
            <Text style={[styles.previousPrice, { color: p.muted }]}>{discount.basePriceString}</Text>
            <View style={styles.priceRow}>
              <Text style={[styles.price, { color: p.primary }]}>{discount.introPriceString}</Text>
              <Text style={[styles.offerDuration, { color: p.ink }]}>{discount.durationRo}</Text>
            </View>
            <Text style={[styles.renewalLine, { color: p.ink2 }]}>Apoi {discount.basePriceString}/lună</Text>
          </View>
        ) : (
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: p.primary }]}>{basePrice}</Text>
            <Text style={[styles.period, { color: p.ink }]}>/ lună</Text>
          </View>
        )}

        <View style={styles.benefits}>
          <Benefit text="Acces la toate modulele aplicației" color={p.success} textColor={p.ink2} />
        </View>

        {hasStorePrice && selectedTrial ? (
          <Text style={[styles.trialLine, { color: p.success }]}>
            {discount
              ? `${selectedTrial}, apoi ${discount.introPriceString} ${discount.durationRo}, apoi ${discount.basePriceString}/lună`
              : `${selectedTrial}, apoi ${basePrice}/lună`}
          </Text>
        ) : null}

        {!preview && revenueCat.error ? <Banner kind="error">{revenueCat.error}</Banner> : null}
        {message ? <Banner kind="info">{message}</Banner> : null}
        <Button
          title={revenueCat.busy
            ? 'Se procesează…'
            : selectedTrial
              ? `Începe ${selectedTrial}`
              : discount
                ? 'Activează oferta'
                : 'Deblochează Pro'}
          variant="primary"
          busy={revenueCat.busy}
          disabled={!preview && (!revenueCat.ready || revenueCat.loading || !hasStorePrice || revenueCat.busy)}
          onPress={() => void continueWithPlan()}
          style={styles.primaryButton}
          textStyle={styles.primaryButtonText}
        />

        <View style={styles.utilityRow}>
          <Pressable onPress={() => router.replace('/')} hitSlop={8}>
            <Text style={[styles.utilityLink, { color: p.primary }]}>Rămân la Free</Text>
          </Pressable>
          <View style={[styles.utilityDivider, { backgroundColor: p.border }]} />
          <Pressable disabled={!preview && (!revenueCat.ready || revenueCat.loading || revenueCat.busy)} onPress={() => void restore()} hitSlop={8}>
            <Text style={[styles.utilityLink, { color: p.primary }, (!preview && (!revenueCat.ready || revenueCat.loading || revenueCat.busy)) && styles.disabled]}>Restaurează</Text>
          </Pressable>
        </View>

        {!preview && (!hasStorePrice || revenueCat.error) && !revenueCat.loading ? (
          <Button
            title="Reîncearcă"
            variant="ghost"
            small
            disabled={revenueCat.busy}
            onPress={() => void revenueCat.reload()}
          />
        ) : null}

        <Text style={[styles.legal, { color: p.muted }]}>
          {hasStorePrice
            ? `Abonamentul se reînnoiește automat la ${basePrice}/lună. Anulezi din ${storeName}.`
            : `Abonament lunar cu reînnoire automată. Prețul trebuie încărcat înainte de plată. Anulezi din ${storeName}.`}
        </Text>

        <View style={styles.footerLinks}>
          <Pressable onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/terms.html`)} hitSlop={8}>
            <Text style={[styles.footerLink, { color: p.primary }]}>Termeni</Text>
          </Pressable>
          <View style={[styles.footerDivider, { backgroundColor: p.border }]} />
          <Pressable onPress={() => void Linking.openURL(`${PUBLIC_WEB_BASE}/privacy.html`)} hitSlop={8}>
            <Text style={[styles.footerLink, { color: p.primary }]}>Confidențialitate</Text>
          </Pressable>
          <View style={[styles.footerDivider, { backgroundColor: p.border }]} />
          <Pressable onPress={() => void signOutUser()} hitSlop={8}>
            <Text style={[styles.footerLink, { color: p.muted }]}>Schimbă contul</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function Benefit({ text, color, textColor }: { text: string; color: string; textColor: string }) {
  return (
    <View style={styles.benefitRow}>
      <Icon name="check" size={19} color={color} strokeWidth={3} />
      <Text style={[styles.benefitText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

function previewMonthlyPackage(): PurchasesPackage {
  if (Platform.OS !== 'android') {
    return {
      identifier: '$rc_monthly',
      packageType: 'MONTHLY',
      product: {
        identifier: 'monthly',
        description: 'Acces complet EnglezaAI Pro',
        title: 'EnglezaAI Pro Lunar',
        price: 199,
        priceString: '199,00 RON',
        currencyCode: 'RON',
        introPrice: {
          price: 0,
          priceString: '0,00 RON',
          cycles: 1,
          period: 'P3D',
          periodUnit: 'DAY',
          periodNumberOfUnits: 3,
        },
        defaultOption: null,
        subscriptionOptions: null,
        subscriptionPeriod: 'P1M',
      },
    } as unknown as PurchasesPackage;
  }

  const introPhase = {
    billingCycleCount: 1,
    billingPeriod: { unit: 'MONTH', value: 1, iso8601: 'P1M' },
    offerPaymentMode: 'DISCOUNTED_RECURRING_PAYMENT',
    recurrenceMode: 2,
    price: { amountMicros: 99_000_000, formatted: '99,00 RON', currencyCode: 'RON' },
  };
  const fullPricePhase = {
    billingCycleCount: null,
    billingPeriod: { unit: 'MONTH', value: 1, iso8601: 'P1M' },
    offerPaymentMode: null,
    recurrenceMode: 1,
    price: { amountMicros: 149_000_000, formatted: '149,00 RON', currencyCode: 'RON' },
  };
  return {
    identifier: '$rc_monthly',
    product: {
      identifier: 'monthly:monthly-autorenewing',
      title: 'EnglezaAI Pro Lunar',
      priceString: '99,00 RON',
      defaultOption: {
        id: 'monthly-autorenewing:intro-99-first-month',
        isBasePlan: false,
        introPhase,
        fullPricePhase,
        pricingPhases: [introPhase, fullPricePhase],
      },
      subscriptionOptions: [],
    },
  } as unknown as PurchasesPackage;
}

const styles = StyleSheet.create({
  screenContent: { width: '100%', maxWidth: 430, alignSelf: 'center' },
  hero: {
    alignItems: 'center',
    borderBottomLeftRadius: 48,
    borderBottomRightRadius: 48,
    paddingHorizontal: 26,
    paddingTop: 18,
    paddingBottom: 38,
    overflow: 'hidden',
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  heroIconHalo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  heroIcon: {
    width: 68,
    height: 68,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: { position: 'absolute', right: -5, top: 16 },
  eyebrow: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 2.1, textAlign: 'center' },
  heroTitle: { fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -1.1, textAlign: 'center', marginTop: 14 },
  heroSubtitle: { fontSize: 15.5, lineHeight: 23, fontWeight: '500', textAlign: 'center', maxWidth: 330, marginTop: 17 },
  purchaseSection: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 29 },
  proTitle: { fontSize: 27, lineHeight: 34, fontWeight: '800', letterSpacing: -0.4, marginTop: 7 },
  offerBlock: { alignSelf: 'stretch', alignItems: 'center', marginTop: 16 },
  offerBadge: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12, borderRadius: 999 },
  offerBadgeText: { fontSize: 11.5, lineHeight: 15, fontWeight: '900', letterSpacing: 0.35 },
  previousPrice: { marginTop: 11, fontSize: 16, lineHeight: 21, fontWeight: '700', textDecorationLine: 'line-through' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  price: { fontSize: 39, lineHeight: 49, fontWeight: '800', letterSpacing: -1, fontVariant: ['tabular-nums'] },
  period: { fontSize: 18, lineHeight: 25, fontWeight: '600' },
  offerDuration: { fontSize: 16, lineHeight: 23, fontWeight: '700' },
  renewalLine: { marginTop: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '600' },
  benefits: { alignSelf: 'stretch', alignItems: 'center', gap: 8, marginTop: 14 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 9, maxWidth: 330 },
  benefitText: { flexShrink: 1, fontSize: 15, lineHeight: 21, fontWeight: '500' },
  trialLine: { fontSize: 13.5, lineHeight: 19, fontWeight: '700', textAlign: 'center', marginTop: 10 },
  primaryButton: { alignSelf: 'stretch', minHeight: 57, borderRadius: 17, marginTop: 23 },
  primaryButtonText: { fontSize: 17, fontWeight: '700' },
  utilityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginTop: 19 },
  utilityLink: { fontSize: 14.5, lineHeight: 20, fontWeight: '700' },
  utilityDivider: { width: 1, height: 21 },
  disabled: { opacity: 0.4 },
  legal: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', maxWidth: 330, marginTop: 25 },
  footerLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  footerLink: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  footerDivider: { width: 1, height: 15 },
});
