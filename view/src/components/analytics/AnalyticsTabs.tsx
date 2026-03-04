import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, TouchableOpacity, View } from 'react-native';
import Animated, {
  interpolateColor,
  SharedValue,
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

const AnalyticsTabLabel = ({
  label,
  index,
  progress,
  inactiveTextColor,
  activeTextColor,
}: {
  label: string;
  index: number;
  progress: SharedValue<number>;
  inactiveTextColor: string;
  activeTextColor: string;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    // Start switching text color as soon as the active pill starts overlapping the next tab label.
    const distance = Math.abs(progress.value - index);
    const mix = Math.max(0, Math.min(1, 1 - distance / 0.6));
    return {
      color: interpolateColor(
        mix,
        [0, 1],
        [inactiveTextColor, activeTextColor],
      ) as string,
    };
  });

  return (
    <Animated.Text
      style={[
        {
          fontSize: 12,
          fontWeight: '600',
        },
        animatedStyle,
      ]}
    >
      {label}
    </Animated.Text>
  );
};

export const AnalyticsTabs = ({
  selected,
  onSelect,
  scrollProgress,
}: {
  selected: AnalyticsTabKey;
  onSelect: (tab: AnalyticsTabKey) => void;
  scrollProgress?: SharedValue<number>;
}) => {
  const tabs = Object.keys(labels) as AnalyticsTabKey[];
  const selectedIndex = Math.max(tabs.indexOf(selected), 0);
  const [railWidth, setRailWidth] = useState(0);
  const gap = analyticsUi.selectorRailGap;
  const railPadding = analyticsUi.selectorRailPadding;
  const segmentWidth = useMemo(() => {
    if (railWidth <= 0) return 0;
    const contentWidth = Math.max(0, railWidth - railPadding * 2);
    return (contentWidth - gap * (tabs.length - 1)) / tabs.length;
  }, [gap, railPadding, railWidth, tabs.length]);
  const fallbackProgress = useSharedValue(selectedIndex);

  React.useEffect(() => {
    if (scrollProgress) return;
    fallbackProgress.value = withTiming(selectedIndex, {
      duration: analyticsUi.tabTapAnimationMs,
    });
  }, [fallbackProgress, scrollProgress, selectedIndex]);

  const indicatorProgress = scrollProgress ?? fallbackProgress;
  const inactiveTextColor = palette.mutedText;
  const activeTextColor = getContrastTextColor(palette.primary);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorProgress.value * (segmentWidth + gap) }],
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
          const index = tabs.indexOf(key);
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
              <AnalyticsTabLabel
                label={unwrapLabelText(labels[key])}
                index={index}
                progress={indicatorProgress}
                inactiveTextColor={inactiveTextColor}
                activeTextColor={activeTextColor}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};
