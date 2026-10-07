import ProFeatureGate from '../../components/ProFeatureGate';
import Progress from '../../pages/Progress';

export default function ProgressRoute() {
  return <ProFeatureGate feature="Progresul complet"><Progress /></ProFeatureGate>;
}
