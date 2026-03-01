import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Canvas,
  Circle,
  Line,
  Path,
  Skia,
  Text as SkiaText,
  matchFont,
} from '@shopify/react-native-skia';
import {
  Platform,
  Text,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from 'react-native';
import { palette, spacing } from '../../ui/theme';
import { AnalyticsRangeKey } from './analyticsRanges';

export type TrendPoint = {
  label: string;
  count: number;
  bucket: number;
  value?: number;
  volume?: number;
};

interface SkiaTrendChartProps {
  data: TrendPoint[];
  height?: number;
  unit?: string;
  showTooltip?: boolean;
  rangeKey?: AnalyticsRangeKey;
  countLabel?: string;
  onInteractionLockChange?: (locked: boolean) => void;
}

const LEFT_MARGIN = 50; // More space for full numbers
const UNIT_MARGIN = 48;
const BOTTOM_MARGIN = 24;
const TOP_PADDING = 16;
const MAX_TAP_INTERVAL_MS = 260;
const DOUBLE_TAP_DISTANCE = 18;
const MIN_VISIBLE_POINTS = 4;

/**
 * Format volume for display with proper units.
 * Shows full numbers with comma separators for readability.
 */
const formatVolume = (value: number, unit?: string): string => {
  if (value === 0) return '0';

  // Use comma separator for thousands
  const formatted =
    value >= 1000
      ? Math.round(value).toLocaleString('en-US')
      : Math.round(value).toString();

  return unit ? `${formatted}` : formatted;
};

const getPointValue = (point: TrendPoint): number =>
  typeof point.value === 'number' ? point.value : point.volume ?? 0;

export const SkiaTrendChart: React.FC<SkiaTrendChartProps> = ({
  data,
  height = 200,
  unit = 'kg',
  showTooltip = false,
  rangeKey,
  countLabel = 'entry',
  onInteractionLockChange,
}) => {
  const { width: windowWidth } = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const resolvedWidth = containerWidth > 0 ? containerWidth : windowWidth;
  const rightMargin = unit ? UNIT_MARGIN : spacing(1.5);
  const GRAPH_WIDTH = Math.max(40, resolvedWidth - LEFT_MARGIN - rightMargin);
  const GRAPH_HEIGHT = height - BOTTOM_MARGIN - TOP_PADDING;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const maxIndex = Math.max(0, data.length - 1);
  const minSpan = useMemo(
    () =>
      Math.max(
        1,
        Math.min(maxIndex, data.length > 1 ? MIN_VISIBLE_POINTS - 1 : 1),
      ),
    [data.length, maxIndex],
  );
  const [visibleDomain, setVisibleDomain] = useState<{
    start: number;
    end: number;
  }>({
    start: 0,
    end: maxIndex,
  });
  const gestureRef = useRef<{
    mode: 'none' | 'scrub' | 'pinch';
    startDistance: number;
    startDomain: { start: number; end: number };
    anchorIndex: number;
  }>({
    mode: 'none',
    startDistance: 0,
    startDomain: { start: 0, end: 0 },
    anchorIndex: 0,
  });
  const lastTapRef = useRef<{ time: number; x: number; y: number }>({
    time: 0,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    setVisibleDomain({ start: 0, end: maxIndex });
    setSelectedIndex(null);
  }, [maxIndex]);

  useEffect(() => {
    return () => {
      onInteractionLockChange?.(false);
    };
  }, [onInteractionLockChange]);

  const clampedDomain = useMemo(() => {
    const endBound = Math.max(0, maxIndex);
    const start = clamp(visibleDomain.start, 0, endBound);
    const end = clamp(
      Math.max(start + minSpan, visibleDomain.end),
      start + minSpan,
      Math.max(start + minSpan, endBound),
    );
    const overflow = Math.max(0, end - endBound);
    const adjustedStart = clamp(start - overflow, 0, endBound);
    return {
      start: adjustedStart,
      end: clamp(
        adjustedStart + (end - start),
        adjustedStart + minSpan,
        Math.max(adjustedStart + minSpan, endBound),
      ),
    };
  }, [maxIndex, minSpan, visibleDomain.end, visibleDomain.start]);

  const { path, fillPath, yLabels, xLabels, points } = useMemo(() => {
    const skPath = Skia.Path.Make();
    const visibleStart = Math.max(0, Math.floor(clampedDomain.start));
    const visibleEnd = Math.min(maxIndex, Math.ceil(clampedDomain.end));
    const visiblePoints = data
      .map((point, index) => ({ point, index }))
      .filter(item => item.index >= visibleStart && item.index <= visibleEnd);

    let max = 0;
    visiblePoints.forEach(({ point }) => {
      const value = getPointValue(point);
      if (value > max) max = value;
    });

    max = Math.max(max * 1.1, 1);

    const normalizeX = (index: number) => {
      const span = Math.max(1, clampedDomain.end - clampedDomain.start);
      return LEFT_MARGIN + ((index - clampedDomain.start) / span) * GRAPH_WIDTH;
    };

    const normalizeY = (val: number) => {
      const ratio = val / max;
      return GRAPH_HEIGHT - ratio * GRAPH_HEIGHT + TOP_PADDING;
    };

    const pointData = visiblePoints.map(({ point, index }) => {
      const value = getPointValue(point);
      return {
        index,
        x: normalizeX(index),
        y: normalizeY(value),
        value,
        label: point.label,
        count: getPointCount(point),
      };
    });

    if (pointData.length >= 1) {
      skPath.moveTo(pointData[0].x, pointData[0].y);
    }

    for (let i = 1; i < pointData.length; i++) {
      const prev = pointData[i - 1];
      const curr = pointData[i];

      const cp1x = prev.x + (curr.x - prev.x) / 2;
      const cp1y = prev.y;
      const cp2x = prev.x + (curr.x - prev.x) / 2;
      const cp2y = curr.y;

      skPath.cubicTo(cp1x, cp1y, cp2x, cp2y, curr.x, curr.y);
    }

    const fill = skPath.copy();
    fill.lineTo(LEFT_MARGIN + GRAPH_WIDTH, GRAPH_HEIGHT + TOP_PADDING);
    fill.lineTo(LEFT_MARGIN, GRAPH_HEIGHT + TOP_PADDING);
    fill.close();

    const yLabelData = [
      { value: max, y: TOP_PADDING + 6 },
      { value: max / 2, y: GRAPH_HEIGHT / 2 + TOP_PADDING },
      { value: 0, y: GRAPH_HEIGHT + TOP_PADDING },
    ];

    const xLabelData: Array<{ label: string; x: number }> = [];
    if (pointData.length > 0) {
      const indices = buildXTickIndices(
        pointData.length,
        rangeKey,
        GRAPH_WIDTH,
      );
      indices.forEach(idx => {
        if (!pointData[idx]) return;
        xLabelData.push({
          label: pointData[idx].label || `P${idx + 1}`,
          x: pointData[idx].x,
        });
      });
    }

    return {
      path: skPath,
      fillPath: fill,
      yLabels: yLabelData,
      xLabels: xLabelData,
      points: pointData,
    };
  }, [
    clampedDomain.end,
    clampedDomain.start,
    data,
    GRAPH_HEIGHT,
    GRAPH_WIDTH,
    maxIndex,
    rangeKey,
  ]);

  const font = matchFont({
    fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
    fontSize: 9,
    fontWeight: '400',
  });

  const selectedPoint =
    selectedIndex === null
      ? null
      : points.find(point => point.index === selectedIndex) ?? null;

  const updateSelectionFromX = (touchX: number) => {
    if (!showTooltip || maxIndex < 0) return;
    const clampedX = clamp(touchX, LEFT_MARGIN, LEFT_MARGIN + GRAPH_WIDTH);
    const ratio = GRAPH_WIDTH <= 0 ? 0 : (clampedX - LEFT_MARGIN) / GRAPH_WIDTH;
    const span = Math.max(1, clampedDomain.end - clampedDomain.start);
    const rawIndex = clampedDomain.start + ratio * span;
    setSelectedIndex(clamp(Math.round(rawIndex), 0, maxIndex));
  };

  const resetZoom = () => {
    setVisibleDomain({ start: 0, end: maxIndex });
  };

  const applyPinchZoom = (
    nextDistance: number,
    centerX: number,
    centerY: number,
  ) => {
    if (maxIndex <= 1 || gestureRef.current.startDistance <= 0) return;
    const zoomFactor = nextDistance / gestureRef.current.startDistance;
    const start = gestureRef.current.startDomain.start;
    const end = gestureRef.current.startDomain.end;
    const startSpan = Math.max(1, end - start);
    const unclampedNextSpan = startSpan / Math.max(0.25, zoomFactor);
    const nextSpan = clamp(
      unclampedNextSpan,
      minSpan,
      Math.max(minSpan, maxIndex),
    );
    const ratio =
      startSpan <= 0
        ? 0.5
        : (gestureRef.current.anchorIndex - start) / startSpan;
    let nextStart = gestureRef.current.anchorIndex - ratio * nextSpan;
    let nextEnd = nextStart + nextSpan;
    if (nextStart < 0) {
      nextEnd -= nextStart;
      nextStart = 0;
    }
    if (nextEnd > maxIndex) {
      const overflow = nextEnd - maxIndex;
      nextStart -= overflow;
      nextEnd = maxIndex;
    }
    nextStart = clamp(nextStart, 0, Math.max(0, maxIndex - nextSpan));
    nextEnd = clamp(nextStart + nextSpan, nextStart + minSpan, maxIndex);
    setVisibleDomain({ start: nextStart, end: nextEnd });
    updateSelectionFromX(centerX);
    lastTapRef.current = {
      time: 0,
      x: centerX,
      y: centerY,
    };
  };

  const readTouchCenter = (
    touches: ReadonlyArray<{
      locationX?: number;
      locationY?: number;
      pageX?: number;
      pageY?: number;
    }>,
  ) => {
    if (touches.length === 0) return { x: LEFT_MARGIN, y: TOP_PADDING };
    if (touches.length === 1) {
      return {
        x: touches[0].locationX ?? touches[0].pageX ?? LEFT_MARGIN,
        y: touches[0].locationY ?? touches[0].pageY ?? TOP_PADDING,
      };
    }
    const first = touches[0];
    const second = touches[1];
    return {
      x:
        ((first.locationX ?? first.pageX ?? LEFT_MARGIN) +
          (second.locationX ?? second.pageX ?? LEFT_MARGIN)) /
        2,
      y:
        ((first.locationY ?? first.pageY ?? TOP_PADDING) +
          (second.locationY ?? second.pageY ?? TOP_PADDING)) /
        2,
    };
  };

  const readTouchDistance = (
    touches: ReadonlyArray<{
      locationX?: number;
      locationY?: number;
      pageX?: number;
      pageY?: number;
    }>,
  ): number => {
    if (touches.length < 2) return 0;
    const a = touches[0];
    const b = touches[1];
    const ax = a.locationX ?? a.pageX ?? 0;
    const ay = a.locationY ?? a.pageY ?? 0;
    const bx = b.locationX ?? b.pageX ?? 0;
    const by = b.locationY ?? b.pageY ?? 0;
    return Math.hypot(ax - bx, ay - by);
  };

  return (
    <TouchableWithoutFeedback
      onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
    >
      <View
        style={{ height, width: '100%' }}
        onLayout={event => setContainerWidth(event.nativeEvent.layout.width)}
        onTouchStart={event => {
          const touches = event.nativeEvent.touches;
          if (!touches.length) return;
          onInteractionLockChange?.(true);
          if (touches.length >= 2) {
            const center = readTouchCenter(touches);
            const distance = readTouchDistance(touches);
            const span = Math.max(1, clampedDomain.end - clampedDomain.start);
            const ratio =
              GRAPH_WIDTH <= 0
                ? 0
                : clamp((center.x - LEFT_MARGIN) / GRAPH_WIDTH, 0, 1);
            gestureRef.current = {
              mode: 'pinch',
              startDistance: distance,
              startDomain: { ...clampedDomain },
              anchorIndex: clampedDomain.start + ratio * span,
            };
            updateSelectionFromX(center.x);
            return;
          }
          const touch = touches[0];
          const x = touch.locationX ?? touch.pageX ?? LEFT_MARGIN;
          gestureRef.current.mode = 'scrub';
          updateSelectionFromX(x);
        }}
        onTouchMove={event => {
          const touches = event.nativeEvent.touches;
          if (touches.length >= 2) {
            const center = readTouchCenter(touches);
            const distance = readTouchDistance(touches);
            if (gestureRef.current.mode !== 'pinch') {
              const span = Math.max(1, clampedDomain.end - clampedDomain.start);
              const ratio =
                GRAPH_WIDTH <= 0
                  ? 0
                  : clamp((center.x - LEFT_MARGIN) / GRAPH_WIDTH, 0, 1);
              gestureRef.current = {
                mode: 'pinch',
                startDistance: distance,
                startDomain: { ...clampedDomain },
                anchorIndex: clampedDomain.start + ratio * span,
              };
            }
            applyPinchZoom(distance, center.x, center.y);
            return;
          }
          if (!touches.length) return;
          if (!showTooltip) return;
          const touch = touches[0];
          const x = touch.locationX ?? touch.pageX ?? LEFT_MARGIN;
          updateSelectionFromX(x);
        }}
        onTouchEnd={event => {
          if (event.nativeEvent.touches.length > 0) {
            return;
          }
          const touch = event.nativeEvent.changedTouches?.[0];
          const x = touch?.locationX ?? touch?.pageX ?? LEFT_MARGIN;
          const y = touch?.locationY ?? touch?.pageY ?? TOP_PADDING;
          const now = Date.now();
          const isDoubleTap =
            now - lastTapRef.current.time <= MAX_TAP_INTERVAL_MS &&
            Math.hypot(x - lastTapRef.current.x, y - lastTapRef.current.y) <=
              DOUBLE_TAP_DISTANCE;
          if (isDoubleTap) {
            resetZoom();
          }
          lastTapRef.current = { time: now, x, y };
          gestureRef.current.mode = 'none';
          onInteractionLockChange?.(false);
        }}
        onTouchCancel={() => {
          gestureRef.current.mode = 'none';
          onInteractionLockChange?.(false);
        }}
      >
        {unit ? (
          <Text
            style={{
              position: 'absolute',
              right: 8,
              top: 2,
              fontSize: 10,
              color: palette.mutedText,
              zIndex: 2,
              textTransform: 'uppercase',
            }}
          >
            {unit}
          </Text>
        ) : null}
        <Canvas style={{ flex: 1 }}>
          <Path path={fillPath} color={palette.primary} opacity={0.18} />

          <Path
            path={path}
            style="stroke"
            strokeWidth={3}
            color={palette.primary}
            strokeCap="round"
            strokeJoin="round"
          />
          {showTooltip && selectedPoint ? (
            <>
              <Line
                p1={{ x: selectedPoint.x, y: TOP_PADDING }}
                p2={{ x: selectedPoint.x, y: height - BOTTOM_MARGIN }}
                color={palette.border}
                strokeWidth={1}
              />
              <Circle
                cx={selectedPoint.x}
                cy={selectedPoint.y}
                r={4}
                color={palette.primary}
              />
            </>
          ) : null}

          {yLabels.map((label, i) => (
            <SkiaText
              key={`y-${i}`}
              x={3}
              y={label.y}
              text={formatVolume(label.value, unit)}
              font={font}
              color={palette.mutedText}
            />
          ))}

          {xLabels.map((label, i) => (
            <SkiaText
              key={`x-${i}`}
              x={clamp(
                label.x - estimateLabelWidth(label.label) / 2,
                LEFT_MARGIN - 4,
                LEFT_MARGIN + GRAPH_WIDTH - estimateLabelWidth(label.label),
              )}
              y={height - 8}
              text={label.label}
              font={font}
              color={palette.mutedText}
            />
          ))}
        </Canvas>
        {showTooltip && selectedPoint ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: clamp(selectedPoint.x - 70, 8, resolvedWidth - 160),
              top: 6,
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              backgroundColor: palette.mutedSurface,
              borderWidth: 1,
              borderColor: palette.border,
            }}
          >
            <SkiaTooltipText
              label={selectedPoint.label}
              value={selectedPoint.value}
              unit={unit}
              count={selectedPoint.count}
              countLabel={countLabel}
            />
          </View>
        ) : null}
      </View>
    </TouchableWithoutFeedback>
  );
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getPointCount = (point: TrendPoint): number => point.count;

