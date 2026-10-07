import ProFeatureGate from '../../components/ProFeatureGate';
import ForYou from '../../pages/ForYou';

export default function ForYouRoute() {
  return <ProFeatureGate feature="Feedul For You"><ForYou /></ProFeatureGate>;
}
