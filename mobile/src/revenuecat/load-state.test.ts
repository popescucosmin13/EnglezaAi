import { describe, expect, it, vi } from 'vitest';
import type { CustomerInfo, PurchasesOffering, PurchasesOfferings } from 'react-native-purchases';
import { loadRevenueCatState, selectOffering } from './load-state';

const customerInfo = { entitlements: { active: { englezaai_pro: { isActive: true } } } } as unknown as CustomerInfo;
const offering = {
  identifier: 'default',
  availablePackages: [{ identifier: '$rc_monthly', product: { identifier: 'monthly:monthly-autorenewing', priceString: '149,00 RON' } }],
} as PurchasesOffering;
const offerings = { current: offering, all: { default: offering } } as PurchasesOfferings;

function updates() {
  return { customerInfo: vi.fn(), offering: vi.fn(), isCurrent: () => true };
}

describe('RevenueCat partial responses', () => {
  it('keeps store prices when customer info fails', async () => {
    const state = updates();
    const failure = new Error('Customer info network error');
    await expect(loadRevenueCatState({
      getCustomerInfo: async () => { throw failure; },
      getOfferings: async () => offerings,
    }, state)).rejects.toBe(failure);
    expect(state.offering).toHaveBeenCalledWith(offering);
    expect(state.customerInfo).not.toHaveBeenCalled();
  });

  it('keeps Pro access when Google Play cannot return products', async () => {
    const state = updates();
    const failure = new Error('Products unavailable in Google Play');
    await expect(loadRevenueCatState({
      getCustomerInfo: async () => customerInfo,
      getOfferings: async () => { throw failure; },
    }, state)).rejects.toBe(failure);
    expect(state.customerInfo).toHaveBeenCalledWith(customerInfo);
    expect(state.offering).not.toHaveBeenCalled();
  });

  it('publishes prices before the customer request completes', async () => {
    const state = updates();
    let resolveCustomer!: (value: CustomerInfo) => void;
    const pending = loadRevenueCatState({
      getCustomerInfo: () => new Promise((resolve) => { resolveCustomer = resolve; }),
      getOfferings: async () => offerings,
    }, state);
    await Promise.resolve();
    expect(state.offering).toHaveBeenCalledWith(offering);
    resolveCustomer(customerInfo);
    await pending;
  });

  it('reports empty packages and replaces an obsolete offering', async () => {
    const state = updates();
    const empty = { ...offering, availablePackages: [] };
    await expect(loadRevenueCatState({
      getCustomerInfo: async () => customerInfo,
      getOfferings: async () => ({ current: empty, all: { default: empty } }),
    }, state)).rejects.toThrow('no available store packages');
    expect(state.offering).toHaveBeenCalledWith(empty);
    expect(state.customerInfo).toHaveBeenCalledWith(customerInfo);
  });

  it('discards a response from an obsolete login or reload', async () => {
    const state = { ...updates(), isCurrent: () => false };
    await loadRevenueCatState({ getCustomerInfo: async () => customerInfo, getOfferings: async () => offerings }, state);
    expect(state.customerInfo).not.toHaveBeenCalled();
    expect(state.offering).not.toHaveBeenCalled();
  });

  it('can recover on the next load after a catalogue failure', async () => {
    const state = updates();
    const store = {
      getCustomerInfo: async () => customerInfo,
      getOfferings: vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(offerings),
    };
    await expect(loadRevenueCatState(store, state)).rejects.toThrow('offline');
    await expect(loadRevenueCatState(store, state)).resolves.toBeUndefined();
    expect(state.offering).toHaveBeenCalledWith(offering);
  });
});

describe('offering selection for display and purchase', () => {
  it('uses the configured offering when current is absent', () => {
    expect(selectOffering({ current: null, all: { default: offering } })).toBe(offering);
    expect(selectOffering({ current: null, all: {} })).toBeNull();
  });

  it('preserves RevenueCat targeting even when the current offering has no packages', () => {
    const targeted = { ...offering, identifier: 'targeted', availablePackages: [] };
    expect(selectOffering({ current: targeted, all: { default: offering, targeted } })).toBe(targeted);
  });
});