const estimateLabelWidth = (label: string): number =>
  Math.max(24, label.length * 5.4);

const buildXTickIndices = (
  length: number,
  rangeKey: AnalyticsRangeKey | undefined,
  graphWidth: number,
): number[] => {
  if (length <= 0) return [];
  const tickStep = tickStepForRange(length, rangeKey, graphWidth);
  const indices: number[] = [];
  for (let index = 0; index < length; index += tickStep) {
    indices.push(index);
  }
  const lastIndex = length - 1;
  if (!indices.includes(lastIndex)) {
    indices.push(lastIndex);
  }
  return Array.from(new Set(indices)).sort((a, b) => a - b);
};

const tickStepForRange = (
  length: number,
  rangeKey: AnalyticsRangeKey | undefined,
  graphWidth: number,
): number => {
  const minSpacing = minLabelSpacing(rangeKey);
  const maxTicksByWidth = Math.max(2, Math.floor(graphWidth / minSpacing));
  if (length <= maxTicksByWidth) return 1;
  return Math.max(1, Math.ceil((length - 1) / (maxTicksByWidth - 1)));
};

const minLabelSpacing = (rangeKey?: AnalyticsRangeKey): number => {
  switch (rangeKey) {
    case '1w':
    case '2w':
      return 44;
    case '1m':
      return 58;
    case '3m':
    case '6m':
      return 52;
    case '1y':
      return 64;
    case 'all':
      return 72;
    default:
      return 56;
  }
};

const SkiaTooltipText = ({
  label,
  value,
  unit,
  count,
  countLabel,
}: {
  label: string;
  value: number;
  unit?: string;
  count: number;
  countLabel?: string;
}) => {
  const suffix = unit ? ` ${unit}` : '';
  const countText =
    count > 0 && countLabel
      ? ` • ${count} ${count === 1 ? countLabel : `${countLabel}s`}`
      : '';
  return (
    <View>
      <Text
        style={{
          color: palette.text,
          fontWeight: '600',
          fontSize: 12,
        }}
      >
        {label}
      </Text>
      <Text style={{ color: palette.mutedText, fontSize: 11 }}>
        {formatVolume(value, unit)}
        {suffix}
        {countText}
      </Text>
    </View>
  );
};
