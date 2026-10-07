// Aceleași 6 secțiuni ca în bara de navigare web.

import { useEffect, type ComponentProps } from 'react';
import { Tabs } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '../../theme';
import { Icon, type IconName } from '../../components/Icon';
import { useRevenueCat } from '../../revenuecat/RevenueCatContext';
import { NavigationChromeProvider, useNavigationChrome } from '../../navigation/NavigationChromeContext';

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: 'index', title: 'Acasă', icon: 'home' },
  { name: 'talk', title: 'Vorbește', icon: 'mic' },
  { name: 'for-you', title: 'For You', icon: 'sparkles' },
  { name: 'practice', title: 'Practică', icon: 'puzzle' },
  { name: 'progress', title: 'Progres', icon: 'trending' },
  { name: 'settings', title: 'Setări', icon: 'settings' },
];

type IosChromeProps = {
  progress: SharedValue<number>;
};

type TabBarRendererProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const PRO_TABS = new Set(['talk', 'for-you', 'practice', 'progress']);

function IosTabLabel({ title, color, progress }: IosChromeProps & { title: string; color: string }) {
  const animatedStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [12, 0]),
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [0, 4]) }],
  }));

  return (
    <Animated.Text
      numberOfLines={1}
      style={[styles.iosTabLabel, { color }, animatedStyle]}
    >
      {title}
    </Animated.Text>
  );
}

function IosTabIcon({ name, color, progress }: IosChromeProps & { name: IconName; color: string }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 1.08]) }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Icon name={name} size={22} strokeWidth={2.2} color={color} />
    </Animated.View>
  );
}

function IosFloatingTabBar({
  state,
  navigation,
  progress,
  compact,
  hidden,
  bottomInset,
  isPro,
  onReset,
}: Pick<TabBarRendererProps, 'state' | 'navigation'> & IosChromeProps & {
  compact: boolean;
  hidden: boolean;
  bottomInset: number;
  isPro: boolean;
  onReset: () => void;
}) {
  const p = usePalette();
  const { width: screenWidth } = useWindowDimensions();
  const expandedWidth = screenWidth - 16;
  const compactWidth = Math.min(320, screenWidth - 32);
  const expandedHeight = 64;
  const compactHeight = 54;
  const slotHeight = expandedHeight + bottomInset + 16;
  const islandAnimatedStyle = useAnimatedStyle(() => ({
    width: interpolate(progress.value, [0, 1], [expandedWidth, compactWidth]),
    height: interpolate(progress.value, [0, 1], [expandedHeight, compactHeight]),
    bottom: bottomInset + 8,
    paddingTop: interpolate(progress.value, [0, 1], [5, 0]),
    borderRadius: interpolate(progress.value, [0, 1], [30, 27]),
    shadowOpacity: interpolate(progress.value, [0, 1], [0.14, 0.22]),
    shadowRadius: interpolate(progress.value, [0, 1], [9, 15]),
  }));

  if (hidden) return null;

  return (
    <View pointerEvents="box-none" style={[styles.iosBarSlot, { height: slotHeight }]}> 
      <Animated.View
        style={[
          styles.iosIsland,
          islandAnimatedStyle,
          {
            backgroundColor: p.navBg,
            borderColor: p.border,
            shadowColor: '#0f1123',
          },
        ]}
      >
        {state.routes.map((route, index) => {
          const tab = TABS.find((item) => item.name === route.name);
          if (!tab) return null;
          const focused = state.index === index;
          const color = focused ? p.primary : p.muted;
          const showProBadge = !isPro && PRO_TABS.has(route.name);

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            onReset();
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={`${tab.title}, filă ${index + 1} din ${state.routes.length}`}
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => [
                styles.iosTabItem,
                focused && {
                  backgroundColor: p.primarySoft,
                  borderRadius: 16,
                  marginVertical: compact ? 6 : 4,
                },
                pressed && { opacity: 0.72 },
              ]}
            >
              <View style={styles.iosIconContainer}>
                <IosTabIcon name={tab.icon} color={color} progress={progress} />
                {showProBadge ? (
                  <View style={[styles.iosProBadge, { backgroundColor: p.primary }]}>
                    <Text style={styles.iosProBadgeText}>PRO</Text>
                  </View>
                ) : null}
              </View>
              <IosTabLabel title={tab.title} color={color} progress={progress} />
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

export default function TabsLayout() {
  return <NavigationChromeProvider><ResponsiveTabs /></NavigationChromeProvider>;
}

function ResponsiveTabs() {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const { isPro } = useRevenueCat();
  const { compact, hidden, reset } = useNavigationChrome();
  const bottomInset = Math.max(insets.bottom, 6);
  const isIos = Platform.OS === 'ios';
  const iosCompactProgress = useSharedValue(compact ? 1 : 0);

  useEffect(() => {
    if (!isIos) return;
    iosCompactProgress.value = withTiming(compact ? 1 : 0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
  }, [compact, iosCompactProgress, isIos]);

  return (
    <Tabs
      tabBar={isIos
        ? (props) => (
            <IosFloatingTabBar
              state={props.state}
              navigation={props.navigation}
              progress={iosCompactProgress}
              compact={compact}
              hidden={hidden}
              bottomInset={bottomInset}
              isPro={isPro}
              onReset={reset}
            />
          )
        : undefined}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: p.primary,
        tabBarInactiveTintColor: p.muted,
        tabBarActiveBackgroundColor: p.primarySoft,
        tabBarShowLabel: !compact,
        tabBarItemStyle: {
          borderRadius: 16,
          marginVertical: 2,
          overflow: 'hidden',
        },
        tabBarStyle: hidden
          ? { display: 'none' }
          : {
              position: 'absolute',
              left: compact ? 26 : 8,
              right: compact ? 26 : 8,
              bottom: bottomInset + 8,
              backgroundColor: p.navBg,
              borderColor: p.border,
              borderTopColor: p.border,
              borderWidth: StyleSheet.hairlineWidth,
              height: compact ? 54 : 64,
              paddingTop: compact ? 2 : 5,
              paddingBottom: compact ? 2 : 5,
              borderRadius: compact ? 27 : 30,
              overflow: 'hidden',
              elevation: 12,
              shadowColor: '#0f1123',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: compact ? 0.22 : 0.14,
              shadowRadius: compact ? 14 : 9,
            },
        tabBarLabelStyle: { fontSize: 9.5, fontWeight: '700' },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color }) => <Icon name={t.icon} size={compact ? 24 : 22} strokeWidth={2.2} color={String(color)} />,
            tabBarBadge: !isPro && ['talk', 'for-you', 'practice', 'progress'].includes(t.name) ? 'PRO' : undefined,
            tabBarBadgeStyle: { fontSize: 7, minWidth: 25, height: 14, lineHeight: 14, backgroundColor: p.primary },
          }}
          listeners={{ tabPress: reset }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iosBarSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  iosIsland: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    shadowOffset: { width: 0, height: 5 },
    elevation: 10,
  },
  iosTabItem: {
    flex: 1,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  iosTabLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 12,
    overflow: 'hidden',
  },
  iosIconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosProBadge: {
    position: 'absolute',
    top: -6,
    right: -18,
    minWidth: 25,
    height: 14,
    paddingHorizontal: 3,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iosProBadgeText: {
    color: '#ffffff',
    fontSize: 7,
    lineHeight: 9,
    fontWeight: '900',
  },
});
