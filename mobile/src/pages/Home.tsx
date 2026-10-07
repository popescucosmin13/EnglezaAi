// Ecranul principal: planul personalizat rămâne dominant, iar toate scurtăturile
// și datele importante sunt grupate compact, fără a pierde funcționalitate.

import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import type { Profile, DailyPlan, DailyActivity, Mistake } from '../types';
import { CATEGORY_LABELS_RO } from '../types';
import {
  getProfile,
  defaultProfile,
  getActivity,
  todayStr,
  getMistakes,
  getAllActivity,
  getSessions,
  saveSituation,
  getSituations,
  newId,
  saveProfile,
} from '../db/db';
import {
  getOrCreateDailyPlan,
  prioritizeMistakes,
  dedupeMistakes,
  compositeScore,
  awardMissionRewards,
} from '../logic/engine';
import { ninetyDayStage, normalizeProgramDuration, PROGRAM_EXTENSION_DAYS, WEEKLY_STRUCTURE, DAILY_MISSIONS, type Mission } from '../content';
import { dailyMissionProgress, daysAgoStr } from '../logic/metrics';
import { mistakeDisplay } from '../logic/mistake-quality';
import { Icon, type IconName } from '../components/Icon';
import {
  Screen,
  Muted,
  Tiny,
  P,
  Banner,
  Button,
  ButtonRow,
  Chip,
  ChipRow,
  RoutineItem,
  Skeleton,
  Field,
} from '../ui';
import { usePalette, type Palette } from '../theme';
import { getDueOverview } from '../microlearning/state';
import type { DueOverview } from '../microlearning/types';
import { hasOpenRouterKey } from '../settings';
import { useRevenueCat } from '../revenuecat/RevenueCatContext';
import { useAuth } from '../auth/AuthContext';

