import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import RevenueCatUI from 'react-native-purchases-ui';
import { useAuth } from '../auth/AuthContext';
import { getServerAccessInfo, type ServerAccessInfo } from '../api/backend';
import {
  REVENUECAT_ENTITLEMENT_ID,
  type RevenueCatPlan,
} from './constants';
import { loadRevenueCatState as readRevenueCatState, selectOffering } from './load-state';
import {
  activeProEntitlement,
  appAccessPlan,
  hasEnglezaAiPro,
  isCancelledRevenueCatPurchase,
  packageForPlan,
  revenueCatApiKeyError,
  revenueCatErrorMessage,
  type AppAccessPlan,
} from './model';

type PurchaseOutcome = 'purchased' | 'cancelled';

interface RevenueCatContextValue {
  ready: boolean;
  loading: boolean;
  busy: boolean;
  error: string;
  customerInfo: CustomerInfo | null;
  offering: PurchasesOffering | null;
  availablePackages: PurchasesPackage[];
  plan: AppAccessPlan;
  isPro: boolean;
  accessInfo: ServerAccessInfo | null;
  activeProductId: string | null;
  expirationDate: string | null;
  refreshCustomerInfo: () => Promise<CustomerInfo>;
  refreshAccessInfo: () => Promise<ServerAccessInfo | null>;
  purchasePlan: (plan: RevenueCatPlan) => Promise<PurchaseOutcome>;
  restorePurchases: () => Promise<boolean>;
  presentCustomerCenter: () => Promise<void>;
  reload: () => Promise<void>;
}

const RevenueCatContext = createContext<RevenueCatContextValue | null>(null);

let configuredForNativeStore = false;
let lastFirebaseUid: string | null = null;

function platformApiKey(): string {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY?.trim() || '';
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || '';
  return '';
}

async function configureRevenueCat(firebaseUid: string | null, email: string | null): Promise<void> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('RevenueCat necesită un build nativ Android sau iOS.');
  }

  const apiKey = platformApiKey();
  const allowTestStoreInProduction =
    process.env.EXPO_PUBLIC_REVENUECAT_ALLOW_TEST_KEY?.trim().toLowerCase() === 'true';
  const apiKeyError = revenueCatApiKeyError(
    apiKey,
    process.env.EXPO_PUBLIC_APP_ENV,
    allowTestStoreInProduction,
    Platform.OS
  );
  if (apiKeyError) throw new Error(apiKeyError);

  const alreadyConfigured = configuredForNativeStore || (await Purchases.isConfigured().catch(() => false));
  if (!alreadyConfigured) {
    await Purchases.setLogLevel(__DEV__ ? Purchases.LOG_LEVEL.DEBUG : Purchases.LOG_LEVEL.WARN);
    Purchases.configure({
      apiKey,
      appUserID: firebaseUid,
      entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
      automaticDeviceIdentifierCollectionEnabled: false,
      // Diagnostics folosește un endpoint separat și este opțional. Îl păstrăm
      // dezactivat inclusiv în development; logurile DEBUG rămân suficiente.
      diagnosticsEnabled: false,
    });
    configuredForNativeStore = true;
    lastFirebaseUid = firebaseUid;
    if (email) await Purchases.setEmail(email).catch(() => undefined);
    return;
  }

  configuredForNativeStore = true;

  const currentRevenueCatUid = await Purchases.getAppUserID();
  if (firebaseUid && currentRevenueCatUid !== firebaseUid) {
    await Purchases.logIn(firebaseUid);
  } else if (!firebaseUid && lastFirebaseUid) {
    await Purchases.logOut();
  }
  lastFirebaseUid = firebaseUid;
  // Subscriber attributes are optional and must not block the store catalogue.
  if (email) await Purchases.setEmail(email).catch(() => undefined);
}

