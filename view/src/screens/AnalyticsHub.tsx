import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import ScreenHeader from '../ui/ScreenHeader';
import { asLabelText } from '../domain/types';
import { palette } from '../ui/theme';
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
import HorizontalSwipePager, { SwipeDirection } from '../ui/HorizontalSwipePager';

const ANALYTICS_TABS: AnalyticsTabKey[] = [
  'summary',
  'workouts',
  'breakdown',
  'exercises',
];

const AnalyticsHub = () => {
  const { preferences } = useAppState();
  const [tab, setTab] = useState<AnalyticsTabKey>('summary');
  const [, setFocusTick] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setFocusTick(value => value + 1);
    }, []),
  );

  const themeKey = `${preferences.themeMode}:${preferences.themeAccent}:${
    preferences.customAccentHex ?? ''
  }`;

  const tabIndex = ANALYTICS_TABS.indexOf(tab);

  const resolveTabAtOffset = (offset: -1 | 0 | 1): AnalyticsTabKey | null => {
    const index = tabIndex + offset;
    if (index < 0 || index >= ANALYTICS_TABS.length) return null;
    return ANALYTICS_TABS[index];
  };

  const handleSwipeCommit = (direction: SwipeDirection) => {
    const nextIndex = Math.max(
      0,
      Math.min(ANALYTICS_TABS.length - 1, tabIndex + direction),
    );
    setTab(ANALYTICS_TABS[nextIndex]);
  };

  const renderTab = (key: AnalyticsTabKey) => {
    if (key === 'summary') {
      return <AnalyticsDashboard embedded onOpenBreakdown={() => setTab('breakdown')} />;
    }
    if (key === 'workouts') return <AnalyticsWorkouts />;
    if (key === 'breakdown') return <AnalyticsBreakdown />;
    return <AnalyticsExercises />;
  };

  return (
    <View
      key={themeKey}
      style={{ flex: 1, backgroundColor: palette.background }}
    >
      <ScreenHeader
        title={asLabelText('Insights')}
        subtitle={asLabelText('Training analytics')}
      />
      <AnalyticsTabs selected={tab} onSelect={setTab} />
      <AnalyticsDataProvider>
        <HorizontalSwipePager
          currentKey={tab}
          onCommit={handleSwipeCommit}
          edgeThreshold={24}
          commitThreshold={0.2}
          renderPage={offset => {
            const pageTab = resolveTabAtOffset(offset);
            if (!pageTab) {
              return <View style={{ flex: 1 }}>{renderTab(tab)}</View>;
            }
            return <View style={{ flex: 1 }}>{renderTab(pageTab)}</View>;
          }}
        />
      </AnalyticsDataProvider>
    </View>
  );
};

export default AnalyticsHub;
