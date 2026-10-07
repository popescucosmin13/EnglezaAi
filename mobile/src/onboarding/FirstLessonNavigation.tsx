import { useEffect } from 'react';
import { router, useNavigationContainerRef } from 'expo-router';
import { clearFirstLessonPending, hasFirstLessonPending } from './draft';

export default function FirstLessonNavigation({ uid }: { uid: string }) {
  const navigation = useNavigationContainerRef();
  useEffect(() => {
    const redirect = () => {
      if (!navigation.isReady() || !hasFirstLessonPending(uid)) return;
      // Sesiunea zilnică este disponibilă și pentru Free.
      router.replace('/session');
      clearFirstLessonPending(uid);
    };
    const unsubscribe = navigation.addListener('ready', redirect);
    redirect();
    return unsubscribe;
  }, [uid, navigation]);
  return null;
}
