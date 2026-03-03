import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  analyticsUi,
  getContrastTextColor,
  palette,
  radius,
  spacing,
} from '../../ui/theme';
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
}) => {
  const tabs = Object.keys(labels) as AnalyticsTabKey[];
  const selectedIndex = Math.max(tabs.indexOf(selected), 0);
  const [railWidth, setRailWidth] = useState(0);
  const gap = analyticsUi.selectorRailGap;
  const segmentWidth = useMemo(() => {
    if (railWidth <= 0) return 0;
    return (railWidth - gap * (tabs.length - 1)) / tabs.length;
  }, [gap, railWidth, tabs.length]);
  const indicatorX = useSharedValue(0);

  React.useEffect(() => {
    if (segmentWidth <= 0) return;
    const nextX = selectedIndex * (segmentWidth + gap);
    indicatorX.value = withTiming(nextX, { duration: 180 });
  }, [gap, indicatorX, segmentWidth, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  const onRailLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next > 0 && next !== railWidth) {
      setRailWidth(next);
    }
  };

  return (
    <View
      style={{
        marginHorizontal: spacing(2),
        marginTop: spacing(1),
        marginBottom: spacing(1.5),
      }}
    >
      <View
        onLayout={onRailLayout}
        style={{
          borderRadius: radius.pill,
          padding: analyticsUi.selectorRailPadding,
          backgroundColor: palette.mutedSurface,
          flexDirection: 'row',
          gap,
          overflow: 'hidden',
        }}
      >
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: analyticsUi.selectorRailPadding,
                top: analyticsUi.selectorRailPadding,
                bottom: analyticsUi.selectorRailPadding,
                width: segmentWidth,
                borderRadius: radius.pill,
                backgroundColor: palette.primary,
              },
              indicatorStyle,
            ]}
          />
        ) : null}
        {tabs.map(key => {
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
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: active
                    ? getContrastTextColor(palette.primary)
                    : palette.mutedText,
                }}
              >
                {unwrapLabelText(labels[key])}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};
