import ProFeatureGate from '../components/ProFeatureGate';
import VoiceChallenge from '../pages/VoiceChallenge';

export default function VoiceChallengeRoute() {
  return <ProFeatureGate feature="Provocarea de 60 de secunde"><VoiceChallenge /></ProFeatureGate>;
}
