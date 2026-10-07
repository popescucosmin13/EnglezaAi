export const REVENUECAT_ENTITLEMENT_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID?.trim() || 'englezaai_pro';

export const REVENUECAT_ENTITLEMENT_NAME = 'EnglezaAI Pro';

export const REVENUECAT_OFFERING_ID =
  process.env.EXPO_PUBLIC_REVENUECAT_OFFERING_ID?.trim() || 'default';

export const REVENUECAT_PRODUCT_IDS = {
  lifetime: 'lifetime',
  yearly: 'yearly',
  monthly: 'monthly',
} as const;

export type RevenueCatPlan = keyof typeof REVENUECAT_PRODUCT_IDS;
