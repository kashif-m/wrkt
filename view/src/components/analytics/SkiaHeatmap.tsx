import React, { useEffect, useMemo, useRef } from 'react';
import {
  Canvas,
  Group,
  RoundedRect,
  Text as SkiaText,
  matchFont,
} from '@shopify/react-native-skia';
import {
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { HeatmapPoint } from '../../domain/analytics';
import {
  analyticsUi,
  palette,
  radius,
  spacing,
  typography,
} from '../../ui/theme';

interface SkiaHeatmapProps {
  data: HeatmapPoint[];
  selectedYear: number;
  availableYears: number[];
  onSelectYear: (year: number) => void;
}

const CELL_SIZE = 12;
const GAP = 4;
const ROWS = 7;
const LEFT_MARGIN = 24;
const TOP_MARGIN = 22;
const DAY_MS = 24 * 60 * 60 * 1000;

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const SkiaHeatmap: React.FC<SkiaHeatmapProps> = ({
  data,
  selectedYear,
  availableYears,
  onSelectYear,
}) => {
  const gridScrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(
    null,
  );
  const { cells, monthMarkers, totalWidth } = useMemo(() => {
    const levelByDate = new Map<string, number>();
    data.forEach(point => {
      const key = normalizeDateKey(point);
      if (!key) return;
      levelByDate.set(key, Math.max(levelByDate.get(key) ?? 0, point.level));
    });

    const today = startOfDay(new Date());
    const yearStart = new Date(selectedYear, 0, 1);
    const naturalYearEnd = new Date(selectedYear, 11, 31);
    const yearEnd =
      selectedYear === today.getFullYear() && today < naturalYearEnd
        ? today
        : naturalYearEnd;

    const gridStart = startOfWeekSunday(yearStart);
    const gridEnd = endOfWeekSaturday(yearEnd);
    const totalDays = daysBetween(gridStart, gridEnd) + 1;
    const columns = Math.max(1, Math.ceil(totalDays / 7));

    const grid: Array<{
      key: string;
      x: number;
      y: number;
      opacity: number;
      filled: boolean;
      outside: boolean;
    }> = [];

    for (let dayOffset = 0; dayOffset < totalDays; dayOffset += 1) {
      const date = shiftDays(gridStart, dayOffset);
      const week = Math.floor(dayOffset / 7);
      const row = toSundayIndex(date);
      const inYear =
        date.getFullYear() === selectedYear &&
        date.getTime() >= yearStart.getTime() &&
        date.getTime() <= yearEnd.getTime();
      const level = inYear ? levelByDate.get(toDateKey(date)) ?? 0 : 0;
      const opacity = !inYear ? 0.08 : level === 0 ? 0.18 : 0.3 + level * 0.17;

      grid.push({
        key: toDateKey(date),
        x: LEFT_MARGIN + week * (CELL_SIZE + GAP),
        y: TOP_MARGIN + row * (CELL_SIZE + GAP),
        opacity,
        filled: level > 0,
        outside: !inYear,
      });
    }

    const markers: Array<{ key: string; label: string; x: number }> = [];
    for (let month = 0; month < 12; month += 1) {
      const monthStart = new Date(selectedYear, month, 1);
      if (monthStart.getTime() > yearEnd.getTime()) break;
      const week = Math.floor(daysBetween(gridStart, monthStart) / 7);
      markers.push({
        key: `${selectedYear}-${month}`,
        label: MONTH_LABELS[month],
        x: LEFT_MARGIN + week * (CELL_SIZE + GAP),
      });
    }

    return {
      cells: grid,
      monthMarkers: markers,
      totalWidth: LEFT_MARGIN + columns * (CELL_SIZE + GAP) + spacing(2),
    };
  }, [data, selectedYear]);

  const font = matchFont({
    fontFamily: Platform.select({ ios: 'Helvetica', default: 'sans-serif' }),
    fontSize: 10,
    fontWeight: '400',
  });

  const chartHeight = TOP_MARGIN + (CELL_SIZE + GAP) * ROWS;

  useEffect(() => {
    // Always reset viewport when year changes so users don't see stale offset artifacts.
    gridScrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [selectedYear]);

  return (
    <View style={{ gap: spacing(0.75) }}>
      <View style={{ gap: spacing(0.4) }}>
        <Text style={typography.label}>Year</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            flexDirection: 'row',
            gap: analyticsUi.selectorRailGap,
          }}
        >
          {availableYears.map(year => {
            const active = year === selectedYear;
            return (
              <TouchableOpacity
                key={year}
                onPress={() => onSelectYear(year)}
                accessibilityRole="button"
                accessibilityLabel={`${year}`}
                accessibilityState={{ selected: active }}
                style={{
                  minHeight: analyticsUi.controlHeight,
                  justifyContent: 'center',
                  paddingHorizontal: analyticsUi.controlPaddingX,
                  borderRadius: radius.pill,
                  backgroundColor: active
                    ? palette.primary
                    : palette.mutedSurface,
                }}
              >
                <Text
                  style={{
                    color: active ? palette.background : palette.mutedText,
                    fontSize: 13,
                    fontWeight: '600',
                  }}
                >
                  {year}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
      <View style={{ height: chartHeight }}>
        <ScrollView
          ref={gridScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ width: totalWidth }}
        >
          <Canvas
            key={`heatmap-${selectedYear}`}
            style={{ width: totalWidth, height: chartHeight }}
          >
            <Group>
              {DAY_LABELS.map((label, index) => (
                <SkiaText
                  key={`day-${index}`}
                  x={6}
                  y={TOP_MARGIN + index * (CELL_SIZE + GAP) + CELL_SIZE / 2 + 3}
                  text={label}
                  font={font}
                  color={palette.mutedText}
                />
              ))}

              {monthMarkers.map((marker, index) => (
                <SkiaText
                  key={marker.key}
                  x={marker.x}
                  y={14}
                  text={marker.label}
                  font={font}
                  color={palette.mutedText}
                />
              ))}

              {cells.map((cell, index) => (
                <RoundedRect
                  key={cell.key}
                  x={cell.x}
                  y={cell.y}
                  width={CELL_SIZE}
                  height={CELL_SIZE}
                  r={2}
                  color={
                    cell.outside
                      ? palette.border
                      : cell.filled
                      ? palette.primary
                      : palette.border
                  }
                  opacity={cell.opacity}
                />
              ))}
            </Group>
          </Canvas>
        </ScrollView>
      </View>
    </View>
  );
};

const normalizeDateKey = (point: HeatmapPoint): string | null => {
  if (typeof point.timestamp === 'number' && Number.isFinite(point.timestamp)) {
    return toDateKey(new Date(point.timestamp));
  }
  if (typeof point.date === 'string' && point.date.length >= 10) {
    return point.date.slice(0, 10);
  }
  return null;
};

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeekSunday = (date: Date): Date => {
  const normalized = startOfDay(date);
  const offset = toSundayIndex(normalized);
  return shiftDays(normalized, -offset);
};

const endOfWeekSaturday = (date: Date): Date => {
  const normalized = startOfDay(date);
  const offset = 6 - toSundayIndex(normalized);
  return shiftDays(normalized, offset);
};

const toSundayIndex = (date: Date): number => date.getDay();

const shiftDays = (date: Date, deltaDays: number): Date => {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + deltaDays);
  return shifted;
};

const daysBetween = (start: Date, end: Date): number =>
  Math.floor(
    (startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS,
  );
