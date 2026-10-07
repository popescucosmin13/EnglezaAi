import ProFeatureGate from '../components/ProFeatureGate';
import Microlearning from '../pages/Microlearning';

export default function LearnRoute() {
  return <ProFeatureGate feature="Microlearningul adaptiv"><Microlearning /></ProFeatureGate>;
}
