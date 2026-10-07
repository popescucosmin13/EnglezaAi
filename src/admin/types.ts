import type { DailyActivity, Mistake, Profile, Session } from '../types';

export type ClientPlatform = 'android' | 'ios' | 'web';
export interface AdminClient {
  platform: ClientPlatform | null; source: 'profile' | 'revenuecat' | null;
  appVersion: string; build: string; osVersion: string; lastSeenAt: string; country: string;
}
export interface AdminCommerce {
  status: 'linked' | 'unlinked' | 'unavailable'; isPro: boolean | null;
  expiresAt: number | null; platform: ClientPlatform | null; appVersion: string;
  osVersion: string; country: string; lastSeenAt: string;
}

export interface AdminError {
  id: string; uid: string; email: string; at: string; message: string;
  source: string; page: string; version: string; resolved: boolean;
}
export interface AdminUser {
  uid: string;
  profile: Partial<Omit<Profile, 'scores'>> & { lastPlatform?: ClientPlatform; lastSeenAt?: string; appVersion?: string; appBuild?: string; osVersion?: string; scores?: Partial<Profile['scores']> };
  commerce?: AdminCommerce;
  auth: { email: string; displayName: string; disabled: boolean; emailVerified: boolean; createdAt: string; lastSignInAt: string; providers: string[] } | null;
  totals: { sessions: number; speakingSec: number; mistakes: number; vocab: number } | null;
  activity: Partial<DailyActivity>[];
  errors: AdminError[];
  warnings: string[];
}
export interface AdminPage {
  users: AdminUser[]; totalUsers: number; nextCursor: string | null;
  days: number; today: string; generatedAt: string;
}
export interface AdminUserDetail {
  sessions: Pick<Session, 'id' | 'type' | 'startedAt' | 'userSpeakingSec' | 'wordCount' | 'errorCount' | 'reportStatus'>[];
  mistakes: Pick<Mistake, 'id' | 'category' | 'original' | 'corrected' | 'status' | 'occurrenceCount'>[];
  vocab: { id: string; text: string; translation: string; status: string }[];
  collections: { name: string; count: number }[];
}
export interface AuditEntry {
  id: string; at: string; actor: string; action: string; target: string;
  changes: Record<string, unknown>; status?: string;
}
export interface BackendStatus {
  services: Record<string, boolean>;
  server: { firebaseProjectId: string; azureRegion: string; grammarEndpoint: string; uidRestricted: boolean; subscriptionEnforcement: boolean; appUrl: string };
}
export interface OpenRouterInfo {
  key: { label?: string; usage?: number; limit?: number | null } | null;
  credits: { total_credits?: number; total_usage?: number } | null;
}
