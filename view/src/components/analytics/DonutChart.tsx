import React, { useEffect, useMemo, useState } from 'react';
import { GestureResponderEvent, View } from 'react-native';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';
import {
  ColorHex,
  DisplayLabel,
  unwrapColorHex,
  unwrapDisplayLabel,
} from '../../domain/types';
import { palette } from '../../ui/theme';
import { formatPercent } from '../../ui/formatters';

export type DonutSlice = {
  key: DisplayLabel;
  label?: DisplayLabel;
  percent: number;
  color?: ColorHex;
  valueText?: string;
};

export const DonutChart = ({
  data,
  radius = 36,
  innerRadius = 0,
  innerColor = palette.surface,
  interactive = false,
  activeIndex,
  onActiveIndexChange,
  onInteractionLockChange,
}: {
  data: DonutSlice[];
  radius?: number;
  innerRadius?: number;
  innerColor?: ColorHex;
  interactive?: boolean;
  activeIndex?: number | null;
  onActiveIndexChange?: (index: number) => void;
  onInteractionLockChange?: (locked: boolean) => void;
}) => {
  if (!data.length) return null;
  const [internalActiveIndex, setInternalActiveIndex] = useState(0);
  const selectedIndex =
    typeof activeIndex === 'number' ? activeIndex : internalActiveIndex;
  const center = radius + (interactive ? 4 : 0);
  const totalSize = center * 2;

  useEffect(() => {
    if (selectedIndex < data.length) return;
    setInternalActiveIndex(0);
  }, [data.length, selectedIndex]);

  const arcs = useMemo(() => {
    let currentAngle = 0;
    return data.map((slice, index) => {
      const sweep = (Math.max(0, slice.percent) / 100) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      currentAngle = endAngle;
      const isActive = interactive && index === selectedIndex;
      const outerRadius = isActive ? radius + 4 : radius;
      return {
        key: slice.key,
        label: slice.label ?? slice.key,
        percent: slice.percent,
        valueText: slice.valueText,
        color: slice.color ?? palette.primary,
        startAngle,
        endAngle,
        active: isActive,
        path: describeArc(center, center, outerRadius, startAngle, endAngle),
      };
    });
  }, [center, data, interactive, radius, selectedIndex]);

  const selectedSlice =
    selectedIndex >= 0 && selectedIndex < arcs.length
      ? arcs[selectedIndex]
      : null;

  const setActiveIndex = (index: number) => {
    if (index < 0 || index >= arcs.length) return;
    if (typeof activeIndex !== 'number') {
      setInternalActiveIndex(index);
    }
    onActiveIndexChange?.(index);
  };

  const angleForTouch = (event: GestureResponderEvent) => {
    const x = event.nativeEvent.locationX;
    const y = event.nativeEvent.locationY;
    const dx = x - center;
    const dy = y - center;
    const distance = Math.hypot(dx, dy);
    if (distance > radius + 10) return null;
    if (innerRadius > 0 && distance < Math.max(4, innerRadius - 8)) {
      return null;
    }
    return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
  };

  const indexForAngle = (rawAngle: number): number | null => {
    const angle = ((rawAngle % 360) + 360) % 360;
    for (let index = 0; index < arcs.length; index += 1) {
      const arc = arcs[index];
      if (arc.endAngle <= arc.startAngle) continue;
      if (angle >= arc.startAngle && angle < arc.endAngle) {
        return index;
      }
    }
    return null;
  };

  const handleTouch = (event: GestureResponderEvent) => {
    if (!interactive) return;
    const angle = angleForTouch(event);
    if (angle === null) return;
    const hitIndex = indexForAngle(angle);
    if (hitIndex === null) return;
    setActiveIndex(hitIndex);
  };

  return (
    <View
      style={{ width: totalSize, height: totalSize }}
      onStartShouldSetResponder={() => interactive}
      onMoveShouldSetResponder={() => interactive}
      onResponderGrant={event => {
        onInteractionLockChange?.(true);
        handleTouch(event);
      }}
      onResponderMove={handleTouch}
      onResponderRelease={() => onInteractionLockChange?.(false)}
      onResponderTerminate={() => onInteractionLockChange?.(false)}
      onResponderEnd={() => onInteractionLockChange?.(false)}
    >
      <Svg width={totalSize} height={totalSize}>
        {arcs.map(arc => (
          <Path
            key={unwrapDisplayLabel(arc.key)}
            d={arc.path}
            fill={unwrapColorHex(arc.color)}
            opacity={interactive && !arc.active ? 0.62 : 0.92}
          />
        ))}
        {innerRadius > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={innerRadius}
            fill={unwrapColorHex(innerColor)}
          />
        ) : null}
        {interactive && selectedSlice && innerRadius > 16 ? (
          <>
            <SvgText
              x={center}
              y={center - 6}
              textAnchor="middle"
              fill={unwrapColorHex(palette.text)}
              fontSize="10"
              fontWeight="700"
            >
              {truncateLabel(unwrapDisplayLabel(selectedSlice.label), 12)}
            </SvgText>
            <SvgText
              x={center}
              y={center + 10}
              textAnchor="middle"
              fill={unwrapColorHex(palette.mutedText)}
              fontSize="9"
              fontWeight="600"
            >
              {selectedSlice.valueText ??
                formatPercent(Math.max(0, selectedSlice.percent))}
            </SvgText>
          </>
        ) : null}
      </Svg>
    </View>
  );
};

const polarToCartesian = (
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
};

const describeArc = (
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) => {
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return [
    `M ${x} ${y}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
};

const truncateLabel = (value: string, max: number): string => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}…`;
};
