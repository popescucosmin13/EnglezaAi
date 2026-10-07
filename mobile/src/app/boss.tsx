import ProFeatureGate from '../components/ProFeatureGate';
import Microlearning from '../pages/Microlearning';
export default function BossRoute() {
  return <ProFeatureGate feature="Boss Battle"><Microlearning defaultMode="boss" /></ProFeatureGate>;
}
