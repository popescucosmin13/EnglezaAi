import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAccess } from '../access/AccessContext';
import { Icon } from './Icon';

export default function ProFeatureGate({ children, feature }: { children: ReactNode; feature: string }) {
  const access = useAccess();
  if (access.loading && !access.info) {
    return <div className="page"><p><span className="spinner" /> Se verifică planul contului…</p></div>;
  }
  if (access.isPro) return <>{children}</>;
  return (
    <div className="page">
      <div className="card" style={{ textAlign: 'center', padding: 28 }}>
        <Icon name="star" size={36} />
        <h1>{feature} este disponibil în Pro</h1>
        <p>Planul Free include testul inițial și o singură sesiune zilnică de maximum 5 minute.</p>
        <p className="tiny">Activează trial-ul sau abonamentul Pro din aplicația mobilă.</p>
        {access.error ? <div className="error-banner">{access.error}</div> : null}
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Link className="btn btn-primary" to="/">Înapoi la Free</Link>
          <button onClick={() => void access.refresh()}>Verifică din nou</button>
        </div>
      </div>
    </div>
  );
}
