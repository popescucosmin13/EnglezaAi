import { Icon } from './Icon';

export default function TutorSessionHeader({
  title,
  stepLabel,
  detail,
  timeLabel,
  currentStep,
  totalSteps,
  actionLabel,
  onAction,
  onBack,
  disabled,
}: {
  title: string;
  stepLabel?: string;
  detail?: string;
  timeLabel?: string;
  currentStep?: number;
  totalSteps?: number;
  actionLabel: string;
  onAction: () => void;
  onBack?: () => void;
  disabled?: boolean;
}) {
  const steps = totalSteps && currentStep
    ? Array.from({ length: totalSteps }, (_, index) => index + 1)
    : [];

  return (
    <header className="tutor-session-header">
      <div className="tutor-session-header-row">
        {onBack ? (
          <button type="button" className="tutor-back-button" onClick={onBack} aria-label="Înapoi">
            <Icon name="arrowLeft" size={22} strokeWidth={2.2} />
          </button>
        ) : null}

        <div className="tutor-session-title-block">
          <strong>{title}</strong>
          {stepLabel || detail ? <small>{[stepLabel, detail].filter(Boolean).join(' · ')}</small> : null}
        </div>

        {timeLabel ? <span className="tutor-session-time">{timeLabel}</span> : null}

        <button type="button" className="tutor-session-action" onClick={onAction} disabled={disabled}>
          {actionLabel}
        </button>
      </div>

      {steps.length ? (
        <div className="tutor-step-progress" aria-label={`Pasul ${currentStep} din ${totalSteps}`}>
          {steps.map((step, index) => {
            const complete = step < currentStep!;
            const active = step === currentStep;
            return (
              <div className="tutor-step-item" key={step}>
                {index > 0 ? <span className={`tutor-step-line ${step <= currentStep! ? 'complete' : ''}`} /> : null}
                <span className={`tutor-step-dot ${complete ? 'complete' : ''} ${active ? 'active' : ''}`}>
                  {complete ? <Icon name="check" size={13} strokeWidth={3} /> : step}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="tutor-single-rail"><span /></div>
      )}
    </header>
  );
}
