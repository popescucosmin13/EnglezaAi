import ProFeatureGate from '../components/ProFeatureGate';
import GrammarCourse from '../pages/GrammarCourse';

export default function GrammarRoute() {
  return <ProFeatureGate feature="Cursul complet de gramatică"><GrammarCourse /></ProFeatureGate>;
}
