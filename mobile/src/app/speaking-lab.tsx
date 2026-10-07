import ProFeatureGate from '../components/ProFeatureGate';
import SpeakingLab from '../pages/SpeakingLab';

export default function SpeakingLabRoute() {
  return <ProFeatureGate feature="Speaking Lab"><SpeakingLab /></ProFeatureGate>;
}
