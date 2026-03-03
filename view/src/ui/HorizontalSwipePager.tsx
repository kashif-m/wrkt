import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Dimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type SwipeDirection = -1 | 1;
type PageOffset = -1 | 0 | 1;

type Props = {
  currentKey: string | number;
  renderPage: (offset: PageOffset) => React.ReactNode;
  onCommit: (direction: SwipeDirection) => void;
  onReset?: () => void;
  resetKey?: number;
  edgeThreshold?: number;
  commitThreshold?: number;
  enabled?: boolean;
};

const HorizontalSwipePager = ({
  currentKey,
  renderPage,
  onCommit,
  onReset,
  resetKey,
  edgeThreshold = 24,
  commitThreshold = 0.25,
  enabled = true,
}: Props) => {
  const [width, setWidth] = useState(() => Dimensions.get('window').width);
  const widthSv = useSharedValue(0);
  const translateX = useSharedValue(0);
  const centerOffset = useSharedValue(0);
  const isAnimating = useSharedValue(false);
  const isDragging = useSharedValue(false);
  const ignoreGesture = useSharedValue(false);
  const pendingRecenter = useSharedValue(false);
  const lastResetKeyRef = useRef<number | null>(null);

  useEffect(() => {
    widthSv.value = width;
    centerOffset.value = width ? -width : 0;
    translateX.value = centerOffset.value;
  }, [width, widthSv]);

  useEffect(() => {
    runOnUI(() => {
      if (isAnimating.value || isDragging.value) {
        pendingRecenter.value = true;
        return;
      }
      translateX.value = centerOffset.value;
    })();
  }, [
    centerOffset,
    currentKey,
    isAnimating,
    isDragging,
    pendingRecenter,
    translateX,
  ]);

  useEffect(() => {
    if (resetKey === undefined) return;
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    const resetHandler = onReset;
    runOnUI(() => {
      const hasReset = Boolean(resetHandler);
      translateX.value = withTiming(
        centerOffset.value,
        { duration: 0 },
        finished => {
          if (finished && hasReset) {
            runOnJS(resetHandler!)();
          }
        },
      );
      isAnimating.value = false;
      pendingRecenter.value = false;
    })();
  }, [centerOffset, onReset, pendingRecenter, resetKey, translateX]);

  const onLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      const next = event.nativeEvent.layout.width;
      if (next > 0 && next !== width) {
        setWidth(next);
      }
    },
    [width],
  );

  const gestureEnabled = enabled && width > 0;

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(gestureEnabled)
        .activeOffsetX([-10, 10])
        .failOffsetY([-12, 12])
        .onBegin(event => {
          const viewWidth = widthSv.value;
          if (isAnimating.value || viewWidth <= 0) {
            ignoreGesture.value = true;
            return;
          }
          const startX =
            typeof event.absoluteX === 'number' ? event.absoluteX : event.x;
          ignoreGesture.value =
            startX <= edgeThreshold || startX >= viewWidth - edgeThreshold;
          if (!ignoreGesture.value) {
            isDragging.value = true;
          }
        })
        .onUpdate(event => {
          if (ignoreGesture.value || isAnimating.value) return;
          const viewWidth = widthSv.value;
          if (!viewWidth) return;
          const next = Math.max(
            centerOffset.value - viewWidth,
            Math.min(
              centerOffset.value + viewWidth,
              centerOffset.value + event.translationX,
            ),
          );
          translateX.value = next;
        })
        .onEnd(event => {
          if (ignoreGesture.value || isAnimating.value) {
            translateX.value = withTiming(centerOffset.value, {
              duration: 160,
            });
            return;
          }
          const viewWidth = widthSv.value;
          if (!viewWidth) {
            translateX.value = withTiming(centerOffset.value, {
              duration: 160,
            });
            return;
          }
          const threshold = viewWidth * commitThreshold;
          if (Math.abs(event.translationX) > threshold) {
            const direction: SwipeDirection = event.translationX > 0 ? -1 : 1;
            const target =
              direction === -1
                ? centerOffset.value + viewWidth
                : centerOffset.value - viewWidth;
            isAnimating.value = true;
            translateX.value = withTiming(
              target,
              { duration: 200 },
              finished => {
                if (finished) {
                  isAnimating.value = false;
                  runOnJS(onCommit)(direction);
                } else {
                  translateX.value = centerOffset.value;
                  isAnimating.value = false;
                }
              },
            );
            return;
          }
          translateX.value = withTiming(centerOffset.value, { duration: 180 });
        })
        .onFinalize(() => {
          isDragging.value = false;
          if (pendingRecenter.value && !isAnimating.value) {
            translateX.value = centerOffset.value;
            pendingRecenter.value = false;
          }
          ignoreGesture.value = false;
        }),
    [
      commitThreshold,
      edgeThreshold,
      gestureEnabled,
      ignoreGesture,
      isAnimating,
      isDragging,
      onCommit,
      pendingRecenter,
      translateX,
      widthSv,
    ],
  );

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <View style={pagerFrame} onLayout={onLayout}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            pagerTrack,
            trackStyle,
            {
              width: width * 3 || undefined,
            },
          ]}
        >
          <View style={[pagerPage, width ? { width } : null]}>
            {renderPage(-1)}
          </View>
          <View style={[pagerPage, width ? { width } : null]}>
            {renderPage(0)}
          </View>
          <View style={[pagerPage, width ? { width } : null]}>
            {renderPage(1)}
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const pagerFrame = {
  flex: 1,
};

const pagerTrack = {
  flex: 1,
  flexDirection: 'row' as const,
};

const pagerPage = {
  flex: 1,
};

export type { SwipeDirection, PageOffset };
export default HorizontalSwipePager;
