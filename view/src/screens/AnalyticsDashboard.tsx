import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import ScreenHeader from '../ui/ScreenHeader';
import { SkiaHeatmap } from '../components/analytics/SkiaHeatmap';
import { JsonObject, computeBreakdownAnalytics } from '../TrackerEngine';
import {
  asLabelText,
  asMuscleGroup,
  unwrapDisplayLabel,
} from '../domain/types';
import { analyticsUi, palette, spacing, radius, typography } from '../ui/theme';
import { getMuscleColor } from '../ui/muscleColors';
import { formatMuscleLabel, formatPercent } from '../ui/formatters';
import { AnalyticsRangeSelector } from '../components/analytics/AnalyticsRangeSelector';
import {
  AnalyticsRangeKey,
  getRangeOption,
} from '../components/analytics/analyticsRanges';
import { filterEventsByRange } from '../components/analytics/analyticsUtils';
import { useAnalyticsData } from '../components/analytics/AnalyticsDataContext';
import { WorkoutEvent } from '../workoutFlows';
import { useAppState } from '../state/appContext';

const DAY_MS = 24 * 60 * 60 * 1000;

const focusWindowOptions: ReadonlyArray<AnalyticsRangeKey> = [
  '1w',
  '2w',
  '1m',
  '3m',
  '6m',
  '1y',
  'all',
];

type CurrentMonthStats = {
  sessionsSoFar: number;
  sessionPercent: number;
  restDaysSoFar: number;
  restPercent: number;
  elapsedDaysThisMonth: number;
};

