import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type UseMeasuredCardHeightArgs = {
  estimatedContentHeight: number;
  viewportBottomInset?: number;
  collapsed?: boolean;
  animated?: boolean;
  animationDurationMs?: number;
};

type UseMeasuredCardHeightResult = {
  heightStyle: StyleProp<ViewStyle>;
  scrollEnabled: boolean;
  viewportHeight: number;
  contentHeight: number;
  resolvedHeight: number;
  onViewportLayout: (event: LayoutChangeEvent) => void;
  onContentSizeChange: (width: number, height: number) => void;
};

export const useMeasuredCardHeight = ({
  estimatedContentHeight,
  viewportBottomInset = 0,
  collapsed = false,
  animated = false,
  animationDurationMs = 200,
}: UseMeasuredCardHeightArgs): UseMeasuredCardHeightResult => {
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const animatedHeight = useSharedValue(0);

  const measuredContentHeight =
    contentHeight > 0 ? contentHeight : Math.max(estimatedContentHeight, 0);
  const effectiveViewportHeight =
    viewportHeight > 0
      ? Math.max(0, viewportHeight - Math.max(0, viewportBottomInset))
      : 0;

  const resolvedHeight = useMemo(() => {
    if (collapsed) return 0;
    if (effectiveViewportHeight <= 0) return measuredContentHeight;
    return Math.min(measuredContentHeight, effectiveViewportHeight);
  }, [collapsed, effectiveViewportHeight, measuredContentHeight]);

  const scrollEnabled =
    !collapsed &&
    effectiveViewportHeight > 0 &&
    measuredContentHeight > effectiveViewportHeight;

  useEffect(() => {
    if (!animated) {
      animatedHeight.value = resolvedHeight;
      return;
    }
    animatedHeight.value = withTiming(resolvedHeight, {
      duration: animationDurationMs,
    });
  }, [animated, animatedHeight, animationDurationMs, resolvedHeight]);

  const animatedStyle = useAnimatedStyle(() => {
    if (animatedHeight.value <= 0) {
      return {};
    }
    return {
      height: animatedHeight.value,
    };
  });

  const staticStyle = useMemo<StyleProp<ViewStyle>>(() => {
    if (resolvedHeight <= 0) return {};
    return { height: resolvedHeight };
  }, [resolvedHeight]);

  const onViewportLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (nextHeight > 0) {
      setViewportHeight(prev =>
        Math.abs(prev - nextHeight) > 1 ? nextHeight : prev,
      );
    }
  }, []);

  const onContentSizeChange = useCallback((_width: number, height: number) => {
    if (height > 0) {
      setContentHeight(prev => (Math.abs(prev - height) > 1 ? height : prev));
    }
  }, []);

  return {
    heightStyle: animated
      ? (animatedStyle as unknown as StyleProp<ViewStyle>)
      : staticStyle,
    scrollEnabled,
    viewportHeight,
    contentHeight,
    resolvedHeight,
    onViewportLayout,
    onContentSizeChange,
  };
};
