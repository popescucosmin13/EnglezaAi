import ProFeatureGate from '../components/ProFeatureGate';
import DailyStory from '../pages/DailyStory';

export default function StoryRoute() {
  return <ProFeatureGate feature="Povestea zilei"><DailyStory /></ProFeatureGate>;
}
