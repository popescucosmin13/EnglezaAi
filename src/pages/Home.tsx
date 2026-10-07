// Ecranul principal: planul personalizat rămâne dominant, iar toate scurtăturile
// și datele importante sunt grupate compact, fără a pierde funcționalitate.

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Skeleton, SkeletonGroup } from '../components/Skeleton';
import type { Profile, DailyPlan, DailyActivity, Mistake } from '../types';
import { CATEGORY_LABELS_RO } from '../types';
import {
  getProfile,
  defaultProfile,
  getActivity,
  emptyActivity,
  todayStr,
  getMistakes,
  getAllActivity,
  getSessions,
  saveSituation,
  getSituations,
  newId,
  saveProfile,
} from '../db/db';
import { on } from '../events';
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
import { hasOpenRouterKey } from '../settings';
import { Icon, type IconName } from '../components/Icon';
import { getDueOverview } from '../microlearning/state';
import type { DueOverview } from '../microlearning/types';
import { useAccess } from '../access/AccessContext';
import { useAuth } from '../auth/AuthContext';

export default function Home({ preview = false }: { preview?: boolean }) {
  const navigate = useNavigate();
  const access = useAccess();
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(() => preview ? previewProfile() : null);
  const [plan, setPlan] = useState<DailyPlan | null>(() => preview ? previewPlan() : null);
  const [activity, setActivity] = useState<DailyActivity | null>(() => preview ? previewActivity() : null);
  const [weekMinutes, setWeekMinutes] = useState(preview ? 48 : 0);
  const [topMistake, setTopMistake] = useState<Mistake | null>(() => preview ? previewMistake() : null);
  const [justAwarded, setJustAwarded] = useState<Mission[]>([]);
  const [loadError, setLoadError] = useState('');
  const [readyReports, setReadyReports] = useState(0);
  const [dueOverview, setDueOverview] = useState<DueOverview | null>(null);

  async function load() {
    if (preview) return;
    setLoadError('');
    try {
      const nextProfile = await getProfile();
      setProfile(nextProfile);
      setActivity(await getActivity(todayStr()));
      const acts = await getAllActivity();
      const since = daysAgoStr(7);
      setWeekMinutes(Math.round(acts.filter((item) => item.date >= since).reduce((sum, item) => sum + item.speakingSec, 0) / 60));
      const mistakes = dedupeMistakes(await getMistakes());
      const recent = mistakes.filter((item) => item.lastSeenAt.slice(0, 10) >= since && item.status !== 'mastered');
      setTopMistake(prioritizeMistakes(recent)[0] ?? null);
      setPlan(await getOrCreateDailyPlan());
      const sessions = await getSessions();
      setReadyReports(sessions.filter((item) => item.reportStatus === 'ready' && !item.reportSeen).length);
      setDueOverview(await getDueOverview());
      const awarded = await awardMissionRewards();
      if (awarded.length > 0) {
        setJustAwarded(awarded);
        setProfile(await getProfile());
        setActivity(await getActivity(todayStr()));
      }
    } catch (error: any) {
      setLoadError(String(error?.message ?? error));
    }
  }

  useEffect(() => {
    if (!preview) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    return on('engleza-report-ready', () => void load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  if (!profile) return <HomeSkeleton error={loadError} onRetry={load} />;

  const minutesToday = activity ? Math.round(activity.speakingSec / 60) : 0;
  const daysSince = Math.max(0, Math.floor((Date.now() - new Date(`${profile.startDate}T00:00:00`).getTime()) / 86400000));
  const programDuration = normalizeProgramDuration(profile.programDurationDays);
  const programDay = Math.min(programDuration, daysSince + 1);
  const stage = ninetyDayStage(daysSince, programDuration);
  const programComplete = daysSince >= programDuration;
  const recentLevelChange = profile.lastLevelChange
    && Date.now() - new Date(profile.lastLevelChange.changedAt).getTime() < 14 * 86400000
      ? profile.lastLevelChange
      : null;
  const todayStructure = WEEKLY_STRUCTURE.find((item) => item.day === new Date().getDay())!;
  const missions = dailyMissionProgress(activity ?? emptyActivity(todayStr()));
  const missionsDone = DAILY_MISSIONS.filter((mission) => (missions[mission.id] ?? 0) >= mission.target).length;
  const score = compositeScore(profile.scores);
  const isPro = preview || access.isPro;
  const planLabel = preview ? 'PRO' : access.plan === 'admin' ? 'ADMIN' : access.plan === 'free' ? 'FREE' : 'PRO';
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const greeting = preview ? 'Bună, Alex' : firstName ? `Bună, ${firstName}` : 'Bună!';
  const targetMinutes = plan
    ? isPro ? plan.targetMinutes : Math.min(5, plan.targetMinutes)
    : isPro ? profile.dailyGoalMinutes : Math.min(5, profile.dailyGoalMinutes);

  async function extendProgram() {
    if (!profile) return;
    const next = { ...profile, programDurationDays: programDuration + PROGRAM_EXTENSION_DAYS };
    setProfile(next);
    if (!preview) await saveProfile(next);
  }

  return (
    <div className="page home-modern">
      <header className="home-modern-header">
        <div className="home-modern-identity">
          <span className="home-modern-avatar"><Icon name="user" size={28} strokeWidth={2.1} /></span>
          <div>
            <h1>{greeting}</h1>
            <span className="home-modern-level">{profile.currentLevel} → {profile.targetLevel}</span>
          </div>
        </div>
        <span className="home-modern-plan" title={isPro ? 'Ai acces la toate modulele aplicației' : 'Plan Free'}>
          <Icon name="star" size={18} strokeWidth={2.2} /> {planLabel}
        </span>
      </header>

      <div className="home-modern-metrics" aria-label="Rezumat progres">
        <MetricChip icon="zap" value={`${profile.xp} XP`} tone="gold" />
        <MetricChip icon="flame" value={`${profile.streak} zile`} tone="violet" />
        <MetricChip icon="calendar" value={`Ziua ${programDay}/${programDuration}`} tone="violet" />
        <MetricChip icon="target" value={`Scor ${score}`} tone="green" />
      </div>

      {!isPro ? (
        <HomeNotice
          icon="star"
          title="Deblochează toate modulele aplicației"
          detail="Plan Free · o sesiune zilnică de maximum 5 minute"
          tone="violet"
        />
      ) : null}

      {recentLevelChange ? (
        <HomeNotice
          icon="trending"
          title={`Nivel nou: ${recentLevelChange.to}`}
          detail="Tutorul, lecțiile, vocabularul și poveștile se adaptează automat la noul nivel"
          tone="green"
          onClick={() => navigate('/progress')}
        />
      ) : null}

      {programComplete ? (
        <HomeNotice
          icon="trophy"
          title={`Ai finalizat cele ${programDuration} de zile`}
          detail={`Continuă fără să pierzi progresul · extinde planul cu ${PROGRAM_EXTENSION_DAYS} de zile`}
          tone="violet"
          onClick={() => void extendProgram()}
        />
      ) : null}

      {loadError ? (
        <HomeNotice icon="triangleAlert" title="O parte din date nu s-a încărcat" detail={loadError} tone="red" onClick={load} />
      ) : null}

      {justAwarded.length > 0 ? (
        <HomeNotice
          icon="trophy"
          title="Misiuni îndeplinite"
          detail={justAwarded.map((mission) => `${mission.titleRo} (+${mission.xp} XP)`).join(' · ')}
          tone="green"
        />
      ) : null}

      {readyReports > 0 ? (
        <HomeNotice
          icon="chart"
          title={readyReports === 1 ? 'Raportul unei sesiuni este gata' : `${readyReports} rapoarte de sesiune sunt gata`}
          detail="Deschide Progres pentru recomandări"
          tone="violet"
          onClick={() => navigate('/progress')}
        />
      ) : null}

      {!preview && !hasOpenRouterKey() ? (
        <HomeNotice
          icon="triangleAlert"
          title="Tutorul este temporar indisponibil"
          detail="Încearcă din nou puțin mai târziu"
          tone="red"
        />
      ) : null}

      {!profile.testDone ? (
        <HomeNotice
          icon="graduation"
          title="Fă întâi testul de nivel"
          detail="10–15 min · nivel CEFR pe 5 competențe"
          tone="violet"
          onClick={() => navigate('/test')}
        />
      ) : null}

      <DailyPlanHero
        title={plan?.conversationScenarioTitle ?? 'Sesiunea de astăzi'}
        minutes={targetMinutes}
        sessionType={todayStructure.titleRo}
        onClick={() => navigate('/session')}
      />

      <SectionTitle>Scurtături</SectionTitle>
      <div className="home-modern-shortcuts">
        <Shortcut title="For You" icon="sparkles" pro={!isPro} onClick={() => navigate('/for-you')} />
        <Shortcut title="Învață 3 min" icon="clock" pro={!isPro} onClick={() => navigate('/learn')} />
        <Shortcut title="Sesiune rapidă" icon="zap" pro={!isPro} onClick={() => navigate('/quick')} />
        <Shortcut title="60 secunde" icon="mic" pro={!isPro} onClick={() => navigate('/voice-challenge')} />
        <Shortcut title="Povestea zilei" icon="book" pro={!isPro} onClick={() => navigate('/story')} />
        <Shortcut title="Boss Battle" icon="trophy" pro={!isPro} onClick={() => navigate('/boss')} />
        <Shortcut title="Vorbește" icon="message" pro={!isPro} onClick={() => navigate('/talk')} />
        <Shortcut title="Practică" icon="puzzle" pro={!isPro} onClick={() => navigate('/practice')} />
      </div>

      {dueOverview && dueOverview.total > 0 ? (
        <HomeNotice
          icon="save"
          title={`${dueOverview.total} ${dueOverview.total === 1 ? 'element este pe cale să fie uitat' : 'elemente sunt pe cale să fie uitate'}`}
          detail={`Recuperează-le în aproximativ ${Math.max(1, Math.ceil(dueOverview.estimatedSeconds / 60))} min`}
          tone="gold"
          onClick={() => navigate('/learn?mode=rescue')}
        />
      ) : null}

      <SectionTitle>Astăzi</SectionTitle>
      <div className="home-modern-today">
        <TodayStat icon="clock" value={minutesToday} label="min azi" />
        <TodayStat icon="chart" value={weekMinutes} label="min săptămâna aceasta" />
        <TodayStat icon="target" value={score} label="scor /100" />
      </div>

      <SectionTitle>Plan și progres</SectionTitle>
      <div className="home-modern-progress">
        <DetailRow title="De ce contează azi" icon="compass" tone="blue">
          {plan ? (
            <>
              <p className="muted home-modern-detail-copy">{plan.reasonRo}</p>
              <div className="chip-row home-modern-detail-chips">
                <span className="chip selected"><Icon name="book" size={15} /> {plan.grammarFocusLabel}</span>
                <span className="chip selected"><Icon name="audio" size={15} /> sunet: {plan.pronunciationFocus}</span>
                <span className="chip selected"><Icon name="message" size={15} /> {plan.conversationScenarioTitle}</span>
              </div>
            </>
          ) : <p className="tiny">Planul de azi se pregătește.</p>}
        </DetailRow>

        <DetailRow
          title="Greșeala principală"
          icon="triangleAlert"
          tone="orange"
          badge={topMistake ? CATEGORY_LABELS_RO[topMistake.category] : 'Niciuna'}
        >
          {topMistake ? (
            <button type="button" className="home-modern-mistake" onClick={() => navigate('/practice')}>
              <span className="home-modern-wrong">{mistakeDisplay(topMistake).wrong}</span>
              <strong className="home-modern-right">{mistakeDisplay(topMistake).right}</strong>
              <small>{CATEGORY_LABELS_RO[topMistake.category]} · de {topMistake.occurrenceCount} ori · {topMistake.explanationRo}</small>
            </button>
          ) : <p className="tiny">Nu ai nicio greșeală activă din ultimele 7 zile.</p>}
        </DetailRow>

        <DetailRow
          title={`${plan?.vocabularyFocus.length ?? 0} expresii de repetat`}
          icon="sparkles"
          tone="violet"
          badge={plan?.vocabularyFocus.length ?? 0}
        >
          {plan && plan.vocabularyFocus.length > 0 ? (
            <div className="chip-row home-modern-detail-chips">
              {plan.vocabularyFocus.map((word) => <span key={word} className="chip">{word}</span>)}
            </div>
          ) : <p className="tiny">Nu ai expresii scadente pentru repetare astăzi.</p>}
        </DetailRow>

        <DetailRow title="Misiunile zilei" icon="checkCircle" tone="green" badge={`${missionsDone}/${DAILY_MISSIONS.length}`}>
          {DAILY_MISSIONS.map((mission) => {
            const progress = Math.min(missions[mission.id] ?? 0, mission.target);
            const done = progress >= mission.target;
            return (
              <div key={mission.id} className={`home-modern-mission ${done ? 'done' : ''}`}>
                <Icon name={done ? 'checkCircle' : 'square'} size={18} />
                <span>{mission.titleRo}</span>
                <small>{progress}/{mission.target} · +{mission.xp} XP</small>
              </div>
            );
          })}
        </DetailRow>

        <SaveSituationRow preview={preview} />

        <DetailRow title="Obiectivul următor" icon="trending" tone="violet" badge={profile.targetLevel} last>
          <p className="home-modern-detail-copy"><strong>{profile.temporalObjective}</strong> · țintă: {profile.targetLevel}</p>
          {profile.recommendedPlanRo ? <p className="muted">{profile.recommendedPlanRo}</p> : null}
          <p className="tiny">{stage.goalsRo.join(' · ')}</p>
        </DetailRow>
      </div>
    </div>
  );
}

function HomeSkeleton({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error) {
    return (
      <div className="page home-modern">
        <div className="error-banner">Nu am putut încărca datele: {error}</div>
        <div className="btn-row"><button className="btn-primary" onClick={onRetry}>Reîncearcă</button></div>
      </div>
    );
  }
  return (
    <SkeletonGroup>
      <div className="home-modern-skeleton-head">
        <Skeleton width={54} height={54} radius={27} />
        <div><Skeleton width={128} height={25} /><Skeleton width={68} height={22} radius={9} style={{ marginTop: 7 }} /></div>
        <Skeleton width={62} height={36} radius={12} style={{ marginLeft: 'auto' }} />
      </div>
      <div className="home-modern-skeleton-metrics">{[0, 1, 2, 3].map((item) => <Skeleton key={item} height={38} radius={12} />)}</div>
      <Skeleton height={230} radius={25} style={{ marginTop: 16 }} />
      <Skeleton width={105} height={22} style={{ marginTop: 24 }} />
      <div className="home-modern-skeleton-shortcuts">{[0, 1, 2, 3, 4, 5, 6, 7].map((item) => <Skeleton key={item} height={82} radius={17} />)}</div>
    </SkeletonGroup>
  );
}

function MetricChip({ icon, value, tone }: { icon: IconName; value: string; tone: 'gold' | 'violet' | 'green' }) {
  return <span className={`home-modern-metric ${tone}`}><Icon name={icon} size={14} strokeWidth={2.4} /><strong>{value}</strong></span>;
}

function HomeNotice({ icon, title, detail, tone, onClick }: {
  icon: IconName;
  title: string;
  detail: string;
  tone: 'violet' | 'green' | 'gold' | 'red';
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="home-modern-notice-icon"><Icon name={icon} size={18} strokeWidth={2.2} /></span>
      <span className="home-modern-notice-copy"><strong>{title}</strong><small>{detail}</small></span>
      {onClick ? <Icon name="chevronDown" size={18} className="home-modern-notice-arrow" /> : null}
    </>
  );
  if (!onClick) return <div className={`home-modern-notice ${tone}`}>{content}</div>;
  return <button type="button" className={`home-modern-notice ${tone}`} onClick={onClick}>{content}</button>;
}

function DailyPlanHero({ title, minutes, sessionType, onClick }: { title: string; minutes: number; sessionType: string; onClick: () => void }) {
  return (
    <section className="home-modern-hero">
      <div className="home-modern-hero-copy">
        <span className="home-modern-eyebrow">PLANUL TĂU DE AZI</span>
        <h2>{title}</h2>
        <div className="home-modern-hero-meta">
          <Icon name="clock" size={20} strokeWidth={2.2} />
          <strong>{minutes} min</strong>
          <span>· {sessionType}</span>
        </div>
      </div>
      <span className="home-modern-hero-spark one"><Icon name="sparkles" size={18} /></span>
      <span className="home-modern-hero-spark two"><Icon name="sparkles" size={12} /></span>
      <span className="home-modern-hero-art"><Icon name="message" size={48} strokeWidth={1.7} /></span>
      <button type="button" className="home-modern-hero-button" onClick={onClick}>
        <Icon name="play" size={23} /> Începe sesiunea
      </button>
    </section>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="home-modern-section-title">{children}</h2>;
}

function Shortcut({ title, icon, pro, onClick }: { title: string; icon: IconName; pro?: boolean; onClick: () => void }) {
  return (
    <button type="button" className="home-modern-shortcut" onClick={onClick} aria-label={`${title}${pro ? ', funcție Pro' : ''}`}>
      {pro ? <small className="home-modern-pro-dot">PRO</small> : null}
      <Icon name={icon} size={28} strokeWidth={2.05} />
      <span>{title}</span>
    </button>
  );
}

function TodayStat({ icon, value, label }: { icon: IconName; value: number; label: string }) {
  return (
    <div className="home-modern-stat">
      <Icon name={icon} size={25} strokeWidth={2.2} />
      <span><strong>{value}</strong><small>{label}</small></span>
    </div>
  );
}

function DetailRow({ title, icon, tone, badge, children, last }: {
  title: string;
  icon: IconName;
  tone: 'blue' | 'orange' | 'violet' | 'green';
  badge?: ReactNode;
  children: ReactNode;
  last?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className={`home-modern-detail ${last ? 'last' : ''} ${open ? 'open' : ''}`}>
      <button type="button" className="home-modern-detail-head" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={`home-modern-detail-icon ${tone}`}><Icon name={icon} size={20} strokeWidth={2.2} /></span>
        <span className="home-modern-detail-title">{title}</span>
        {badge != null && badge !== '' ? <small className="home-modern-detail-badge">{badge}</small> : null}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={20} className="home-modern-detail-chevron" />
      </button>
      {open ? <div className="home-modern-detail-body">{children}</div> : null}
    </section>
  );
}

function SaveSituationRow({ preview }: { preview?: boolean }) {
  const [openForm, setOpenForm] = useState(false);
  const [text, setText] = useState('');
  const [pendingCount, setPendingCount] = useState(preview ? 1 : 0);
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    if (preview) return;
    getSituations().then((items) => setPendingCount(items.filter((item) => !item.used).length)).catch(() => {});
  }, [preview]);

  async function save() {
    if (!text.trim()) return;
    if (!preview) {
      try {
        await saveSituation({ id: newId(), text: text.trim(), createdAt: new Date().toISOString(), used: false });
      } catch (error: any) {
        setSavedMsg(`Nu s-a putut salva: ${String(error?.message ?? error)}`);
        return;
      }
    }
    setPendingCount((count) => count + 1);
    setText('');
    setOpenForm(false);
    setSavedMsg('Salvat — sesiunea de mâine va porni exact de la situația ta.');
  }

  return (
    <DetailRow title="Situație de exersat" icon="message" tone="blue" badge={pendingCount || undefined}>
      {savedMsg ? <div className="info-banner">{savedMsg}</div> : null}
      {!openForm ? (
        <>
          <p className="muted home-modern-detail-copy">
            Salvează o discuție dificilă sau o situație în care nu ți-au ieșit cuvintele.
            {pendingCount > 0 ? ` Ai ${pendingCount} în așteptare.` : ''}
          </p>
          <button type="button" onClick={() => { setOpenForm(true); setSavedMsg(''); }}>
            <Icon name="briefcase" /> Salvează situația pentru mâine
          </button>
        </>
      ) : (
        <>
          <textarea
            rows={3}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Ex: clientul a cerut o explicație despre incident și nu am știut cum să formulez impactul…"
          />
          <div className="btn-row">
            <button type="button" className="btn-primary" onClick={save} disabled={!text.trim()}>Salvează</button>
            <button type="button" className="btn-ghost" onClick={() => setOpenForm(false)}>Renunț</button>
          </div>
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
