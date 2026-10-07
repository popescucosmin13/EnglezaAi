import ProFeatureGate from '../../components/ProFeatureGate';
import Talk from '../../pages/Talk';

export default function TalkRoute() {
  return <ProFeatureGate feature="Conversațiile libere"><Talk /></ProFeatureGate>;
}
