import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { analyticsUi, palette, radius, spacing } from '../../ui/theme';
import { LabelText, asLabelText, unwrapLabelText } from '../../domain/types';

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

export const AnalyticsTabs = ({
  selected,
  onSelect,
}: {
  selected: AnalyticsTabKey;
  onSelect: (tab: AnalyticsTabKey) => void;
}) => (
  <View
    style={{
      marginHorizontal: spacing(2),
      marginTop: spacing(1.5),
      marginBottom: spacing(1.5),
      borderRadius: radius.pill,
      padding: analyticsUi.selectorRailPadding,
      backgroundColor: palette.surface,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
      flexDirection: 'row',
      gap: analyticsUi.selectorRailGap,
    }}
  >
    {(Object.keys(labels) as AnalyticsTabKey[]).map(key => {
      const active = key === selected;
      return (
        <TouchableOpacity
          key={key}
          onPress={() => onSelect(key)}
          accessibilityRole="tab"
          accessibilityState={{ selected: active }}
          accessibilityLabel={labels[key]}
          style={{
            flex: 1,
            alignItems: 'center',
            minHeight: analyticsUi.controlHeight,
            justifyContent: 'center',
            paddingVertical: analyticsUi.controlPaddingY,
            borderRadius: radius.pill,
            backgroundColor: active ? palette.primary : palette.mutedSurface,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '600',
              color: active ? palette.background : palette.mutedText,
            }}
          >
            {unwrapLabelText(labels[key])}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);