export default function Home({ preview = false }: { preview?: boolean }) {
  const p = usePalette();
  const access = useRevenueCat();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(() => preview ? previewProfile() : null);
  const [plan, setPlan] = useState<DailyPlan | null>(() => preview ? previewPlan() : null);
  const [activity, setActivity] = useState<DailyActivity | null>(() => preview ? previewActivity() : null);
  const [weekMinutes, setWeekMinutes] = useState(preview ? 48 : 0);
  const [topMistake, setTopMistake] = useState<Mistake | null>(() => preview ? previewMistake() : null);
  const [justAwarded, setJustAwarded] = useState<Mission[]>([]);
  const [loadError, setLoadError] = useState('');
  const [readyReports, setReadyReports] = useState(0);
  const [dueOverview, setDueOverview] = useState<DueOverview | null>(() => preview
    ? { total: 3, mistakes: 1, vocabulary: 2, curriculum: 0, estimatedSeconds: 150 }
    : null);

  async function load() {
    setLoadError('');
    try {
      const prof = await getProfile();
      setProfile(prof);
      setActivity(await getActivity(todayStr()));
      const acts = await getAllActivity();
      const since = daysAgoStr(7);
      setWeekMinutes(Math.round(acts.filter((a) => a.date >= since).reduce((x, a) => x + a.speakingSec, 0) / 60));
      const mistakes = dedupeMistakes(await getMistakes());
      const recent = mistakes.filter((m) => m.lastSeenAt.slice(0, 10) >= since && m.status !== 'mastered');
      setTopMistake(prioritizeMistakes(recent)[0] ?? null);
      setPlan(await getOrCreateDailyPlan());
      const sessions = await getSessions();
      setReadyReports(sessions.filter((session) => session.reportStatus === 'ready' && !session.reportSeen).length);
      setDueOverview(await getDueOverview());
      const awarded = await awardMissionRewards();
      if (awarded.length > 0) {
        setJustAwarded(awarded);
        setProfile(await getProfile());
        setActivity(await getActivity(todayStr()));
      }
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (preview) return;
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preview])
  );

  if (!profile) {
    return <HomeSkeleton error={loadError} onRetry={load} />;
  }

  const minutesToday = activity ? Math.round(activity.speakingSec / 60) : 0;
  const daysSince = Math.max(0, Math.floor((Date.now() - new Date(profile.startDate + 'T00:00:00').getTime()) / 86400000));
  const programDuration = normalizeProgramDuration(profile.programDurationDays);
  const programDay = Math.min(programDuration, daysSince + 1);
  const stage = ninetyDayStage(daysSince, programDuration);
  const programComplete = daysSince >= programDuration;
  const recentLevelChange = profile.lastLevelChange
    && Date.now() - new Date(profile.lastLevelChange.changedAt).getTime() < 14 * 86400000
      ? profile.lastLevelChange
      : null;
  const dow = new Date().getDay();
  const todayStructure = WEEKLY_STRUCTURE.find((w) => w.day === dow)!;
  const missions = dailyMissionProgress(activity ?? ({} as DailyActivity));
  const missionsDone = DAILY_MISSIONS.filter((mission) => (missions[mission.id] ?? 0) >= mission.target).length;
  const score = compositeScore(profile.scores);
  const isPro = preview || access.isPro;
  const planLabel = preview ? 'PRO' : access.plan === 'trial' ? 'TRIAL PRO' : access.plan === 'free' ? 'FREE' : 'PRO';
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Bună, ${firstName}!` : 'Bună!';
  const targetMinutes = plan
    ? isPro
      ? plan.targetMinutes
      : Math.min(5, plan.targetMinutes)
    : isPro
      ? profile.dailyGoalMinutes
      : Math.min(5, profile.dailyGoalMinutes);

  async function extendProgram() {
    if (!profile) return;
    const next = { ...profile, programDurationDays: programDuration + PROGRAM_EXTENSION_DAYS };
    setProfile(next);
    if (!preview) await saveProfile(next);
  }

  return (
    <Screen style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={styles.identityRow}>
          <View style={[styles.avatar, { backgroundColor: p.primarySoft }]}>
            <Icon name="user" size={28} color={p.primary} strokeWidth={2.1} />
          </View>
          <View style={styles.identityCopy}>
            <Text style={[styles.greeting, { color: p.ink }]} numberOfLines={1}>{greeting}</Text>
            <View style={[styles.levelBadge, { backgroundColor: p.primarySoft }]}>
              <Text style={[styles.levelText, { color: p.primaryDeep }]}>{profile.currentLevel} → {profile.targetLevel}</Text>
            </View>
          </View>
        </View>
        <Pressable
          disabled={isPro || !access.ready}
          onPress={() => router.push('/subscription')}
          accessibilityRole={isPro ? 'text' : 'button'}
          accessibilityLabel={isPro ? 'Ai acces la toate modulele aplicației' : 'Deblochează toate modulele aplicației'}
          style={({ pressed }) => [styles.planBadge, { backgroundColor: p.primarySoft, opacity: pressed ? 0.72 : 1 }]}
        >
          <Icon name="star" size={17} color={p.primaryDeep} strokeWidth={2.2} />
          <Text style={[styles.planBadgeText, { color: p.primaryDeep }]}>{planLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.metricsRow}>
        <MetricChip icon="zap" value={`${profile.xp} XP`} tone={p.warnInk} background={p.warnSoft} />
        <MetricChip icon="flame" value={`${profile.streak} zile`} tone={p.primary} background={p.primarySoft} />
        <MetricChip icon="calendar" value={`Ziua ${programDay}/${programDuration}`} tone={p.primary} background={p.primarySoft} />
        <MetricChip icon="target" value={`Scor ${score}`} tone={p.success} background={p.successSoft} />
      </View>

      {!isPro ? (
        <HomeNotice
          icon="star"
          title="Deblochează toate modulele aplicației"
          detail="Plan Free · o sesiune zilnică de maximum 5 minute"
          tone={p.primaryDeep}
          background={p.primarySoft}
          onPress={() => router.push('/subscription')}
        />
      ) : null}

      {recentLevelChange ? (
        <HomeNotice
          icon="trending"
          title={`Nivel nou: ${recentLevelChange.to}`}
          detail="Tutorul, lecțiile, vocabularul și poveștile se adaptează automat la noul nivel"
          tone={p.success}
          background={p.successSoft}
          onPress={() => router.push('/progress')}
        />
      ) : null}

      {programComplete ? (
        <HomeNotice
          icon="trophy"
          title={`Ai finalizat cele ${programDuration} de zile`}
          detail={`Continuă fără să pierzi progresul · extinde planul cu ${PROGRAM_EXTENSION_DAYS} de zile`}
          tone={p.primaryDeep}
          background={p.primarySoft}
          onPress={() => void extendProgram()}
        />
      ) : null}

      {justAwarded.length > 0 ? (
        <HomeNotice
          icon="trophy"
          title="Misiuni îndeplinite"
          detail={justAwarded.map((mission) => `${mission.titleRo} (+${mission.xp} XP)`).join(' · ')}
          tone={p.success}
          background={p.successSoft}
        />
      ) : null}

      {readyReports > 0 ? (
        <HomeNotice
          icon="chart"
          title={readyReports === 1 ? 'Raportul unei sesiuni este gata' : `${readyReports} rapoarte de sesiune sunt gata`}
          detail="Deschide Progres pentru recomandări"
          tone={p.primaryDeep}
          background={p.primarySoft}
          onPress={() => router.push('/progress')}
        />
      ) : null}

      {!hasOpenRouterKey() ? (
        <HomeNotice
          icon="triangleAlert"
          title="Tutorul este temporar indisponibil"
          detail="Încearcă din nou puțin mai târziu"
          tone={p.danger}
          background={p.dangerSoft}
        />
      ) : null}

      {!profile.testDone ? (
        <HomeNotice
          icon="graduation"
          title="Fă întâi testul de nivel"
          detail="10–15 min · nivel CEFR pe 5 competențe"
          tone={p.primaryDeep}
          background={p.primarySoft}
          onPress={() => router.push('/test')}
        />
      ) : null}

      <DailyPlanHero
        title={plan?.conversationScenarioTitle ?? 'Sesiunea de astăzi'}
        minutes={targetMinutes}
        sessionType={todayStructure.titleRo}
        onPress={() => router.push('/session')}
        p={p}
      />

      <SectionTitle>Scurtături</SectionTitle>
      <View style={styles.shortcutGrid}>
        <Shortcut title="For You" icon="sparkles" pro={!isPro} onPress={() => router.push('/for-you')} p={p} />
        <Shortcut title="Învață 3 min" icon="clock" pro={!isPro} onPress={() => router.push('/learn')} p={p} />
        <Shortcut title="Sesiune rapidă" icon="zap" pro={!isPro} onPress={() => router.push('/quick')} p={p} />
        <Shortcut title="60 secunde" icon="mic" onPress={() => router.push('/voice-challenge')} p={p} />
        <Shortcut title="Povestea zilei" icon="book" onPress={() => router.push('/story')} p={p} />
        <Shortcut title="Boss Battle" icon="trophy" onPress={() => router.push('/boss')} p={p} />
        <Shortcut title="Vorbește" icon="message" pro={!isPro} onPress={() => router.push('/talk')} p={p} />
        <Shortcut title="Practică" icon="puzzle" pro={!isPro} onPress={() => router.push('/practice')} p={p} />
      </View>

      {dueOverview && dueOverview.total > 0 ? (
        <HomeNotice
          icon="save"
          title={`${dueOverview.total} ${dueOverview.total === 1 ? 'element este pe cale să fie uitat' : 'elemente sunt pe cale să fie uitate'}`}
          detail={`Recuperează-le în aproximativ ${Math.max(1, Math.ceil(dueOverview.estimatedSeconds / 60))} min`}
          tone={p.warnInk}
          background={p.warnSoft}
          onPress={() => router.push({ pathname: '/learn', params: { mode: 'rescue' } })}
        />
      ) : null}

      <SectionTitle>Astăzi</SectionTitle>
      <View style={[styles.todayCard, { backgroundColor: p.card, borderColor: p.border }]}>
        <TodayStat icon="clock" value={minutesToday} label="min azi" tone={p.success} p={p} />
        <View style={[styles.statDivider, { backgroundColor: p.border }]} />
        <TodayStat icon="chart" value={weekMinutes} label="min săptămâna aceasta" tone={p.success} p={p} />
        <View style={[styles.statDivider, { backgroundColor: p.border }]} />
        <TodayStat icon="target" value={score} label="scor /100" tone={p.success} p={p} />
      </View>

      <SectionTitle>Plan și progres</SectionTitle>
      <View style={[styles.progressCard, { backgroundColor: p.card, borderColor: p.border }]}>
        <DetailRow title="De ce contează azi" icon="compass" p={p}>
          {plan ? (
            <>
              <Muted style={styles.detailText}>{plan.reasonRo}</Muted>
              <ChipRow style={styles.detailChips}>
                <Chip label={plan.grammarFocusLabel} icon="book" selected />
                <Chip label={`sunet: ${plan.pronunciationFocus}`} icon="audio" selected />
                <Chip label={plan.conversationScenarioTitle} icon="message" selected />
              </ChipRow>
            </>
          ) : <Tiny>Planul de azi se pregătește.</Tiny>}
        </DetailRow>

        <DetailRow
          title="Greșeala principală"
          icon="target"
          badge={topMistake ? CATEGORY_LABELS_RO[topMistake.category] : 'Niciuna'}
          p={p}
        >
          {topMistake ? (
            <Pressable onPress={() => router.push('/practice')} accessibilityRole="button">
              <Text style={[styles.wrongText, { color: p.danger }]}>{mistakeDisplay(topMistake).wrong}</Text>
              <Text style={[styles.rightText, { color: p.success }]}>{mistakeDisplay(topMistake).right}</Text>
              <Tiny>{CATEGORY_LABELS_RO[topMistake.category]} · de {topMistake.occurrenceCount} ori · {topMistake.explanationRo}</Tiny>
            </Pressable>
          ) : <Tiny>Nu ai nicio greșeală activă din ultimele 7 zile.</Tiny>}
        </DetailRow>

        <DetailRow
          title={`${plan?.vocabularyFocus.length ?? 0} expresii de repetat`}
          icon="sparkles"
          badge={plan?.vocabularyFocus.length ?? 0}
          p={p}
        >
          {plan && plan.vocabularyFocus.length > 0 ? (
            <ChipRow style={styles.detailChips}>
              {plan.vocabularyFocus.map((word) => <Chip key={word} label={word} />)}
            </ChipRow>
          ) : <Tiny>Nu ai expresii scadente pentru repetare astăzi.</Tiny>}
        </DetailRow>

        <DetailRow title="Misiunile zilei" icon="trophy" badge={`${missionsDone}/${DAILY_MISSIONS.length}`} p={p}>
          {DAILY_MISSIONS.map((mission, index) => {
            const progress = Math.min(missions[mission.id] ?? 0, mission.target);
            const done = progress >= mission.target;
            return (
              <View key={mission.id} style={styles.missionRow}>
                <View style={styles.missionTitle}>
                  <RoutineItem done={done} last={index === DAILY_MISSIONS.length - 1}>{mission.titleRo}</RoutineItem>
                </View>
                <Tiny>{progress}/{mission.target} · +{mission.xp} XP</Tiny>
              </View>
            );
          })}
        </DetailRow>

        <SaveSituationRow p={p} preview={preview} />

        <DetailRow title="Obiectivul următor" icon="rocket" badge={profile.targetLevel} p={p} last>
          <P style={styles.detailText}>
            <Text style={styles.goalStrong}>{profile.temporalObjective}</Text> · țintă: {profile.targetLevel}
          </P>
          {profile.recommendedPlanRo ? <Muted>{profile.recommendedPlanRo}</Muted> : null}
          <Tiny>{stage.goalsRo.join(' · ')}</Tiny>
        </DetailRow>
      </View>
    </Screen>
  );
}

function HomeSkeleton({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error) {
    return (
      <Screen>
        <Banner kind="error">Nu am putut încărca datele: {error}</Banner>
        <ButtonRow><Button title="Reîncearcă" onPress={onRetry} /></ButtonRow>
      </Screen>
    );
  }
  return (
    <Screen>
      <View accessibilityLabel="Se încarcă">
        <View style={styles.headerRow}>
          <View style={styles.identityRow}>
            <Skeleton width={54} height={54} radius={27} />
            <View style={styles.skeletonIdentity}>
              <Skeleton width={128} height={24} />
              <Skeleton width={66} height={22} radius={8} />
            </View>
          </View>
          <Skeleton width={58} height={34} radius={12} />
        </View>
        <View style={styles.metricsRow}>{[0, 1, 2, 3].map((item) => <Skeleton key={item} height={38} radius={12} style={styles.metricSkeleton} />)}</View>
        <Skeleton height={228} radius={24} style={styles.heroSkeleton} />
        <Skeleton width={96} height={22} style={styles.sectionSkeleton} />
        <View style={styles.shortcutGrid}>{[0, 1, 2, 3, 4, 5, 6, 7].map((item) => <Skeleton key={item} height={80} radius={16} style={styles.shortcutSkeleton} />)}</View>
      </View>
    </Screen>
  );
}

function MetricChip({ icon, value, tone, background }: { icon: IconName; value: string; tone: string; background: string }) {
  return (
    <View style={[styles.metricChip, { backgroundColor: background }]}>
      <Icon name={icon} size={12} color={tone} strokeWidth={2.4} />
      <Text style={[styles.metricText, { color: tone }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function HomeNotice({ icon, title, detail, tone, background, onPress }: {
  icon: IconName;
  title: string;
  detail: string;
  tone: string;
  background: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.noticeIcon}>
        <Icon name={icon} size={18} color={tone} strokeWidth={2.2} />
      </View>
      <View style={styles.noticeCopy}>
        <Text style={[styles.noticeTitle, { color: tone }]}>{title}</Text>
        <Text style={[styles.noticeDetail, { color: tone }]}>{detail}</Text>
      </View>
      {onPress ? <Icon name="chevronDown" size={17} color={tone} style={styles.noticeChevron} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.notice, { backgroundColor: background }]}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.notice, { backgroundColor: background, opacity: pressed ? 0.72 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

function DailyPlanHero({ title, minutes, sessionType, onPress, p }: {
  title: string;
  minutes: number;
  sessionType: string;
  onPress: () => void;
  p: Palette;
}) {
  return (
    <LinearGradient
      colors={['#5A5EEB', '#7459EB', '#945DF2']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={styles.heroCopy}>
        <Text style={styles.heroEyebrow}>PLANUL TĂU DE AZI</Text>
        <Text style={styles.heroTitle} numberOfLines={2}>{title}</Text>
        <View style={styles.heroMeta}>
          <Icon name="clock" size={18} color={p.white} strokeWidth={2.2} />
          <Text style={styles.heroMetaStrong}>{minutes} min</Text>
          <Text style={styles.heroMetaText}>· {sessionType}</Text>
        </View>
      </View>
      <View style={styles.heroArt}>
        <Icon name="message" size={41} color={p.white} strokeWidth={1.8} />
      </View>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Începe sesiunea de astăzi"
        style={({ pressed }) => [styles.heroButton, { backgroundColor: p.white, opacity: pressed ? 0.84 : 1 }]}
      >
        <Icon name="play" size={22} color={p.primaryDeep} />
        <Text style={[styles.heroButtonText, { color: p.primaryDeep }]}>Începe sesiunea</Text>
      </Pressable>
    </LinearGradient>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  const p = usePalette();
  return <Text style={[styles.sectionTitle, { color: p.ink }]}>{children}</Text>;
}

function Shortcut({ title, icon, onPress, pro, p }: {
  title: string;
  icon: IconName;
  onPress: () => void;
  pro?: boolean;
  p: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${pro ? ', funcție Pro' : ''}`}
      style={({ pressed }) => [
        styles.shortcut,
        { backgroundColor: p.card, borderColor: p.border, transform: [{ scale: pressed ? 0.97 : 1 }] },
      ]}
    >
      {pro ? (
        <View style={[styles.proDot, { backgroundColor: p.primarySoft }]}>
          <Text style={[styles.proDotText, { color: p.primaryDeep }]}>PRO</Text>
        </View>
      ) : null}
      <Icon name={icon} size={25} color={p.primary} strokeWidth={2.1} />
      <Text style={[styles.shortcutText, { color: p.ink }]} numberOfLines={2}>{title}</Text>
    </Pressable>
  );
}

