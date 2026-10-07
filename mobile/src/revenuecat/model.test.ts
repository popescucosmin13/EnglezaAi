import { describe, expect, it } from 'vitest';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import {
  appAccessPlan,
  basePriceStringForPackage,
  hasEnglezaAiPro,
  introductoryDiscountForPackage,
  isCancelledRevenueCatPurchase,
  packageForPlan,
  revenueCatApiKeyError,
  revenueCatErrorMessage,
  trialLabelForPackage,
} from './model';

function customerInfo(active: boolean, periodType = 'NORMAL'): CustomerInfo {
  return {
    entitlements: {
      active: active ? { englezaai_pro: { isActive: true, periodType } } : {},
      all: {},
      verification: 'NOT_REQUESTED',
    },
  } as unknown as CustomerInfo;
}

function rcPackage(identifier: string, productIdentifier: string): PurchasesPackage {
  return { identifier, product: { identifier: productIdentifier } } as unknown as PurchasesPackage;
}

describe('RevenueCat entitlement și produse', () => {
  it('activează Pro numai pentru entitlement-ul activ', () => {
    expect(hasEnglezaAiPro(customerInfo(true))).toBe(true);
    expect(hasEnglezaAiPro(customerInfo(false))).toBe(false);
    expect(hasEnglezaAiPro(null)).toBe(false);
  });

  it('separă Free, Trial, Pro și accesul admin/server-side', () => {
    expect(appAccessPlan(customerInfo(false), 'free')).toBe('free');
    expect(appAccessPlan(customerInfo(true, 'TRIAL'), 'pro')).toBe('trial');
    expect(appAccessPlan(customerInfo(true), 'free')).toBe('pro');
    expect(appAccessPlan(customerInfo(false), 'pro')).toBe('pro');
    expect(appAccessPlan(customerInfo(false), 'admin')).toBe('admin');
  });

  it('preferă package-urile standard RevenueCat', () => {
    const monthly = rcPackage('$rc_monthly', 'monthly');
    const offering = { monthly, availablePackages: [monthly] } as unknown as PurchasesOffering;
    expect(packageForPlan(offering, 'monthly')).toBe(monthly);
  });

  it('găsește și produsele Google Play cu base-plan în identificator', () => {
    const yearly = rcPackage('yearly', 'yearly:yearly-autorenewing');
    const offering = { annual: null, availablePackages: [yearly] } as unknown as PurchasesOffering;
    expect(packageForPlan(offering, 'yearly')).toBe(yearly);
  });

  it('afișează trial-ul numai când Google Play îl întoarce ca ofertă eligibilă', () => {
    const eligible = {
      product: {
        defaultOption: {
          pricingPhases: [{ offerPaymentMode: 'FREE_TRIAL', billingPeriod: { iso8601: 'P7D' }, price: { amountMicros: 0 } }],
        },
      },
    } as unknown as PurchasesPackage;
    expect(trialLabelForPackage(eligible)).toBe('7 zile gratuit');
    expect(trialLabelForPackage(rcPackage('monthly', 'monthly'))).toBeNull();
  });

  it('afișează trial-ul introductiv returnat de App Store', () => {
    const eligible = {
      product: {
        price: 149,
        priceString: '149,00 RON',
        introPrice: { price: 0, priceString: '0,00 RON', cycles: 1, period: 'P7D' },
      },
    } as unknown as PurchasesPackage;
    expect(trialLabelForPackage(eligible, true)).toBe('7 zile gratuit');
    expect(trialLabelForPackage(eligible, false)).toBeNull();
    expect(trialLabelForPackage(eligible)).toBeNull();
  });

  it('afișează discountul introductiv eligibil și prețul standard de reînnoire', () => {
    const eligible = {
      product: {
        priceString: '99,00 RON',
        defaultOption: {
          id: 'monthly:intro-99-first-month',
          isBasePlan: false,
          introPhase: {
            billingCycleCount: 1,
            billingPeriod: { unit: 'MONTH', value: 1, iso8601: 'P1M' },
            offerPaymentMode: 'DISCOUNTED_RECURRING_PAYMENT',
            price: { amountMicros: 99_000_000, formatted: '99,00 RON' },
          },
          fullPricePhase: {
            billingPeriod: { unit: 'MONTH', value: 1, iso8601: 'P1M' },
            recurrenceMode: 1,
            price: { amountMicros: 149_000_000, formatted: '149,00 RON' },
          },
          pricingPhases: [],
        },
      },
    } as unknown as PurchasesPackage;

    expect(introductoryDiscountForPackage(eligible)).toEqual({
      offerId: 'monthly:intro-99-first-month',
      introPriceString: '99,00 RON',
      basePriceString: '149,00 RON',
      durationRo: 'prima lună',
      discountPercent: 34,
      billingCycles: 1,
    });
    expect(basePriceStringForPackage(eligible)).toBe('149,00 RON');
  });

  it('nu promite discount unui utilizator neeligibil', () => {
    const ineligible = {
      product: {
        priceString: '149,00 RON',
        defaultOption: {
          id: 'monthly',
          isBasePlan: true,
          fullPricePhase: {
            billingPeriod: { unit: 'MONTH', value: 1, iso8601: 'P1M' },
            recurrenceMode: 1,
            price: { amountMicros: 149_000_000, formatted: '149,00 RON' },
          },
        },
      },
    } as unknown as PurchasesPackage;

    expect(introductoryDiscountForPackage(ineligible)).toBeNull();
    expect(basePriceStringForPackage(ineligible)).toBe('149,00 RON');
  });

  it('afișează discountul introductiv returnat de App Store', () => {
    const eligible = {
      product: {
        price: 149,
        priceString: '149,00 RON',
        introPrice: { price: 99, priceString: '99,00 RON', cycles: 1, period: 'P1M' },
        defaultOption: null,
      },
    } as unknown as PurchasesPackage;

    expect(introductoryDiscountForPackage(eligible, true)).toEqual({
      offerId: null,
      introPriceString: '99,00 RON',
      basePriceString: '149,00 RON',
      durationRo: 'prima lună',
      discountPercent: 34,
      billingCycles: 1,
    });
    expect(basePriceStringForPackage(eligible)).toBe('149,00 RON');
    expect(introductoryDiscountForPackage(eligible, false)).toBeNull();
    expect(introductoryDiscountForPackage(eligible)).toBeNull();
  });

  it('nu afișează trial-ul unei oferte Android diferite de cea cumpărată', () => {
    const item = {
      product: {
        defaultOption: { isBasePlan: true, pricingPhases: [] },
        subscriptionOptions: [{
          pricingPhases: [{ billingPeriod: { iso8601: 'P7D' }, price: { amountMicros: 0 } }],
        }],
      },
    } as unknown as PurchasesPackage;
    expect(trialLabelForPackage(item)).toBeNull();
  });

  it('recunoaște anularea fără a o raporta drept eroare', () => {
    expect(isCancelledRevenueCatPurchase({ code: '1' })).toBe(true);
    expect(isCancelledRevenueCatPurchase({ userCancelled: true })).toBe(true);
    expect(isCancelledRevenueCatPurchase({ code: '10' })).toBe(false);
  });

  it('transformă erorile tehnice de configurare într-un mesaj pentru utilizator', () => {
    expect(revenueCatErrorMessage({
      message: 'There is an issue with your configuration. Check the underlying error for more details.',
      underlyingErrorMessage: 'None of the products registered in RevenueCat could be fetched from Google Play.',
    })).toBe('Google Play nu a putut finaliza operația. Încearcă din nou.');
  });

  it('permite cheia Test Store în producție numai cu opt-in explicit', () => {
    expect(revenueCatApiKeyError('test_demo', 'preview')).toBeNull();
    expect(revenueCatApiKeyError('goog_demo', 'production')).toBeNull();
    expect(revenueCatApiKeyError('test_demo', 'production')).toContain('goog_');
    expect(revenueCatApiKeyError('test_demo', 'production', true)).toBeNull();
    expect(revenueCatApiKeyError('invalid_demo', 'production', true)).toContain('goog_');
    expect(revenueCatApiKeyError('', 'development')).toContain('Lipsește');
    expect(revenueCatApiKeyError('appl_demo', 'production', false, 'ios')).toBeNull();
    expect(revenueCatApiKeyError('goog_demo', 'production', false, 'ios')).toContain('appl_');
    expect(revenueCatApiKeyError('', 'development', false, 'ios')).toContain('IOS_API_KEY');
  });
});
