import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { LearningPreferences } from '../pages/Onboarding';
import { getProfile } from '../db/db';
import type { Profile } from '../types';
import { Banner, Button, Screen, Spinner } from '../ui';
export default function PreferencesRoute() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const load = () => { setError(''); void getProfile().then(setProfile).catch(() => setError('Nu am putut încărca preferințele.')); };
  useEffect(load, []);
  if (!profile) return <Screen>{error ? <><Banner kind="error">{error}</Banner><Button title="Reîncearcă" onPress={load} /></> : <Spinner />}</Screen>;
  return <LearningPreferences initialProfile={profile} onDone={() => router.back()} />;
}