function TodayStat({ icon, value, label, tone, p }: { icon: IconName; value: number; label: string; tone: string; p: Palette }) {
  return (
    <View style={styles.todayStat}>
      <Icon name={icon} size={21} color={tone} strokeWidth={2.2} />
      <Text style={[styles.statValue, { color: p.ink }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: p.muted }]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

function DetailRow({ title, icon, badge, children, p, last }: {
  title: string;
  icon: IconName;
  badge?: ReactNode;
  children: ReactNode;
  p: Palette;
  last?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={!last ? { borderBottomWidth: 1, borderBottomColor: p.border } : undefined}>
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.detailHead, pressed && { backgroundColor: p.bgSoft }]}
      >
        <View style={[styles.detailIcon, { backgroundColor: p.primarySoft }]}>
          <Icon name={icon} size={18} color={p.primary} strokeWidth={2.2} />
        </View>
        <Text style={[styles.detailTitle, { color: p.ink }]} numberOfLines={1}>{title}</Text>
        {badge != null && badge !== '' ? (
          <Text style={[styles.detailBadge, { color: p.muted }]} numberOfLines={1}>{badge}</Text>
        ) : null}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={p.muted} />
      </Pressable>
      {open ? <View style={[styles.detailBody, { backgroundColor: p.bgSoft }]}>{children}</View> : null}
    </View>
  );
}

