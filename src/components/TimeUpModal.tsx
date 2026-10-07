// Popup afișat când timpul unui pas a expirat: utilizatorul alege dacă trece
// mai departe sau mai rămâne. Este afișat doar între replici, nu în mijlocul conversației.

import { Icon } from './Icon';

export default function TimeUpModal({
  stepTitle,
  nextLabel,
  allowStay = true,
  onStay,
  onNext,
}: {
  stepTitle: string;
  nextLabel?: string;
  allowStay?: boolean;
  onStay: () => void;
  onNext: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={allowStay ? onStay : onNext}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}><Icon name="clock" />Timpul pentru „{stepTitle}” s-a terminat</h3>
        <p className="muted">{allowStay ? 'Treci la pasul următor sau mai rămâi puțin aici?' : 'În planul Free, sesiunea continuă cu pasul următor.'}</p>
        <div className="btn-row">
          <button className="btn-primary" onClick={onNext}>{nextLabel ?? 'Pasul următor →'}</button>
          {allowStay ? <button className="btn-ghost" onClick={onStay}>Mai rămân aici</button> : null}
        </div>
      </div>
    </div>
  );
}
