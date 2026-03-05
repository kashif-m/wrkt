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
  TouchableOpacity,
  Animated,
  StyleSheet,
  ViewStyle,
  TouchableWithoutFeedback,
  NativeSyntheticEvent,
} from 'react-native';
import PagerView from 'react-native-pager-view';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { ScrollView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { DonutChart } from '../components/analytics/DonutChart';
import { computeCalendarMonthAnalytics, JsonObject } from '../TrackerEngine';
import { CalendarMonthResponse } from '../domain/analytics';
import { getMuscleColor } from '../ui/muscleColors';
import { roundToLocalDay } from '../timePolicy';
import { formatPercent } from '../ui/formatters';
import { cardShadowStyle, palette, radius, spacing } from '../ui/theme';
import { addAlpha } from '../ui/color';
import ChevronLeftIcon from '../assets/chevron-left.svg';
import ChevronRightIcon from '../assets/chevron-right.svg';
import TodayIcon from '../assets/today-target.svg';
import ArrowLeftIcon from '../assets/arrow-left.svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import { Card } from '../ui/components';
import { toAnalyticsInputEvents } from '../components/analytics/analyticsPayload';
import {
  ColorHex,
  ExerciseName,
  MuscleGroup,
  asDisplayLabel,
  asExerciseName,
  asMuscleGroup,
  asScreenKey,
} from '../domain/types';

const DAYS_IN_WEEK = 7;
const TOTAL_CELLS = 42;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
type MonthPageSelectedEvent = NativeSyntheticEvent<{ position: number }>;
type MonthPageScrollStateEvent = NativeSyntheticEvent<{
  pageScrollState: 'idle' | 'dragging' | 'settling';
}>;
type CalendarMuscleRow = ReturnType<typeof mapCalendarMuscles>[number];
type CalendarPieDatum = ReturnType<typeof mapCalendarPieData>[number];
type CalendarMonthStats = {
  sessions: number;
  attendance: number;
  isFutureMonth: boolean;
  topMuscles: CalendarMuscleRow[];
  allMuscles: CalendarMuscleRow[];
  pieData: CalendarPieDatum[];
};
const MONTH_STATS_CACHE_LIMIT = 48;
const MONTH_DAYS_CACHE_LIMIT = 24;

const CalendarScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const events = state.events;
  const offsetMinutes = -new Date().getTimezoneOffset();
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
  const eventPayload = useMemo(
    () => toAnalyticsInputEvents(events),
    [events],
  );
  const catalogPayload = useMemo(
    () => catalog as unknown as JsonObject[],
    [catalog],
  );
  const visibleMonth = state.calendar.visibleMonth;
  const yearSheetOpen = state.calendar.yearSheetOpen;
  const monthPagerRef = useRef<PagerView | null>(null);
  const visibleMonthRef = useRef(visibleMonth);
  const pendingPagePositionRef = useRef<number | null>(null);
  const scrollStateRef = useRef<'idle' | 'dragging' | 'settling'>('idle');
  const awaitingCenterRef = useRef(false);
  const monthStatsCacheRef = useRef<Map<string, CalendarMonthStats>>(new Map());
  const monthDaysCacheRef = useRef<Map<number, Date[]>>(new Map());
  const sheetTranslate = useRef(new Animated.Value(0)).current;
  const [showAllMuscles, setShowAllMuscles] = useState(false);
  const styles = useMemo(createStyles, []);

  useEffect(() => {
    visibleMonthRef.current = visibleMonth;
  }, [visibleMonth]);

  useEffect(() => {
    if (yearSheetOpen) {
      sheetTranslate.setValue(0);
    }
  }, [yearSheetOpen, sheetTranslate]);

  useEffect(() => {
    setShowAllMuscles(false);
  }, [visibleMonth]);

  const catalogMap = useMemo(() => {
    const map = new Map<ExerciseName, ExerciseCatalogEntry>();
    catalog.forEach(entry => map.set(entry.display_name, entry));
    return map;
  }, [catalog]);

  const dayColorMap = useMemo(() => {
    const buckets = new Map<number, ColorHex[]>();
    events.forEach(event => {
      const day = roundToLocalDay(event.ts);
      const exerciseName =
        typeof event.payload?.exercise === 'string'
          ? asExerciseName(event.payload.exercise)
          : null;
      const meta = exerciseName ? catalogMap.get(exerciseName) : null;
      const color = getMuscleColor(meta?.primary_muscle_group);
      const colors = buckets.get(day) ?? [];
      if (!colors.includes(color)) {
        colors.push(color);
        buckets.set(day, colors);
      }
    });
    return buckets;
  }, [events, catalogMap]);

  const getMonthStats = useCallback(
    (month: Date): CalendarMonthStats => {
      const monthBucket = getMonthBucket(month);
      const cacheKey = `${monthBucket}:${state.eventsRevision}:${state.catalogRevision}:${offsetMinutes}`;
      const cached = monthStatsCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }
      const analytics = computeCalendarMonthAnalytics(
        eventPayload,
        offsetMinutes,
        catalogPayload,
        {
          month_bucket: monthBucket,
        },
        {
          trace: 'calendar/month-change',
          cache: {
            enabled: true,
            eventsRevision: state.eventsRevision,
            catalogRevision: state.catalogRevision,
          },
        },
      );
      const allMuscles = mapCalendarMuscles(analytics.all_muscles);
      const topMuscles = mapCalendarMuscles(analytics.top_muscles);
      const pieData = mapCalendarPieData(analytics);
      const stats: CalendarMonthStats = {
        sessions: analytics.sessions,
        attendance: analytics.attendance_percent,
        isFutureMonth: analytics.is_future_month,
        topMuscles,
        allMuscles,
        pieData,
      };
      cacheSet(
        monthStatsCacheRef.current,
        cacheKey,
        stats,
        MONTH_STATS_CACHE_LIMIT,
      );
      return stats;
    },
    [
      catalogPayload,
      eventPayload,
      offsetMinutes,
      state.catalogRevision,
      state.eventsRevision,
    ],
  );
  const getMonthDays = useCallback((month: Date) => {
    const monthBucket = getMonthBucket(month);
    const cached = monthDaysCacheRef.current.get(monthBucket);
    if (cached) {
      return cached;
    }
    const days = buildCalendarDays(month);
    cacheSet(monthDaysCacheRef.current, monthBucket, days, MONTH_DAYS_CACHE_LIMIT);
    return days;
  }, []);
  const monthPages = useMemo(
    () =>
      [-1, 0, 1].map(offset => {
        const month = shiftMonth(visibleMonth, offset);
        return {
          key: `${month.getFullYear()}-${month.getMonth()}`,
          month,
          days: getMonthDays(month),
          stats: getMonthStats(month),
        };
      }),
    [getMonthDays, getMonthStats, visibleMonth],
  );
  const selectedDayBucket = useMemo(
    () => roundToLocalDay(selectedDate.getTime()),
    [selectedDate],
  );
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: 'long',
  });
  const yearLabel = visibleMonth.getFullYear();
  const yearOptions = useMemo(() => {
    const base = visibleMonth.getFullYear() - 25;
    return Array.from({ length: 60 }, (_, index) => base + index);
  }, [visibleMonth]);

  const setVisibleMonth = useCallback(
    (date: Date) => {
      visibleMonthRef.current = date;
      dispatch({ type: 'calendar/visibleMonth', date });
    },
    [dispatch],
  );

  const recenterMonthPager = useCallback(() => {
    monthPagerRef.current?.setPageWithoutAnimation(1);
  }, []);

  const commitPendingMonthChange = useCallback(() => {
    const position = pendingPagePositionRef.current;
    if (position == null || position === 1) {
      return;
    }
    pendingPagePositionRef.current = null;
    const targetMonth = shiftMonth(visibleMonthRef.current, position - 1);
    setVisibleMonth(targetMonth);
    awaitingCenterRef.current = true;
    recenterMonthPager();
  }, [recenterMonthPager, setVisibleMonth]);

  const handleShift = useCallback(
    (delta: number) => {
      const pager = monthPagerRef.current;
      if (!pager) {
        setVisibleMonth(shiftMonth(visibleMonthRef.current, delta));
        return;
      }
      pager.setPage(delta >= 0 ? 2 : 0);
    },
    [setVisibleMonth],
  );
  const handleMonthPageSelected = useCallback(
    (event: MonthPageSelectedEvent) => {
      const position = event.nativeEvent.position;
      if (awaitingCenterRef.current && position === 1) {
        awaitingCenterRef.current = false;
        return;
      }
      if (position === 1) {
        return;
      }
      pendingPagePositionRef.current = position;
      if (scrollStateRef.current === 'idle') {
        commitPendingMonthChange();
      }
    },
    [commitPendingMonthChange],
  );

  const handleMonthPageScrollStateChanged = useCallback(
    (event: MonthPageScrollStateEvent) => {
      const nextState = event.nativeEvent.pageScrollState;
      scrollStateRef.current = nextState;
      if (nextState === 'dragging') {
        // Safety release for platforms that miss center-selected after recenter.
        awaitingCenterRef.current = false;
      }
      if (nextState !== 'idle') {
        return;
      }
      commitPendingMonthChange();
    },
    [commitPendingMonthChange],
  );

  const closeSheet = useCallback(() => {
    dispatch({ type: 'calendar/yearSheet', open: false });
    sheetTranslate.setValue(0);
  }, [dispatch, sheetTranslate]);

  const resetSheet = useCallback(() => {
    Animated.timing(sheetTranslate, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [sheetTranslate]);

  const updateSheetTranslate = useCallback(
    (value: number) => {
      sheetTranslate.setValue(value);
    },
    [sheetTranslate],
  );

  const sheetPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([6, 6])
        .failOffsetX([-10, 10])
        .onUpdate(event => {
          'worklet';
          if (event.translationY > 0) {
            runOnJS(updateSheetTranslate)(event.translationY);
          }
        })
        .onEnd(event => {
          'worklet';
          if (event.translationY > 80) {
            runOnJS(closeSheet)();
            return;
          }
          runOnJS(resetSheet)();
        }),
    [closeSheet, resetSheet, updateSheetTranslate],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => actions.navigate(asScreenKey('home'))}
          style={styles.headerButton}
        >
          <ArrowLeftIcon width={18} height={18} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => dispatch({ type: 'calendar/yearSheet', open: true })}
          style={styles.monthTitle}
        >
          <Text
            style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}
          >
            {monthLabel}
          </Text>
          <Text style={{ color: palette.mutedText, fontSize: 12 }}>
            {yearLabel}
          </Text>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => handleShift(-1)}
            style={styles.iconButton}
          >
            <ChevronLeftIcon width={18} height={18} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleShift(1)}
            style={styles.iconButton}
          >
            <ChevronRightIcon width={18} height={18} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const today = new Date();
              const currentMonthKey =
                visibleMonth.getFullYear() * 12 + visibleMonth.getMonth();
              const targetMonthKey = today.getFullYear() * 12 + today.getMonth();
              if (targetMonthKey !== currentMonthKey) {
                setVisibleMonth(today);
                recenterMonthPager();
              } else {
                setVisibleMonth(today);
              }
              actions.setSelectedDate(new Date(today));
            }}
            style={styles.todayButton}
          >
            <TodayIcon width={16} height={16} color={palette.text} />
            <Text
              style={{ color: palette.text, fontWeight: '600', fontSize: 12 }}
            >
              Today
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <PagerView
        ref={monthPagerRef}
        style={{ flex: 1 }}
        initialPage={1}
        overdrag={false}
        offscreenPageLimit={1}
        onPageSelected={handleMonthPageSelected}
        onPageScrollStateChanged={handleMonthPageScrollStateChanged}
      >
        {monthPages.map(page => {
          const monthStats = page.stats;
          return (
            <ScrollView
              key={page.key}
              contentContainerStyle={{
                paddingTop: spacing(1.5),
                paddingBottom: spacing(6),
              }}
            >
              <Card variant="analytics" style={styles.summaryCard}>
                <View style={styles.summaryHeader}>
                  <Text style={styles.summaryTitle}>Monthly summary</Text>
                  <Text style={styles.summarySubtitle}>
                    {monthStats.sessions} sessions •{' '}
                    {formatPercent(monthStats.attendance)} attendance
                  </Text>
                </View>
                {monthStats.sessions === 0 ? (
                  <Text style={styles.summaryValue}>
                    {monthStats.isFutureMonth
                      ? 'No sessions logged yet'
                      : 'No sessions logged'}
                  </Text>
                ) : (
                  <View style={styles.summaryBody}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Top muscle groups</Text>
                        {monthStats.allMuscles.length > 3 ? (
                          <TouchableOpacity
                            onPress={() => setShowAllMuscles(current => !current)}
                          >
                            <Text style={styles.summaryLink}>
                              {showAllMuscles ? 'Show less' : 'Show all'}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {(showAllMuscles
                        ? monthStats.allMuscles
                        : monthStats.topMuscles
                      ).map(item => (
                        <View key={item.group} style={styles.summaryRow}>
                          <View
                            style={[styles.dot, { backgroundColor: item.color }]}
                          />
                          <Text style={styles.summaryValue}>
                            {formatLabel(item.group)} · {item.count}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.summaryChart}>
                      <DonutChart data={monthStats.pieData} radius={38} />
                    </View>
                  </View>
                )}
              </Card>
              <View style={styles.weekdayRow}>
                {DAY_NAMES.map(label => (
                  <Text
                    key={label}
                    style={{
                      color:
                        label === 'SUN' || label === 'SAT'
                          ? palette.danger
                          : palette.mutedText,
                      fontSize: 12,
                      flex: 1,
                      textAlign: 'center',
                    }}
                  >
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.gridShadowWrap}>
                <View style={styles.grid}>
                  {page.days.map((day, index) => {
                    const dateKey = roundToLocalDay(day.getTime());
                    const colors = dayColorMap.get(dateKey) ?? [];
                    const isCurrentMonth = day.getMonth() === page.month.getMonth();
                    const isSelected = selectedDayBucket === dateKey;
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                    const isLastColumn = (index + 1) % DAYS_IN_WEEK === 0;
                    const isLastRow = index >= TOTAL_CELLS - DAYS_IN_WEEK;
                    return (
                      <TouchableOpacity
                        key={day.toISOString()}
                        style={[
                          styles.cell,
                          {
                            borderRightWidth: isLastColumn
                              ? 0
                              : StyleSheet.hairlineWidth,
                            borderBottomWidth: isLastRow
                              ? 0
                              : StyleSheet.hairlineWidth,
                          },
                          !isCurrentMonth && { opacity: 0.3 },
                          isWeekend && {
                            backgroundColor: addAlpha(palette.surface, 0.35),
                          },
                        ]}
                        onPress={() => {
                          actions.setSelectedDate(new Date(day));
                          actions.navigate(asScreenKey('home'));
                        }}
                      >
                        <Text
                          style={{
                            color: isWeekend ? palette.warning : palette.text,
                            fontWeight: '600',
                          }}
                        >
                          {day.getDate()}
                        </Text>
                        <View style={styles.dotRow}>
                          {colors.slice(0, 3).map(color => (
                            <View
                              key={`${dateKey}-${color}`}
                              style={[styles.dot, { backgroundColor: color }]}
                            />
                          ))}
                        </View>
                        {isSelected ? (
                          <View
                            pointerEvents="none"
                            style={[
                              styles.selectedOutline,
                              { borderColor: palette.primary },
                            ]}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </ScrollView>
          );
        })}
      </PagerView>

      {yearSheetOpen ? (
        <TouchableWithoutFeedback
          onPress={() => dispatch({ type: 'calendar/yearSheet', open: false })}
        >
          <View style={styles.sheetOverlay}>
            <GestureDetector gesture={sheetPanGesture}>
              <Animated.View
                style={[
                  styles.sheetContainer,
                  { transform: [{ translateY: sheetTranslate }] },
                ]}
              >
                <Text
                  style={{ color: palette.mutedText, marginBottom: spacing(1) }}
                >
                  Select year
                </Text>
                <ScrollView>
                  {yearOptions.map(year => (
                    <TouchableOpacity
                      key={year}
                      onPress={() => {
                        const target = new Date(visibleMonth);
                        target.setFullYear(year, target.getMonth(), 1);
                        const currentMonthKey =
                          visibleMonth.getFullYear() * 12 + visibleMonth.getMonth();
                        const targetMonthKey =
                          target.getFullYear() * 12 + target.getMonth();
                        if (targetMonthKey !== currentMonthKey) {
                          setVisibleMonth(target);
                          recenterMonthPager();
                        }
                        dispatch({ type: 'calendar/yearSheet', open: false });
                      }}
                      style={[
                        styles.sheetRow,
                        visibleMonth.getFullYear() === year && {
                          backgroundColor: palette.mutedSurface,
                        },
                      ]}
                    >
                      <Text style={{ color: palette.text, fontSize: 16 }}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <TouchableOpacity
                  onPress={() =>
                    dispatch({ type: 'calendar/yearSheet', open: false })
                  }
                  style={{ paddingVertical: spacing(1) }}
                >
                  <Text
                    style={{
                      color: palette.primary,
                      fontWeight: '600',
                      textAlign: 'center',
                    }}
                  >
                    Close
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </GestureDetector>
          </View>
        </TouchableWithoutFeedback>
      ) : null}
    </View>
  );
};

const buildCalendarDays = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = firstDay.getDay();
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - offset);
  const days: Date[] = [];
  for (let i = 0; i < TOTAL_CELLS; i += 1) {
    days.push(
      new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + i,
      ),
    );
  }
  return days;
};

const shiftMonth = (date: Date, delta: number) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + delta, 1);
  return next;
};

const getMonthBucket = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1).getTime();

const cacheSet = <K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  limit: number,
) => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size <= limit) {
    return;
  }
  const oldestKey = cache.keys().next().value;
  if (oldestKey !== undefined) {
    cache.delete(oldestKey);
  }
};

const toCalendarGroup = (value: string): MuscleGroup =>
  asMuscleGroup(value && value.trim() ? value : 'untracked');

const mapCalendarMuscles = (
  rows: CalendarMonthResponse['all_muscles'],
) =>
  rows.map(item => {
    const group = toCalendarGroup(item.group);
    return {
      group,
      count: item.count,
      color: getMuscleColor(group),
    };
  });

const mapCalendarPieData = (
  analytics: CalendarMonthResponse,
) =>
  analytics.pie_data.map(item => {
    const group = toCalendarGroup(item.label);
    return {
      key: asDisplayLabel(item.label),
      label: asDisplayLabel(formatLabel(group)),
      percent: item.percentage,
      color: getMuscleColor(group),
    };
  });

const createStyles = () => ({
  headerRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    borderBottomWidth: 1,
    borderColor: palette.border,
    gap: spacing(1),
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.surface,
  },
  headerActions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.75),
  },
  monthTitle: {
    flex: 1,
    alignItems: 'center' as const,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.mutedSurface,
  },
  todayButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.5),
    paddingHorizontal: spacing(1.5),
    paddingVertical: spacing(0.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
  },
  weekdayRow: {
    flexDirection: 'row' as const,
    paddingHorizontal: spacing(2),
    paddingBottom: spacing(1),
  },
  gridShadowWrap: {
    marginHorizontal: spacing(1.5),
    borderRadius: radius.card,
    backgroundColor: palette.surface,
    ...cardShadowStyle,
    overflow: 'visible' as const,
  },
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    paddingHorizontal: spacing(1.5),
    paddingBottom: spacing(1),
    backgroundColor: palette.surface,
    borderRadius: radius.card,
    borderWidth: 0,
    overflow: 'hidden' as const,
  },
  cell: {
    width: `${100 / DAYS_IN_WEEK}%`,
    paddingVertical: spacing(1.75),
    alignItems: 'center' as const,
    borderColor: addAlpha(palette.border, 0.7),
    position: 'relative' as const,
  } as ViewStyle,
  selectedOutline: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
  } as ViewStyle,
  dotRow: {
    flexDirection: 'row' as const,
    gap: 4,
    marginTop: spacing(1),
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  summaryCard: {
    marginHorizontal: spacing(2),
    marginBottom: spacing(1.5),
    gap: spacing(1),
  },
  summaryHeader: {
    gap: spacing(0.25),
  },
  summaryTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
  summarySubtitle: {
    color: palette.mutedText,
    fontSize: 12,
  },
  summaryBody: {
    flexDirection: 'row' as const,
    gap: spacing(2),
    alignItems: 'center' as const,
  },
  summaryLabel: {
    color: palette.mutedText,
    fontSize: 12,
    marginBottom: spacing(0.5),
  },
  summaryLink: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  summaryValue: {
    color: palette.text,
    fontSize: 12,
  },
  summaryRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.5),
    marginBottom: spacing(0.25),
  },
  summaryChart: {
    width: 80,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sheetOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: addAlpha(palette.text, 0.2),
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
  },
  sheetContainer: {
    width: '100%',
    maxHeight: '60%',
    backgroundColor: palette.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    ...cardShadowStyle,
    padding: spacing(2),
  } as ViewStyle,
  sheetRow: {
    paddingVertical: spacing(1),
    paddingHorizontal: spacing(0.5),
    borderRadius: radius.card,
  },
});

const formatLabel = (value: MuscleGroup) =>
  value
    .split('_')
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

export default CalendarScreen;