const startOfDay = (value: number): number => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const startOfMonth = (value: number): number => {
  const dayStart = startOfDay(value);
  const date = new Date(dayStart);
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const computeCurrentMonthStats = (
  events: WorkoutEvent[],
): CurrentMonthStats => {
  const now = Date.now();
  const todayStart = startOfDay(now);
  const monthStart = startOfMonth(now);
  const elapsedDaysThisMonth =
    Math.floor((todayStart - monthStart) / DAY_MS) + 1;
  const daySet = new Set<number>();
  events.forEach(event => {
    if (event.ts < monthStart || event.ts > todayStart + DAY_MS - 1) return;
    daySet.add(startOfDay(event.ts));
  });
  const sessionsSoFar = daySet.size;
  const restDaysSoFar = Math.max(0, elapsedDaysThisMonth - sessionsSoFar);
  const sessionPercent =
    elapsedDaysThisMonth > 0 ? (sessionsSoFar / elapsedDaysThisMonth) * 100 : 0;
  const restPercent =
    elapsedDaysThisMonth > 0 ? (restDaysSoFar / elapsedDaysThisMonth) * 100 : 0;
  return {
    sessionsSoFar,
    sessionPercent,
    restDaysSoFar,
    restPercent,
    elapsedDaysThisMonth,
  };
};

export const AnalyticsDashboard = ({
  embedded = false,
  onOpenBreakdown,
}: {
  embedded?: boolean;
  onOpenBreakdown?: () => void;
}) => {
  const { events, summary, loading, error, catalog, eventsByRange } =
    useAnalyticsData();
  const { preferences } = useAppState();
  const themeKey = `${preferences.themeMode}:${preferences.themeAccent}:${
    preferences.customAccentHex ?? ''
  }`;
  const styles = useMemo(() => createStyles(), [themeKey]);

  const [focusWindow, setFocusWindow] = useState<AnalyticsRangeKey>('3m');
  const [selectedHeatmapYear, setSelectedHeatmapYear] = useState<number | null>(
    null,
  );
  const [interactionLocked, setInteractionLocked] = useState(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleInteractionLockChange = useCallback((locked: boolean) => {
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
    setInteractionLocked(locked);
    if (locked) {
      unlockTimerRef.current = setTimeout(() => {
        setInteractionLocked(false);
      }, 1800);
    }
  }, []);

  useEffect(
    () => () => {
      if (unlockTimerRef.current) {
        clearTimeout(unlockTimerRef.current);
      }
    },
    [],
  );

  const currentMonthStats = useMemo(
    () => computeCurrentMonthStats(events),
    [events],
  );

  const heatmapYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()]);
    if (summary) {
      summary.heatmap.forEach(point => {
        const year = Number(point.date.slice(0, 4));
        if (Number.isFinite(year)) {
          years.add(year);
        }
      });
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [summary]);

  useEffect(() => {
    if (!heatmapYears.length) return;
    if (
      selectedHeatmapYear === null ||
      !heatmapYears.includes(selectedHeatmapYear)
    ) {
      setSelectedHeatmapYear(heatmapYears[0]);
    }
  }, [heatmapYears, selectedHeatmapYear]);

  const focusEvents = useMemo(() => {
    if (focusWindow === 'all') {
      return events;
    }
    return (
      eventsByRange[focusWindow] ?? filterEventsByRange(events, focusWindow)
    );
  }, [events, eventsByRange, focusWindow]);

  const focusBreakdown = useMemo(() => {
    if (!catalog || focusEvents.length === 0) return [];
    const offset = new Date().getTimezoneOffset();
    const response = computeBreakdownAnalytics(
      focusEvents as unknown as JsonObject[],
      -offset,
      catalog,
      { metric: 'volume', group_by: 'muscle' },
    );
    return response.items.filter(item => item.value > 0);
  }, [catalog, focusEvents]);

  const focusRows = focusBreakdown;

  const renderStatus = (children: React.ReactNode) => {
    if (embedded) {
      return <View style={styles.center}>{children}</View>;
    }
    return (
      <View style={styles.container}>
        <ScreenHeader title={asLabelText('Insights')} />
        <View style={styles.center}>{children}</View>
      </View>
    );
  };

  if (loading) {
    return renderStatus(
      <ActivityIndicator size="large" color={palette.primary} />,
    );
  }

  if (error) {
    return renderStatus(
      <>
        <Text style={[typography.section, { color: palette.danger }]}>
          Error loading analytics
        </Text>
        <Text style={[typography.label, { marginTop: spacing(1) }]}>
          {error}
        </Text>
      </>,
    );
  }

  if (!summary) {
    return renderStatus(
      <>
        <Text style={typography.section}>No data available</Text>
        <Text style={[typography.label, { marginTop: spacing(0.5) }]}>
          Log some workouts to see insights
        </Text>
      </>,
    );
  }

  const content = (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={!interactionLocked}
    >
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Consistency / month</Text>
        </View>
        <View style={styles.statRow}>
          <StatBox
            styles={styles}
            label="Sessions"
            value={currentMonthStats.sessionsSoFar}
            caption={`${formatPercent(currentMonthStats.sessionPercent)} of ${
              currentMonthStats.elapsedDaysThisMonth
            } days so far`}
          />
          <StatBox
            styles={styles}
            label="Rest days"
            value={currentMonthStats.restDaysSoFar}
            caption={`${formatPercent(currentMonthStats.restPercent)} of ${
              currentMonthStats.elapsedDaysThisMonth
            } days so far`}
          />
        </View>
        <View style={styles.chartContainer}>
          {selectedHeatmapYear !== null ? (
            <SkiaHeatmap
              data={summary.heatmap}
              selectedYear={selectedHeatmapYear}
              availableYears={heatmapYears}
              onSelectYear={setSelectedHeatmapYear}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeaderTall}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Focus Balance</Text>
            <Text style={styles.cardSubtitle}>
              Volume distribution by muscle group (
              {String(getRangeOption(focusWindow).longLabel)})
            </Text>
          </View>
          {onOpenBreakdown ? (
            <TouchableOpacity onPress={onOpenBreakdown}>
              <Text style={[styles.linkText, { color: palette.primary }]}>
                Open Breakdown
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.scopeRow}>
          <AnalyticsRangeSelector
            selected={focusWindow}
            onSelect={setFocusWindow}
            options={focusWindowOptions}
            onInteractionLockChange={handleInteractionLockChange}
          />
        </View>
        {focusRows.length > 0 ? (
          <>
            <Text style={styles.groupHeading}>Muscle groups</Text>
            {focusRows.map(item => (
              <FocusRow
                styles={styles}
                key={`focus-${item.label}`}
                label={item.label}
                percent={item.percentage}
              />
            ))}
          </>
        ) : (
          <Text style={styles.emptyText}>No focus data for this range</Text>
        )}
      </View>

      <View style={{ height: spacing(6) }} />
    </ScrollView>
  );

  if (embedded) {
    return content;
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={asLabelText('Insights')} />
      {content}
    </View>
  );
};

const StatBox = ({
  styles,
  label,
  value,
  caption,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string | number;
  caption?: string | null;
}) => (
  <View style={styles.statBox}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    {caption ? <Text style={styles.statCaption}>{caption}</Text> : null}
  </View>
);

const FocusRow = ({
  styles,
  label,
  percent,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  percent: number;
}) => {
  const muscleGroup = asMuscleGroup(label);
  const displayLabel = unwrapDisplayLabel(formatMuscleLabel(muscleGroup));
  const color = getMuscleColor(muscleGroup);
  return (
    <View style={styles.focusRow}>
      <View style={styles.focusLabelRow}>
        <Text style={styles.focusLabel}>{displayLabel}</Text>
        <Text style={styles.focusPercent}>{formatPercent(percent)}</Text>
      </View>
      <View style={styles.focusTrack}>
        <View
          style={[
            styles.focusFill,
            { width: `${Math.max(4, percent)}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
};

const createStyles = () =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: palette.background,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing(2),
    },
    scrollContent: {
      padding: spacing(2),
      gap: spacing(2),
    },
    card: {
      backgroundColor: palette.surface,
      borderRadius: radius.card,
      padding: spacing(2),
      gap: spacing(1),
      shadowColor: '#000',
      shadowOpacity: analyticsUi.cardShadowOpacity,
      shadowRadius: analyticsUi.cardShadowRadius,
      shadowOffset: { width: 0, height: analyticsUi.cardShadowOffsetY },
      elevation: 2,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing(1.5),
    },
    cardHeaderTall: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: spacing(1),
    },
    cardTitle: {
      ...typography.section,
    },
    cardSubtitle: {
      ...typography.label,
      marginTop: 2,
    },
    scopeRow: {
      marginTop: spacing(0.5),
    },
    statRow: {
      flexDirection: 'row',
      gap: spacing(2.5),
      marginBottom: spacing(1),
    },
    statBox: {
      flex: 1,
    },
    statValue: {
      fontSize: 24,
      fontWeight: '800',
      color: palette.text,
    },
    statLabel: {
      ...typography.label,
    },
    statCaption: {
      color: palette.mutedText,
      fontSize: 11,
      marginTop: spacing(0.25),
    },
    chartContainer: {
      minHeight: 184,
      justifyContent: 'center',
    },
    groupHeading: {
      color: palette.mutedText,
      fontSize: 11,
      textTransform: 'uppercase',
      marginTop: spacing(0.5),
    },
    focusRow: {
      gap: spacing(0.35),
      marginBottom: spacing(0.75),
    },
    focusLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    focusLabel: {
      color: palette.text,
      fontSize: 14,
      fontWeight: '600',
    },
    focusPercent: {
      color: palette.mutedText,
      fontSize: 12,
    },
    focusTrack: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
      backgroundColor: palette.border,
    },
    focusFill: {
      height: '100%',
      borderRadius: 4,
    },
    linkText: {
      fontSize: 12,
      fontWeight: '600',
      marginLeft: spacing(1),
    },
    emptyText: {
      ...typography.label,
      textAlign: 'center',
      paddingVertical: spacing(2),
    },
  });