function SaveSituationRow({ p, preview }: { p: Palette; preview?: boolean }) {
  const [openForm, setOpenForm] = useState(false);
  const [text, setText] = useState('');
  const [pendingCount, setPendingCount] = useState(preview ? 1 : 0);
  const [savedMsg, setSavedMsg] = useState('');

  useFocusEffect(
    useCallback(() => {
      if (preview) return;
      getSituations().then((situations) => setPendingCount(situations.filter((item) => !item.used).length)).catch(() => {});
    }, [preview])
  );

  async function save() {
    if (!text.trim()) return;
    if (preview) {
      setPendingCount((count) => count + 1);
      setText('');
      setOpenForm(false);
      setSavedMsg('Salvat — sesiunea de mâine va porni exact de la situația ta.');
      return;
    }
    try {
      await saveSituation({ id: newId(), text: text.trim(), createdAt: new Date().toISOString(), used: false });
      setPendingCount((count) => count + 1);
      setText('');
      setOpenForm(false);
      setSavedMsg('Salvat — sesiunea de mâine va porni exact de la situația ta.');
    } catch (e: any) {
      setSavedMsg(`Nu s-a putut salva: ${String(e?.message ?? e)}`);
    }
  }

  return (
    <DetailRow title="Situație de exersat" icon="briefcase" badge={pendingCount || undefined} p={p}>
      {savedMsg ? <Banner kind="info">{savedMsg}</Banner> : null}
      {!openForm ? (
        <>
          <Muted style={styles.detailText}>
            Salvează o discuție dificilă sau o situație în care nu ți-au ieșit cuvintele.
            {pendingCount > 0 ? ` Ai ${pendingCount} în așteptare.` : ''}
          </Muted>
          <Button
            title="Salvează situația pentru mâine"
            icon="briefcase"
            onPress={() => {
              setOpenForm(true);
              setSavedMsg('');
            }}
          />
        </>
      ) : (
        <>
          <Field
            value={text}
            onChange={setText}
            multiline
            placeholder="Ex: clientul a cerut o explicație despre incident și nu am știut cum să formulez impactul…"
          />
          <ButtonRow>
            <Button title="Salvează" variant="primary" onPress={save} disabled={!text.trim()} />
            <Button title="Renunț" variant="ghost" onPress={() => setOpenForm(false)} />
          </ButtonRow>
        </>
      )}
    </DetailRow>
  );
}

