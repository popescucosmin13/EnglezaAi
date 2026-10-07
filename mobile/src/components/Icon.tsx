// Iconițe lucide — portat de pe web (lucide-react → lucide-react-native).
// Culoarea implicită vine din tema curentă; se poate suprascrie cu prop-ul color.

import { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  AudioLines,
  Ban,
  Bell,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Car,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleHelp,
  CircleX,
  ClipboardList,
  Clock3,
  Compass,
  Ear,
  Flame,
  FlaskConical,
  Globe2,
  GraduationCap,
  Handshake,
  Headphones,
  Hotel,
  House,
  Landmark,
  Languages,
  Laptop,
  Lightbulb,
  LoaderCircle,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  Mic,
  MonitorCog,
  Music2,
  PartyPopper,
  Pill,
  Plane,
  Play,
  Presentation,
  Puzzle,
  Repeat2,
  Rocket,
  RotateCcw,
  Save,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  Stethoscope,
  Store,
  Target,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Type,
  Undo2,
  UserRound,
  Utensils,
  Volume2,
  Wrench,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { usePalette } from '../theme';

const ICONS = {
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  arrowDown: ArrowDownToLine,
  arrowUp: ArrowUpFromLine,
  arrowUpRight: ArrowUpRight,
  audio: AudioLines,
  ban: Ban,
  bell: Bell,
  bank: Landmark,
  barChart: BarChart3,
  book: BookOpen,
  briefcase: BriefcaseBusiness,
  building: Building2,
  calendar: CalendarDays,
  car: Car,
  chart: ChartColumn,
  check: Check,
  checkCircle: CircleCheck,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  clipboard: ClipboardList,
  clock: Clock3,
  compass: Compass,
  ear: Ear,
  flame: Flame,
  flask: FlaskConical,
  globe: Globe2,
  graduation: GraduationCap,
  handshake: Handshake,
  headphones: Headphones,
  help: CircleHelp,
  home: House,
  hotel: Hotel,
  languages: Languages,
  laptop: Laptop,
  lightbulb: Lightbulb,
  loader: LoaderCircle,
  logout: LogOut,
  mapPin: MapPin,
  megaphone: Megaphone,
  message: MessageCircle,
  mic: Mic,
  monitorCog: MonitorCog,
  music: Music2,
  party: PartyPopper,
  pharmacy: Pill,
  plane: Plane,
  play: Play,
  presentation: Presentation,
  puzzle: Puzzle,
  repeat: Repeat2,
  rocket: Rocket,
  rotate: RotateCcw,
  save: Save,
  search: Search,
  settings: Settings,
  shield: Shield,
  shieldCheck: ShieldCheck,
  shopping: ShoppingBag,
  sliders: SlidersHorizontal,
  sparkles: Sparkles,
  square: Square,
  star: Star,
  stethoscope: Stethoscope,
  stop: Square,
  store: Store,
  target: Target,
  trash: Trash2,
  trending: TrendingUp,
  triangleAlert: TriangleAlert,
  trophy: Trophy,
  type: Type,
  undo: Undo2,
  user: UserRound,
  utensils: Utensils,
  volume: Volume2,
  wrench: Wrench,
  x: X,
  xCircle: CircleX,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
  /** Echivalentul .icon-spin de pe web (folosit la loader). */
  spin?: boolean;
}

export function Icon({ name, size = 18, strokeWidth = 2, color, style, spin }: IconProps) {
  const p = usePalette();
  const Component = ICONS[name];
  const el = <Component size={size} strokeWidth={strokeWidth} color={color ?? p.ink} style={spin ? undefined : style} />;
  if (!spin) return el;
  return <Spin style={style}>{el}</Spin>;
}

function Spin({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [rot]);
  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[{ transform: [{ rotate }] }, style]}>{children}</Animated.View>;
}
