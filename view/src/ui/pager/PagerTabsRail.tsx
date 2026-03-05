import React, { useMemo, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleProp,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Animated, {
  interpolateColor,
  SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  analyticsUi,
  getContrastTextColor,
  palette,
  radius,
  spacing,
} from '../theme';

export type PagerTabDefinition<T extends string> = {
  key: T;
  label: string;
};

type PagerTabsRailProps<T extends string> = {
  tabs: readonly PagerTabDefinition<T>[];
  activeKey: T;
  progress: SharedValue<number>;
  onSelect: (key: T) => void;
  containerStyle?: StyleProp<ViewStyle>;
  railStyle?: StyleProp<ViewStyle>;
  tabStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

const PagerTabLabel = ({
  label,
  index,
  progress,
  inactiveTextColor,
  activeTextColor,
  labelStyle,
}: {
  label: string;
  index: number;
  progress: SharedValue<number>;
  inactiveTextColor: string;
  activeTextColor: string;
  labelStyle?: StyleProp<TextStyle>;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
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
    <Animated.Text style={[baseLabelStyle, labelStyle, animatedStyle]}>
      {label}
    </Animated.Text>
  );
};

const PagerTabsRail = <T extends string>({
  tabs,
  activeKey,
  progress,
  onSelect,
  containerStyle,
  railStyle,
  tabStyle,
  labelStyle,
}: PagerTabsRailProps<T>) => {
  const styles = createStyles();
  const [railWidth, setRailWidth] = useState(0);
  const segmentWidth = useMemo(() => {
    if (railWidth <= 0 || tabs.length === 0) return 0;
    const contentWidth = Math.max(
      0,
      railWidth - analyticsUi.selectorRailPadding * 2,
    );
    return (
      (contentWidth - analyticsUi.selectorRailGap * (tabs.length - 1)) /
      tabs.length
    );
  }, [railWidth, tabs.length]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          progress.value * (segmentWidth + analyticsUi.selectorRailGap),
      },
    ],
  }));

  const handleLayout = (event: LayoutChangeEvent) => {
    const nextWidth = event.nativeEvent.layout.width;
    if (nextWidth > 0 && nextWidth !== railWidth) {
      setRailWidth(nextWidth);
    }
  };

  const indicatorWidthStyle = useMemo(
    () => ({ width: segmentWidth }),
    [segmentWidth],
  );
  const inactiveTextColor = palette.mutedText;
  const activeTextColor = getContrastTextColor(palette.primary);

  return (
    <View style={[styles.container, containerStyle]}>
      <View onLayout={handleLayout} style={[styles.rail, railStyle]}>
        {segmentWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.indicator, indicatorWidthStyle, indicatorStyle]}
          />
        ) : null}
        {tabs.map((tab, index) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => onSelect(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeKey === tab.key }}
            style={[styles.tab, tabStyle]}
          >
            <PagerTabLabel
              label={tab.label}
              index={index}
              progress={progress}
              inactiveTextColor={inactiveTextColor}
              activeTextColor={activeTextColor}
              labelStyle={labelStyle}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const createStyles = () => ({
  container: {
    paddingHorizontal: spacing(2),
    marginTop: spacing(0.75),
    marginBottom: spacing(1.25),
  },
  rail: {
    borderRadius: radius.pill,
    backgroundColor: palette.mutedSurface,
    padding: analyticsUi.selectorRailPadding,
    flexDirection: 'row' as const,
    overflow: 'hidden' as const,
    gap: analyticsUi.selectorRailGap,
  },
  indicator: {
    position: 'absolute' as const,
    left: analyticsUi.selectorRailPadding,
    top: analyticsUi.selectorRailPadding,
    bottom: analyticsUi.selectorRailPadding,
    borderRadius: radius.pill,
    backgroundColor: palette.primary,
  },
  tab: {
    flex: 1,
    minHeight: analyticsUi.controlHeight,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: analyticsUi.controlPaddingY,
  },
});

const baseLabelStyle = {
  fontSize: 12,
  fontWeight: '600' as const,
};

export default PagerTabsRail;
