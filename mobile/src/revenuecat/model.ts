import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { REVENUECAT_ENTITLEMENT_ID, REVENUECAT_PRODUCT_IDS, type RevenueCatPlan } from './constants';

export type AppAccessPlan = 'free' | 'trial' | 'pro' | 'admin';

export interface IntroductoryDiscountDisplay {
  offerId: string | null;
  introPriceString: string;
  basePriceString: string;
  durationRo: string;
  discountPercent: number;
  billingCycles: number;
}

export function activeProEntitlement(customerInfo: CustomerInfo | null) {
  return customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENT_ID] ?? null;
}

export function hasEnglezaAiPro(customerInfo: CustomerInfo | null): boolean {
  return activeProEntitlement(customerInfo)?.isActive === true;
}

export function isTrialEntitlement(customerInfo: CustomerInfo | null): boolean {
  const entitlement = activeProEntitlement(customerInfo);
  return entitlement?.isActive === true && String(entitlement.periodType ?? '').toLowerCase().includes('trial');
}

/** RevenueCat detectează trial-ul, iar backend-ul adaugă accesul Pro promoțional/admin. */
export function appAccessPlan(
  customerInfo: CustomerInfo | null,
  serverPlan: 'free' | 'pro' | 'admin' | null
): AppAccessPlan {
  if (serverPlan === 'admin') return 'admin';
  if (isTrialEntitlement(customerInfo)) return 'trial';
  if (hasEnglezaAiPro(customerInfo) || serverPlan === 'pro') return 'pro';
  return 'free';
}

export function packageForPlan(
  offering: PurchasesOffering | null,
  plan: RevenueCatPlan
): PurchasesPackage | null {
  if (!offering) return null;

  const standardPackage =
    plan === 'lifetime' ? offering.lifetime : plan === 'yearly' ? offering.annual : offering.monthly;
  if (standardPackage) return standardPackage;

  const productId = REVENUECAT_PRODUCT_IDS[plan];
  return (
    offering.availablePackages.find(
      (candidate) =>
        candidate.identifier === plan ||
        candidate.product.identifier === productId ||
        candidate.product.identifier.startsWith(`${productId}:`)
    ) ?? null
  );
}