function previewProfile(): Profile {
  return {
    ...defaultProfile(),
    onboarded: true,
    testDone: true,
    currentLevel: 'B1',
    targetLevel: 'B2',
    competencyLevels: { conversation: 'B1', grammar: 'B1', pronunciation: 'B1', vocabulary: 'B1', listening: 'B1' },
    scores: { conversation: 76, grammar: 69, pronunciation: 71, vocabulary: 74, listening: 72 },
    temporalObjective: 'să conduc ședințe în engleză cu mai multă încredere',
    recommendedPlanRo: 'Consolidează exprimarea profesională și corectează greșelile recurente.',
    startDate: todayStr(new Date(Date.now() - 33 * 86400000)),
    streak: 12,
    lastActiveDay: todayStr(),
    xp: 1840,
  };
}

function previewPlan(): DailyPlan {
  return {
    date: todayStr(),
    targetMinutes: 20,
    grammarFocus: 'present_perfect',
    grammarFocusLabel: 'Present Perfect',
    vocabularyFocus: ['give an update', 'on track', 'raise a concern'],
    pronunciationFocus: 'th',
    conversationScenario: 'standup-update',
    conversationScenarioTitle: 'Conversație pentru ședințe',
    reasonRo: 'Azi exersezi un update scurt și clar pentru ședințe, cu accent pe exprimarea progresului și a blocajelor.',
    completed: false,
  };
}

