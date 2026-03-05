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
  Animated,
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import ScreenHeader from '../ui/ScreenHeader';
import { SkiaHeatmap } from '../components/analytics/SkiaHeatmap';
import { computeBreakdownAnalytics } from '../TrackerEngine';
import {
  asLabelText,
  asMuscleGroup,
  unwrapDisplayLabel,
} from '../domain/types';
import {
  cardShadowStyle,
  palette,
  spacing,
  radius,
  typography,
} from '../ui/theme';
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
import { useAppDispatch, useAppState } from '../state/appContext';
import { SummaryConsistencyWindow } from '../state/appState';

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

type ConsistencyStats = {
  sessions: number;
  sessionPercent: number;
  restDays: number;
  restPercent: number;
  elapsedDays: number;
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

const computeConsistencyStats = (
  events: WorkoutEvent[],
  mode: SummaryConsistencyWindow,
): ConsistencyStats => {
  const now = Date.now();
  const todayStart = startOfDay(now);
  const daySet = new Set<number>();
  events.forEach(event => {
    if (event.ts > todayStart + DAY_MS - 1) return;
    daySet.add(startOfDay(event.ts));
  });
  const hasTodaySession = daySet.has(todayStart);

  const periodEnd = hasTodaySession ? todayStart : todayStart - DAY_MS;
  const periodStart =
    mode === 'this_month' ? startOfMonth(todayStart) : periodEnd - 29 * DAY_MS;

  const elapsedDays =
    periodEnd >= periodStart
      ? Math.floor((periodEnd - periodStart) / DAY_MS) + 1
      : 0;
  const sessions = Array.from(daySet).filter(
    day => day >= periodStart && day <= periodEnd,
  ).length;
  const restDays = Math.max(0, elapsedDays - sessions);
  const sessionPercent = elapsedDays > 0 ? (sessions / elapsedDays) * 100 : 0;
  const restPercent = elapsedDays > 0 ? (restDays / elapsedDays) * 100 : 0;

  return {
    sessions,
    sessionPercent,
    restDays,
    restPercent,
    elapsedDays,
  };
};

export const AnalyticsDashboard = ({
  embedded = false,
  onOpenBreakdown,
}: {
  embedded?: boolean;
  onOpenBreakdown?: () => void;
}) => {
  const dispatch = useAppDispatch();
  const {
    events,
    eventsRevision,
    catalogRevision,
    summary,
    loading,
    error,
    catalog,
    eventsByRange,
    eventsPayloadByRange,
  } = useAnalyticsData();
  const { preferences } = useAppState();
  const themeKey = `${preferences.themeMode}:${preferences.themeAccent}:${
    preferences.customAccentHex ?? ''
  }`;
  const styles = useMemo(() => createStyles(), [themeKey]);

  const [focusWindow, setFocusWindow] = useState<AnalyticsRangeKey>('3m');
  const [consistencyMenuOpen, setConsistencyMenuOpen] = useState(false);
  const [consistencyAnchor, setConsistencyAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [selectedHeatmapYear, setSelectedHeatmapYear] = useState<number | null>(
    null,
  );
  const [interactionLocked, setInteractionLocked] = useState(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consistencyMenuAnim = useRef(new Animated.Value(0)).current;
  const consistencyTriggerRef = useRef<View | null>(null);
  const window = useWindowDimensions();

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

  const consistencyWindow = preferences.summaryConsistencyWindow;
  const consistencyStats = useMemo(
    () => computeConsistencyStats(events, consistencyWindow),
    [consistencyWindow, events],
  );

  useEffect(() => {
    setConsistencyMenuOpen(false);
  }, [consistencyWindow]);

  useEffect(() => {
    Animated.timing(consistencyMenuAnim, {
      toValue: consistencyMenuOpen ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [consistencyMenuAnim, consistencyMenuOpen]);

  const openConsistencyMenu = useCallback(() => {
    consistencyTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setConsistencyAnchor({ x, y, width, height });
      setConsistencyMenuOpen(true);
    });
  }, []);

  const toggleConsistencyMenu = useCallback(() => {
    if (consistencyMenuOpen) {
      setConsistencyMenuOpen(false);
      return;
    }
    openConsistencyMenu();
  }, [consistencyMenuOpen, openConsistencyMenu]);

  const consistencyMenuWidth = 150;
  const consistencyMenuTop =
    (consistencyAnchor?.y ?? spacing(6)) +
    (consistencyAnchor?.height ?? 0) +
    spacing(0.5);
  const consistencyMenuLeft = Math.max(
    spacing(1),
    Math.min(
      (consistencyAnchor?.x ?? spacing(2)) +
        (consistencyAnchor?.width ?? 0) -
        consistencyMenuWidth,
      window.width - consistencyMenuWidth - spacing(1),
    ),
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
  const focusEventPayload = useMemo(() => {
    if (focusWindow === 'all') {
      return eventsPayloadByRange.all ?? [];
    }
    return eventsPayloadByRange[focusWindow] ?? [];
  }, [eventsPayloadByRange, focusWindow]);

  const focusBreakdown = useMemo(() => {
    if (!catalog || focusEvents.length === 0) return [];
    const offset = new Date().getTimezoneOffset();
    const response = computeBreakdownAnalytics(
      focusEventPayload,
      -offset,
      catalog,
      { metric: 'volume', group_by: 'muscle' },
      {
        trace: 'trends/summary-focus',
        cache: {
          enabled: true,
          eventsRevision,
          catalogRevision,
        },
      },
    );
    return response.items.filter(item => item.value > 0);
  }, [catalog, catalogRevision, eventsRevision, focusEventPayload]);

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
      <Animated.View
        style={[
          styles.card,
          {
            transform: [
              {
                scale: consistencyMenuAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.01],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>
            {consistencyWindow === 'this_month'
              ? 'Consistency (this month)'
              : 'Consistency (last 30 days)'}
          </Text>
          <View
            ref={consistencyTriggerRef}
            collapsable={false}
            style={styles.consistencyDropdownWrap}
          >
            <TouchableOpacity
              onPress={toggleConsistencyMenu}
              style={styles.consistencyDropdownTrigger}
            >
              <Text style={styles.consistencyDropdownTriggerText}>
                {consistencyMenuOpen ? '▴' : '▾'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.statRow}>
          <StatBox
            styles={styles}
            label="Sessions"
            value={consistencyStats.sessions}
            percentLabel={
              consistencyWindow === 'last_30_days'
                ? formatPercent(consistencyStats.sessionPercent)
                : null
            }
            caption={
              consistencyWindow === 'this_month'
                ? `${formatPercent(consistencyStats.sessionPercent)} of ${
                    consistencyStats.elapsedDays
                  } days so far`
                : null
            }
          />
          <StatBox
            styles={styles}
            label="Rest days"
            value={consistencyStats.restDays}
            percentLabel={
              consistencyWindow === 'last_30_days'
                ? formatPercent(consistencyStats.restPercent)
                : null
            }
            caption={
              consistencyWindow === 'this_month'
                ? `${formatPercent(consistencyStats.restPercent)} of ${
                    consistencyStats.elapsedDays
                  } days so far`
                : null
            }
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
      </Animated.View>

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
    return (
      <>
        {content}
        <Modal
          visible={consistencyMenuOpen}
          transparent
          animationType="none"
          onRequestClose={() => setConsistencyMenuOpen(false)}
        >
          <Pressable
            style={styles.dropdownBackdrop}
            onPress={() => setConsistencyMenuOpen(false)}
          />
          <Animated.View
            style={[
              styles.consistencyDropdownMenu,
              {
                width: consistencyMenuWidth,
                left: consistencyMenuLeft,
                top: consistencyMenuTop,
                opacity: consistencyMenuAnim,
                transform: [
                  {
                    translateY: consistencyMenuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-6, 0],
                    }),
                  },
                  {
                    scale: consistencyMenuAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.96, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                dispatch({
                  type: 'preferences/summaryConsistencyWindow',
                  mode: 'this_month',
                });
                setConsistencyMenuOpen(false);
              }}
              style={styles.consistencyDropdownOption}
            >
              <Text
                style={[
                  styles.consistencyDropdownOptionText,
                  consistencyWindow === 'this_month'
                    ? styles.consistencyDropdownOptionTextActive
                    : null,
                ]}
              >
                This month
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                dispatch({
                  type: 'preferences/summaryConsistencyWindow',
                  mode: 'last_30_days',
                });
                setConsistencyMenuOpen(false);
              }}
              style={styles.consistencyDropdownOption}
            >
              <Text
                style={[
                  styles.consistencyDropdownOptionText,
                  consistencyWindow === 'last_30_days'
                    ? styles.consistencyDropdownOptionTextActive
                    : null,
                ]}
              >
                Last 30 days
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </Modal>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={asLabelText('Insights')} />
      {content}
      <Modal
        visible={consistencyMenuOpen}
        transparent
        animationType="none"
        onRequestClose={() => setConsistencyMenuOpen(false)}
      >
        <Pressable
          style={styles.dropdownBackdrop}
          onPress={() => setConsistencyMenuOpen(false)}
        />
        <Animated.View
          style={[
            styles.consistencyDropdownMenu,
            {
              width: consistencyMenuWidth,
              left: consistencyMenuLeft,
              top: consistencyMenuTop,
              opacity: consistencyMenuAnim,
              transform: [
                {
                  translateY: consistencyMenuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 0],
                  }),
                },
                {
                  scale: consistencyMenuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.96, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              dispatch({
                type: 'preferences/summaryConsistencyWindow',
                mode: 'this_month',
              });
              setConsistencyMenuOpen(false);
            }}
            style={styles.consistencyDropdownOption}
          >
            <Text
              style={[
                styles.consistencyDropdownOptionText,
                consistencyWindow === 'this_month'
                  ? styles.consistencyDropdownOptionTextActive
                  : null,
              ]}
            >
              This month
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              dispatch({
                type: 'preferences/summaryConsistencyWindow',
                mode: 'last_30_days',
              });
              setConsistencyMenuOpen(false);
            }}
            style={styles.consistencyDropdownOption}
          >
            <Text
              style={[
                styles.consistencyDropdownOptionText,
                consistencyWindow === 'last_30_days'
                  ? styles.consistencyDropdownOptionTextActive
                  : null,
              ]}
            >
              Last 30 days
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
};

const StatBox = ({
  styles,
  label,
  value,
  percentLabel,
  caption,
}: {
  styles: ReturnType<typeof createStyles>;
  label: string;
  value: string | number;
  percentLabel?: string | null;
  caption?: string | null;
}) => (
  <View style={styles.statBox}>
    <Text style={styles.statValue}>{value}</Text>
    {percentLabel ? (
      <View style={styles.statLabelInlineRow}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statPercent}>{percentLabel}</Text>
      </View>
    ) : (
      <Text style={styles.statLabel}>{label}</Text>
    )}
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
      ...cardShadowStyle,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing(1.5),
      gap: spacing(1),
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
    consistencyDropdownTrigger: {
      borderRadius: radius.pill,
      paddingVertical: spacing(0.4),
      paddingHorizontal: spacing(1),
      backgroundColor: palette.mutedSurface,
    },
    consistencyDropdownTriggerText: {
      color: palette.mutedText,
      fontSize: 12,
      fontWeight: '600',
    },
    consistencyDropdownWrap: {
      alignItems: 'flex-end',
    },
    consistencyDropdownMenu: {
      position: 'absolute',
      borderRadius: radius.card,
      backgroundColor: palette.mutedSurface,
      padding: spacing(0.4),
      zIndex: 120,
    },
    consistencyDropdownOption: {
      paddingVertical: spacing(0.5),
      paddingHorizontal: spacing(0.8),
      borderRadius: radius.card,
    },
    consistencyDropdownOptionText: {
      color: palette.text,
      fontSize: 12,
      fontWeight: '600',
    },
    consistencyDropdownOptionTextActive: {
      color: palette.primary,
    },
    dropdownBackdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    statRow: {
      flexDirection: 'row',
      gap: spacing(2.5),
      marginBottom: spacing(1),
    },
    statBox: {
      flex: 1,
    },
    statLabelInlineRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing(0.5),
    },
    statValue: {
      fontSize: 24,
      fontWeight: '800',
      color: palette.text,
    },
    statLabel: {
      ...typography.label,
    },
    statPercent: {
      color: palette.mutedText,
      fontSize: 12,
      fontWeight: '600',
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