function trialPeriodRo(iso: string): string | null {
  const match = /^P(\d+)([DWMY])$/i.exec(iso.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  const labels: Record<string, [string, string]> = {
    D: ['zi', 'zile'],
    W: ['săptămână', 'săptămâni'],
    M: ['lună', 'luni'],
    Y: ['an', 'ani'],
  };
  const [one, many] = labels[match[2].toUpperCase()] ?? ['perioadă', 'perioade'];
  return `${amount} ${amount === 1 ? one : many}`;
}

function pricingPhases(option: any): any[] {
  return Array.isArray(option?.pricingPhases) ? option.pricingPhases : [];
}

function phaseAmountMicros(phase: any): number {
  return Number(phase?.price?.amountMicros ?? phase?.priceAmountMicros ?? NaN);
}

function phasePriceString(phase: any): string {
  return String(phase?.price?.formatted ?? phase?.price?.formattedPrice ?? phase?.priceString ?? '').trim();
}

function fullPricePhase(option: any): any | null {
  if (option?.fullPricePhase) return option.fullPricePhase;
  const phases = pricingPhases(option);
  return (
    [...phases].reverse().find((phase) => {
      const mode = String(phase?.offerPaymentMode ?? phase?.paymentMode ?? '').toUpperCase();
      const recurrence = String(phase?.recurrenceMode ?? '').toUpperCase();
      return phaseAmountMicros(phase) > 0
        && !mode.includes('DISCOUNT')
        && (recurrence === '1' || recurrence.includes('INFINITE'));
    })
    ?? [...phases].reverse().find((phase) => phaseAmountMicros(phase) > 0)
    ?? null
  );
}

function introPricePhase(option: any, baseAmountMicros: number): any | null {
  const direct = option?.introPhase;
  if (direct) {
    const amount = phaseAmountMicros(direct);
    if (amount > 0 && amount < baseAmountMicros) return direct;
  }
  return pricingPhases(option).find((phase) => {
    const amount = phaseAmountMicros(phase);
    const mode = String(phase?.offerPaymentMode ?? phase?.paymentMode ?? '').toUpperCase();
    return amount > 0 && amount < baseAmountMicros && mode.includes('DISCOUNT');
  }) ?? null;
}

function durationLabelRo(phase: any, billingCycles: number): string {
  const period = phase?.billingPeriod ?? {};
  const iso = String(period?.iso8601 ?? period ?? '');
  const isoMatch = /^P(\d+)([DWMY])$/i.exec(iso.trim());
  const isoUnits: Record<string, string> = { D: 'DAY', W: 'WEEK', M: 'MONTH', Y: 'YEAR' };
  const unit = String(period?.unit ?? (isoMatch ? isoUnits[isoMatch[2].toUpperCase()] : 'MONTH')).toUpperCase();
  const periodUnits = Number(period?.value ?? isoMatch?.[1] ?? 1);
  const totalUnits = Math.max(1, periodUnits * billingCycles);
  const labels: Record<string, [string, string]> = {
    DAY: ['zi', 'zile'],
    WEEK: ['săptămână', 'săptămâni'],
    MONTH: ['lună', 'luni'],
    YEAR: ['an', 'ani'],
  };
  const [one, many] = labels[unit] ?? labels.MONTH;
  return totalUnits === 1 ? `prima ${one}` : `primele ${totalUnits} ${many}`;
}

/** Prețul standard de reînnoire, nu prețul primei faze din oferta eligibilă. */
export function basePriceStringForPackage(item: PurchasesPackage | null): string | null {
  const product = item?.product as any;
  const option = product?.defaultOption;
  const phasePrice = phasePriceString(fullPricePhase(option));
  if (phasePrice) return phasePrice;

  const basePlan = Array.isArray(product?.subscriptionOptions)
    ? product.subscriptionOptions.find((candidate: any) => candidate?.isBasePlan)
    : null;
  const basePlanPrice = phasePriceString(fullPricePhase(basePlan));
  return basePlanPrice || (typeof product?.priceString === 'string' ? product.priceString : null);
}

/** Oferta introductivă eligibilă returnată de App Store sau Google Play. */
export function introductoryDiscountForPackage(item: PurchasesPackage | null, appleIntroEligible = false): IntroductoryDiscountDisplay | null {
  const product = item?.product as any;
  const option = product?.defaultOption;
  if (!option) {
    // App Store returns introPrice even for customers who already used the offer.
    if (!appleIntroEligible) return null;
    const intro = product?.introPrice;
    const introAmount = Number(intro?.price ?? NaN);
    const baseAmount = Number(product?.price ?? NaN);
    const introPriceString = String(intro?.priceString ?? '').trim();
    const basePriceString = String(product?.priceString ?? '').trim();
    if (!Number.isFinite(introAmount) || !Number.isFinite(baseAmount)) return null;
    if (introAmount <= 0 || baseAmount <= 0 || introAmount >= baseAmount) return null;
    if (!introPriceString || !basePriceString) return null;
    const billingCycles = Math.max(1, Number(intro?.cycles ?? 1));
    return {
      offerId: null,
      introPriceString,
      basePriceString,
      durationRo: durationLabelRo({ billingPeriod: { iso8601: intro?.period } }, billingCycles),
      discountPercent: Math.max(1, Math.round((1 - introAmount / baseAmount) * 100)),
      billingCycles,
    };
  }
  if (option?.isBasePlan === true) return null;

  const basePhase = fullPricePhase(option);
  const baseAmountMicros = phaseAmountMicros(basePhase);
  const introPhase = introPricePhase(option, baseAmountMicros);
  const introAmountMicros = phaseAmountMicros(introPhase);
  const introPriceString = phasePriceString(introPhase);
  const basePriceString = phasePriceString(basePhase);
  if (!Number.isFinite(baseAmountMicros) || !Number.isFinite(introAmountMicros)) return null;
  if (baseAmountMicros <= 0 || introAmountMicros <= 0 || introAmountMicros >= baseAmountMicros) return null;
  if (!introPriceString || !basePriceString) return null;

  const billingCycles = Math.max(1, Number(introPhase?.billingCycleCount ?? 1));
  return {
    offerId: typeof option?.id === 'string' ? option.id : null,
    introPriceString,
    basePriceString,
    durationRo: durationLabelRo(introPhase, billingCycles),
    discountPercent: Math.max(1, Math.round((1 - introAmountMicros / baseAmountMicros) * 100)),
    billingCycles,
  };
}

/** Eticheta trial-ului eligibil returnat efectiv de magazin; nu promite trial celor neeligibili. */
export function trialLabelForPackage(item: PurchasesPackage | null, appleIntroEligible = false): string | null {
  const product = item?.product as any;
  const appleIntro = product?.introPrice;
  if (!product?.defaultOption && appleIntroEligible && appleIntro && Number(appleIntro.price) === 0) {
    const period = trialPeriodRo(String(appleIntro.period ?? ''));
    if (period) return `${period} gratuit`;
  }
  // purchasePackage uses defaultOption. Other offers must not affect the displayed terms.
  const options = [product?.defaultOption].filter(Boolean);
  for (const option of options) {
    const phases = Array.isArray(option?.pricingPhases) ? option.pricingPhases : [];
    for (const phase of phases) {
      const mode = String(phase?.offerPaymentMode ?? phase?.paymentMode ?? '').toUpperCase();
      const amountMicros = Number(phase?.price?.amountMicros ?? phase?.priceAmountMicros ?? NaN);
      if (!mode.includes('FREE_TRIAL') && amountMicros !== 0) continue;
      const iso = String(phase?.billingPeriod?.iso8601 ?? phase?.billingPeriod ?? '');
      const period = trialPeriodRo(iso);
      if (period) return `${period} gratuit`;
    }
  }
  return null;
}

export function revenueCatErrorMessage(error: unknown): string {
  let raw = '';
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown; underlyingErrorMessage?: unknown };
    if (typeof candidate.underlyingErrorMessage === 'string' && candidate.underlyingErrorMessage.trim()) {
      raw = candidate.underlyingErrorMessage;
    } else if (typeof candidate.message === 'string' && candidate.message.trim()) {
      raw = candidate.message;
    }
  }
  if (!raw) raw = error instanceof Error ? error.message : String(error);

  const normalized = raw.toLowerCase();
  if (/network|offline|internet|timeout|timed out|conexi/.test(normalized)) {
    return 'Nu am putut verifica abonamentul. Verifică internetul și încearcă din nou.';
  }
  if (/app store|storekit|apple/.test(normalized)) {
    return 'App Store nu a putut finaliza operația. Încearcă din nou.';
  }
  if (/google play/.test(normalized)) {
    return 'Google Play nu a putut finaliza operația. Încearcă din nou.';
  }
  if (/billing|store|purchase|payment|achizi|plată/.test(normalized)) {
    return 'Magazinul de aplicații nu a putut finaliza operația. Încearcă din nou.';
  }
  if (/product|package|offering|entitlement|configuration|api.key|revenuecat|expo_public/.test(normalized)) {
    return 'Planul Pro nu este disponibil momentan. Încearcă din nou puțin mai târziu.';
  }
  return 'Abonamentul nu a putut fi verificat momentan. Încearcă din nou.';
}

export function isCancelledRevenueCatPurchase(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; userCancelled?: unknown };
  return candidate.userCancelled === true || candidate.code === '1';
}

export function revenueCatApiKeyError(
  apiKey: string,
  appEnvironment?: string,
  allowTestStoreInProduction = false,
  platform: 'android' | 'ios' = 'android'
): string | null {
  const variableName = platform === 'ios'
    ? 'EXPO_PUBLIC_REVENUECAT_IOS_API_KEY'
    : 'EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY';
  const productionPrefix = platform === 'ios' ? 'appl_' : 'goog_';
  if (!apiKey) return `Lipsește ${variableName}.`;
  const explicitlyAllowedTestKey = allowTestStoreInProduction && apiKey.startsWith('test_');
  if (appEnvironment === 'production' && !apiKey.startsWith(productionPrefix) && !explicitlyAllowedTestKey) {
    return `Buildul production pentru ${platform === 'ios' ? 'iOS' : 'Android'} necesită o cheie RevenueCat ${productionPrefix} sau activarea explicită a Test Store pentru testare internă.`;
  }
  return null;
}
