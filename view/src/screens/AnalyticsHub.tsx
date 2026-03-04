import React, { useCallback, useRef, useState } from 'react';
import { NativeSyntheticEvent, View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import PagerView from 'react-native-pager-view';
import ScreenHeader from '../ui/ScreenHeader';
import { asLabelText } from '../domain/types';
import { analyticsUi, palette } from '../ui/theme';
import { useAppState } from '../state/appContext';
import {
  AnalyticsTabs,
  AnalyticsTabKey,
} from '../components/analytics/AnalyticsTabs';
import { AnalyticsDashboard } from './AnalyticsDashboard';
import AnalyticsWorkouts from './AnalyticsWorkouts';
import AnalyticsBreakdown from './AnalyticsBreakdown';
import AnalyticsExercises from './AnalyticsExercises';
import { AnalyticsDataProvider } from '../components/analytics/AnalyticsDataContext';

const ANALYTICS_TABS: AnalyticsTabKey[] = [
  'summary',
  'workouts',
  'breakdown',
  'exercises',
];

type PagerPageSelectedEvent = NativeSyntheticEvent<{ position: number }>;
type PagerPageScrollEvent = NativeSyntheticEvent<{
  position: number;
  offset: number;
}>;

const AnalyticsHub = () => {
  const { preferences } = useAppState();
  const [tab, setTab] = useState<AnalyticsTabKey>('summary');
  const nativePagerRef = useRef<PagerView | null>(null);
  const tabPressAnimatingRef = useRef(false);
  const tabIndex = Math.max(ANALYTICS_TABS.indexOf(tab), 0);
  const tabRequestedIndexRef = useRef(tabIndex);
  const tabScrollProgress = useSharedValue(tabIndex);

  const themeKey = `${preferences.themeMode}:${preferences.themeAccent}:${
    preferences.customAccentHex ?? ''
  }`;

  const handleTabSelect = useCallback(
    (nextTab: AnalyticsTabKey) => {
      if (nextTab === tab) return;
      const nextIndex = ANALYTICS_TABS.indexOf(nextTab);
      if (nextIndex < 0) return;
      const pager = nativePagerRef.current;
      if (!pager) return;
      tabPressAnimatingRef.current = true;
      tabRequestedIndexRef.current = nextIndex;
      tabScrollProgress.value = withTiming(nextIndex, {
        duration: analyticsUi.tabTapAnimationMs,
      });
      pager.setPage(nextIndex);
    },
    [tab, tabScrollProgress],
  );

  const handleNativePageSelected = useCallback(
    (event: PagerPageSelectedEvent) => {
      const position = event.nativeEvent.position;
      if (tabPressAnimatingRef.current && position !== tabRequestedIndexRef.current) {
        nativePagerRef.current?.setPage(tabRequestedIndexRef.current);
        return;
      }
      tabRequestedIndexRef.current = position;
      tabPressAnimatingRef.current = false;
      tabScrollProgress.value = position;
      const next = ANALYTICS_TABS[position];
      if (next && next !== tab) {
        setTab(next);
      }
    },
    [tab, tabScrollProgress],
  );

  const handleNativePageScroll = useCallback(
    (event: PagerPageScrollEvent) => {
      if (tabPressAnimatingRef.current) return;
      const { position, offset } = event.nativeEvent;
      tabScrollProgress.value = position + offset;
    },
    [tabScrollProgress],
  );

  const renderTab = useCallback(
    (key: AnalyticsTabKey) => {
      if (key === 'summary') {
        return (
          <AnalyticsDashboard
            embedded
            onOpenBreakdown={() => handleTabSelect('breakdown')}
          />
        );
      }
      if (key === 'workouts') return <AnalyticsWorkouts />;
      if (key === 'breakdown') return <AnalyticsBreakdown />;
      return <AnalyticsExercises />;
    },
    [handleTabSelect],
  );

  return (
    <View
      key={themeKey}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <ScreenHeader
        title={asLabelText('Insights')}
        subtitle={asLabelText('Training analytics')}
      />
      <AnalyticsTabs
        selected={tab}
        onSelect={handleTabSelect}
        scrollProgress={tabScrollProgress}
      />
      <AnalyticsDataProvider>
        <PagerView
          ref={(value: PagerView | null) => {
            nativePagerRef.current = value;
          }}
          style={{ flex: 1 }}
          initialPage={0}
          overdrag={false}
          onPageSelected={handleNativePageSelected}
          onPageScroll={handleNativePageScroll}
        >
          {ANALYTICS_TABS.map(tabKey => (
            <View key={tabKey} style={{ flex: 1 }}>
              {renderTab(tabKey)}
            </View>
          ))}
        </PagerView>
      </AnalyticsDataProvider>
    </View>
  );
};

export default AnalyticsHub;
