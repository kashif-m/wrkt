import React, { useMemo } from 'react';
import { SharedValue, useSharedValue } from 'react-native-reanimated';
import { spacing } from '../../ui/theme';
import { LabelText, asLabelText, unwrapLabelText } from '../../domain/types';
import PagerTabsRail, {
  PagerTabDefinition,
} from '../../ui/pager/PagerTabsRail';

export type AnalyticsTabKey =
  | 'summary'
  | 'workouts'
  | 'breakdown'
  | 'exercises';

const labels: Record<AnalyticsTabKey, LabelText> = {
  summary: asLabelText('Summary'),
  workouts: asLabelText('Workouts'),
  breakdown: asLabelText('Breakdown'),
  exercises: asLabelText('Exercises'),
};

const tabs: readonly PagerTabDefinition<AnalyticsTabKey>[] = (
  Object.keys(labels) as AnalyticsTabKey[]
).map(key => ({
  key,
  label: unwrapLabelText(labels[key]),
}));

export const AnalyticsTabs = ({
  selected,
  onSelect,
  scrollProgress,
}: {
  selected: AnalyticsTabKey;
  onSelect: (tab: AnalyticsTabKey) => void;
  scrollProgress?: SharedValue<number>;
}) => {
  const selectedIndex = Math.max(
    tabs.findIndex(tab => tab.key === selected),
    0,
  );
  const fallbackProgress = useSharedValue(selectedIndex);

  React.useEffect(() => {
    if (scrollProgress) return;
    fallbackProgress.value = selectedIndex;
  }, [fallbackProgress, scrollProgress, selectedIndex]);

  const indicatorProgress = scrollProgress ?? fallbackProgress;
  const containerStyle = useMemo(
    () => ({
      marginTop: spacing(1),
      marginBottom: spacing(1.5),
    }),
    [],
  );

  return (
    <PagerTabsRail
      tabs={tabs}
      activeKey={selected}
      progress={indicatorProgress}
      onSelect={onSelect}
      containerStyle={containerStyle}
    />
  );
};
