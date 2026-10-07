import type { CustomerInfo, PurchasesOffering, PurchasesOfferings } from 'react-native-purchases';
import { REVENUECAT_OFFERING_ID } from './constants';

export function selectOffering(offerings: PurchasesOfferings): PurchasesOffering | null {
  return offerings.current ?? offerings.all[REVENUECAT_OFFERING_ID] ?? null;
}

interface StoreReader {
  getCustomerInfo: () => Promise<CustomerInfo>;
  getOfferings: () => Promise<PurchasesOfferings>;
}

interface StateUpdates {
  customerInfo: (value: CustomerInfo) => void;
  offering: (value: PurchasesOffering | null) => void;
  isCurrent: () => boolean;
}

/** Keep each successful response even when the other store request fails. */
export async function loadRevenueCatState(store: StoreReader, updates: StateUpdates): Promise<void> {
  const [customer, offerings] = await Promise.allSettled([
    store.getCustomerInfo().then((value) => {
      if (updates.isCurrent()) updates.customerInfo(value);
    }),
    store.getOfferings().then((value) => {
      const offering = selectOffering(value);
      if (updates.isCurrent()) updates.offering(offering);
      if (!offering?.availablePackages.length) {
        throw new Error('RevenueCat offering has no available store packages.');
      }
    }),
  ]);
  // A catalogue failure explains missing prices, so report it before account errors.
  if (offerings.status === 'rejected') throw offerings.reason;
  if (customer.status === 'rejected') throw customer.reason;
}
