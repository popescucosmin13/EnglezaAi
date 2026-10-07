import ProFeatureGate from '../../components/ProFeatureGate';
import Practice from '../../pages/Practice';

export default function PracticeRoute() {
  return <ProFeatureGate feature="Centrul de practică"><Practice /></ProFeatureGate>;
}
