import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import PagerView from 'react-native-pager-view';
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
import { usePagerTabsController } from '../ui/pager/usePagerTabsController';

const ANALYTICS_TABS: AnalyticsTabKey[] = [
  'summary',
  'workouts',
  'breakdown',
  'exercises',
];

const createStyles = () => ({
  root: {
    flex: 1,
    backgroundColor: palette.background,
  },
  pager: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});

const AnalyticsHub = () => {
  const { preferences } = useAppState();
  const [tab, setTab] = useState<AnalyticsTabKey>('summary');
  const pagerController = usePagerTabsController({
    tabs: ANALYTICS_TABS,
    selectedTab: tab,
    onTabChange: setTab,
  });

  const themeKey = `${preferences.themeMode}:${preferences.themeAccent}:${
    preferences.customAccentHex ?? ''
  }`;
  const styles = createStyles();

  const renderTab = useCallback(
    (key: AnalyticsTabKey) => {
      if (key === 'summary') {
        return (
          <AnalyticsDashboard
            embedded
            onOpenBreakdown={() => pagerController.onTabPress('breakdown')}
          />
        );
      }
      if (key === 'workouts') return <AnalyticsWorkouts />;
      if (key === 'breakdown') return <AnalyticsBreakdown />;
      return <AnalyticsExercises />;
    },
    [pagerController],
  );

  return (
    <View key={themeKey} style={styles.root}>
      <ScreenHeader
        title={asLabelText('Insights')}
        subtitle={asLabelText('Training analytics')}
      />
      <AnalyticsTabs
        selected={tab}
        onSelect={pagerController.onTabPress}
        scrollProgress={pagerController.progress}
      />
      <AnalyticsDataProvider>
        <PagerView
          ref={pagerController.pagerRef}
          style={styles.pager}
          initialPage={pagerController.selectedIndex}
          overdrag={false}
          onPageSelected={pagerController.onPageSelected}
          onPageScroll={pagerController.onPageScroll}
          onPageScrollStateChanged={pagerController.onPageScrollStateChanged}
        >
          {ANALYTICS_TABS.map(tabKey => (
            <View key={tabKey} style={styles.page}>
              {renderTab(tabKey)}
            </View>
          ))}
        </PagerView>
      </AnalyticsDataProvider>
    </View>
  );
};

export default AnalyticsHub;