function previewActivity(): DailyActivity {
  return {
    date: todayStr(),
    speakingSec: 8 * 60,
    appActiveSec: 18 * 60,
    sessionCount: 1,
    vocabReviews: 3,
    pronPhrases: 4,
    shadowPhrases: 2,
    lessonDone: true,
    expressionsUsed: 2,
    sentencesRepeated: 5,
    noRomanianConvo: false,
    oldMistakeFixed: false,
    noHelpConvo: false,
    testDone: false,
    xp: 30,
  };
}

function previewMistake(): Mistake {
  const now = new Date().toISOString();
  return {
    id: 'preview-mistake',
    original: 'I am working here since three years.',
    corrected: 'I have worked here for three years.',
    originalFragment: 'since three years',
    correctFragment: 'for three years',
    category: 'present_perfect',
    severity: 'medium',
    explanationRo: 'Folosim „for” pentru o durată și Present Perfect pentru o acțiune începută în trecut care continuă.',
    firstSeenAt: now,
    lastSeenAt: now,
    occurrenceCount: 3,
    status: 'learning',
    review: { step: 1, nextReviewAt: todayStr(), correctUses: 1, failures: 2 },
  };
}

const styles = StyleSheet.create({
  screen: { paddingTop: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  identityRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 11 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  identityCopy: { flex: 1, minWidth: 0, gap: 5, alignItems: 'flex-start' },
  greeting: { fontSize: 25, lineHeight: 29, fontWeight: '800', letterSpacing: -0.5 },
  levelBadge: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 3 },
  levelText: { fontSize: 13.5, lineHeight: 17, fontWeight: '800' },
  planBadge: { minHeight: 36, borderRadius: 12, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  planBadgeText: { fontSize: 13.5, fontWeight: '900', letterSpacing: 0.25 },
  metricsRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  metricChip: { minWidth: 0, flex: 1, height: 38, borderRadius: 12, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  metricText: { flexShrink: 1, fontSize: 10.2, fontWeight: '800', letterSpacing: -0.2 },
  notice: { borderRadius: 15, paddingVertical: 10, paddingHorizontal: 11, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
    noticeIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  noticeCopy: { flex: 1, minWidth: 0 },
  noticeTitle: { fontSize: 13.5, lineHeight: 17, fontWeight: '800' },
  noticeDetail: { fontSize: 11.5, lineHeight: 15, opacity: 0.82, marginTop: 1 },
  noticeChevron: { transform: [{ rotate: '-90deg' }] },
  hero: { minHeight: 230, borderRadius: 25, marginTop: 16, padding: 22, overflow: 'hidden', justifyContent: 'space-between' },
  heroCopy: { zIndex: 1 },
  heroEyebrow: { color: '#FFFFFF', fontSize: 12.5, lineHeight: 16, fontWeight: '900', letterSpacing: 1.2, opacity: 0.94 },
  heroTitle: { color: '#FFFFFF', maxWidth: '72%', fontSize: 29, lineHeight: 33, fontWeight: '900', letterSpacing: -0.7, marginTop: 10 },
  heroMeta: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroMetaStrong: { color: '#FFFFFF', fontSize: 14.5, lineHeight: 18, fontWeight: '800' },
  heroMetaText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 18, opacity: 0.82, flexShrink: 1 },
  heroArt: { position: 'absolute', right: 25, top: 69, width: 78, height: 78, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-4deg' }] },
  heroButton: { zIndex: 1, minHeight: 54, borderRadius: 16, marginTop: 21, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  heroButtonText: { fontSize: 17, lineHeight: 21, fontWeight: '900' },
  sectionTitle: { fontSize: 19, lineHeight: 24, fontWeight: '900', letterSpacing: -0.3, marginTop: 24, marginBottom: 10 },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shortcut: { position: 'relative', flexBasis: '22%', flexGrow: 1, minHeight: 82, borderRadius: 17, borderWidth: 1, paddingHorizontal: 5, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', gap: 7 },
  shortcutText: { minHeight: 28, textAlign: 'center', fontSize: 11.5, lineHeight: 14, fontWeight: '700' },
  proDot: { position: 'absolute', top: 5, right: 5, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2 },
  proDotText: { fontSize: 6.5, lineHeight: 8, fontWeight: '900', letterSpacing: 0.25 },
  todayCard: { minHeight: 94, borderRadius: 19, borderWidth: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 12 },
  todayStat: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  statDivider: { width: 1, height: 49 },
  statValue: { fontSize: 22, lineHeight: 25, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { maxWidth: 94, textAlign: 'center', fontSize: 9.5, lineHeight: 12, fontWeight: '600' },
  progressCard: { borderRadius: 19, borderWidth: 1, overflow: 'hidden', marginBottom: 8 },
  detailHead: { minHeight: 58, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  detailBadge: { maxWidth: 86, fontSize: 11, lineHeight: 14, fontWeight: '700' },
  detailBody: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14 },
  detailText: { marginTop: 0, marginBottom: 9 },
  detailChips: { marginTop: 0, marginBottom: 0 },
  wrongText: { textDecorationLine: 'line-through', fontSize: 15.5 },
  rightText: { fontWeight: '700', fontSize: 15.5, marginVertical: 3 },
  missionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missionTitle: { flex: 1 },
  goalStrong: { fontWeight: '800' },
  skeletonIdentity: { gap: 8 },
  metricSkeleton: { flex: 1 },
  heroSkeleton: { marginTop: 16 },
  sectionSkeleton: { marginTop: 24, marginBottom: 10 },
  shortcutSkeleton: { flexBasis: '22%', flexGrow: 1 },
});
