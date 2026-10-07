import ProFeatureGate from '../components/ProFeatureGate';
import QuickSession from '../pages/QuickSession';

export default function QuickRoute() {
  return <ProFeatureGate feature="Sesiunea rapidă"><QuickSession /></ProFeatureGate>;
}
