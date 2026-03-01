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
        <View style={{ flex: 1 }}>
          {tab === 'summary' ? (
            <AnalyticsDashboard
              embedded
              onOpenBreakdown={() => setTab('breakdown')}
            />
          ) : null}
          {tab === 'workouts' ? <AnalyticsWorkouts /> : null}
          {tab === 'breakdown' ? <AnalyticsBreakdown /> : null}
          {tab === 'exercises' ? <AnalyticsExercises /> : null}
        </View>
      </AnalyticsDataProvider>
    </View>
  );
};

export default AnalyticsHub;