export function RevenueCatProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, emailVerified } = useAuth();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [accessInfo, setAccessInfo] = useState<ServerAccessInfo | null>(null);
  const reloadSequence = useRef(0);

  const loadRevenueCatState = useCallback(async (sequence = reloadSequence.current) => {
    await readRevenueCatState(Purchases, {
      customerInfo: setCustomerInfo,
      offering: setOffering,
      isCurrent: () => sequence === reloadSequence.current,
    });
  }, []);

  const loadAccessState = useCallback(async (sequence = reloadSequence.current) => {
    if (!user || !emailVerified) {
      if (sequence === reloadSequence.current) setAccessInfo(null);
      return null;
    }
    const nextAccessInfo = await getServerAccessInfo();
    if (sequence === reloadSequence.current) setAccessInfo(nextAccessInfo);
    return nextAccessInfo;
  }, [emailVerified, user]);

  const reload = useCallback(async (background = false) => {
    const sequence = ++reloadSequence.current;
    if (!background) setLoading(true);
    setError('');
    let revenueCatReady = false;
    let revenueCatError = '';
    try {
      await configureRevenueCat(emailVerified ? user?.uid ?? null : null, emailVerified ? user?.email ?? null : null);
      // SDK readiness also permits Restore when Google Play cannot load products.
      revenueCatReady = true;
      if (sequence !== reloadSequence.current) return;
      await loadRevenueCatState(sequence);
    } catch (nextError) {
      revenueCatError = revenueCatErrorMessage(nextError);
    }
    try {
      await loadAccessState(sequence);
    } catch (nextError) {
      // Entitlement-ul local rămâne fallback când endpoint-ul de acces nu răspunde.
      if (!revenueCatError) revenueCatError = revenueCatErrorMessage(nextError);
    } finally {
      if (sequence === reloadSequence.current) {
        setReady(revenueCatReady);
        setError(revenueCatError);
        setLoading(false);
      }
    }
  }, [emailVerified, loadAccessState, loadRevenueCatState, user?.email, user?.uid]);

  useEffect(() => {
    if (authLoading) return;
    void reload();

    return () => {
      reloadSequence.current += 1;
    };
  }, [authLoading, reload]);

  useEffect(() => {
    if (!ready) return;
    const listener = (nextCustomerInfo: CustomerInfo) => setCustomerInfo(nextCustomerInfo);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [ready]);

  useEffect(() => {
    if (!user || !emailVerified) return;
    const subscription = AppState.addEventListener('change', (nextState) => {
      // Retry even after a failed initial load; do not refresh over a purchase sheet.
      if (nextState !== 'active' || busy || loading) return;
      void reload(true);
    });
    return () => subscription.remove();
  }, [busy, emailVerified, loading, reload, user]);

  const runBusy = useCallback(async <T,>(operation: () => Promise<T>): Promise<T> => {
    setBusy(true);
    setError('');
    try {
      return await operation();
    } catch (nextError) {
      if (!isCancelledRevenueCatPurchase(nextError)) setError(revenueCatErrorMessage(nextError));
      throw nextError;
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshCustomerInfo = useCallback(
    () => runBusy(async () => {
      const nextCustomerInfo = await Purchases.getCustomerInfo();
      setCustomerInfo(nextCustomerInfo);
      await loadAccessState().catch(() => null);
      return nextCustomerInfo;
    }),
    [loadAccessState, runBusy]
  );

  const refreshAccessInfo = useCallback(
    () => runBusy(() => loadAccessState()),
    [loadAccessState, runBusy]
  );

  const purchasePlan = useCallback(
    (plan: RevenueCatPlan) => runBusy(async () => {
      const currentOffering = offering ?? selectOffering(await Purchases.getOfferings());
      const packageToPurchase = packageForPlan(currentOffering, plan);
      if (!packageToPurchase) {
        throw new Error(`Planul ${plan} nu există în offering-ul RevenueCat curent.`);
      }

      try {
        const result = await Purchases.purchasePackage(packageToPurchase);
        setCustomerInfo(result.customerInfo);
        await loadAccessState().catch(() => null);
        if (!hasEnglezaAiPro(result.customerInfo)) {
          throw new Error(`Achiziția s-a încheiat, dar entitlement-ul ${REVENUECAT_ENTITLEMENT_ID} nu este activ.`);
        }
        return 'purchased' as const;
      } catch (purchaseError) {
        if (isCancelledRevenueCatPurchase(purchaseError)) return 'cancelled' as const;
        throw purchaseError;
      }
    }),
    [loadAccessState, offering, runBusy]
  );

  const restorePurchases = useCallback(
    () => runBusy(async () => {
      const restoredCustomerInfo = await Purchases.restorePurchases();
      setCustomerInfo(restoredCustomerInfo);
      await loadAccessState().catch(() => null);
      return hasEnglezaAiPro(restoredCustomerInfo);
    }),
    [loadAccessState, runBusy]
  );

  const presentCustomerCenter = useCallback(
    () => runBusy(async () => {
      await RevenueCatUI.presentCustomerCenter({
        callbacks: {
          onRestoreCompleted: ({ customerInfo: restoredCustomerInfo }) => setCustomerInfo(restoredCustomerInfo),
          onRestoreFailed: ({ error: restoreError }) => setError(revenueCatErrorMessage(restoreError)),
          onPromotionalOfferSucceeded: ({ customerInfo: updatedCustomerInfo }) => setCustomerInfo(updatedCustomerInfo),
        },
      });
      await Promise.all([loadRevenueCatState(), loadAccessState().catch(() => null)]);
    }),
    [loadAccessState, loadRevenueCatState, runBusy]
  );

  const entitlement = activeProEntitlement(customerInfo);
  const plan = appAccessPlan(customerInfo, accessInfo?.plan ?? null);
  const value = useMemo<RevenueCatContextValue>(() => ({
    ready,
    loading,
    busy,
    error,
    customerInfo,
    offering,
    availablePackages: offering?.availablePackages ?? [],
    plan,
    isPro: plan !== 'free',
    accessInfo,
    activeProductId: entitlement?.productIdentifier ?? null,
    expirationDate: entitlement?.expirationDate ?? null,
    refreshCustomerInfo,
    refreshAccessInfo,
    purchasePlan,
    restorePurchases,
    presentCustomerCenter,
    reload,
  }), [
    busy,
    accessInfo,
    customerInfo,
    entitlement,
    error,
    loading,
    offering,
    plan,
    presentCustomerCenter,
    purchasePlan,
    ready,
    refreshAccessInfo,
    refreshCustomerInfo,
    reload,
    restorePurchases,
  ]);

  return <RevenueCatContext.Provider value={value}>{children}</RevenueCatContext.Provider>;
}

export function useRevenueCat(): RevenueCatContextValue {
  const context = useContext(RevenueCatContext);
  if (!context) throw new Error('useRevenueCat trebuie folosit în interiorul RevenueCatProvider.');
  return context;
}
