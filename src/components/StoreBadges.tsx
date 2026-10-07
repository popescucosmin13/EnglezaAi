import { APP_STORES } from '../config/stores';
import './StoreBadges.css';

export default function StoreBadges() {
  return (
    <div className="store-badges" aria-label="Descarcă EnglezaAI pe telefon">
      <a
        className="store-badge store-badge-apple"
        href={APP_STORES.apple}
        aria-label="Descarcă EnglezaAI din App Store pentru iPhone"
      >
        <img src="/store-badges/app-store-ro.svg" alt="Descarcă din App Store" width="144" height="48" />
      </a>
      <a
        className="store-badge store-badge-google"
        href={APP_STORES.google}
        aria-label="Descarcă EnglezaAI din Google Play pentru Android"
      >
        <img src="/store-badges/google-play-ro.png" alt="Disponibil pe Google Play" width="186" height="72" />
      </a>
    </div>
  );
}
