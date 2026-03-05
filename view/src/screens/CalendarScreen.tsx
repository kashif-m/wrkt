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
  InteractionManager,
  FlatList,
  StyleSheet,
  ViewStyle,
  TouchableWithoutFeedback,
  useWindowDimensions,
} from 'react-native';
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
const CALENDAR_TOTAL_PAGES = 2401;
const CALENDAR_CENTER_INDEX = Math.floor(CALENDAR_TOTAL_PAGES / 2);
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
const EMPTY_MONTH_STATS: CalendarMonthStats = {
  sessions: 0,
  attendance: 0,
  isFutureMonth: false,
  topMuscles: [],
  allMuscles: [],
  pieData: [],
};

const CalendarScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const events = state.events;
  const offsetMinutes = -new Date().getTimezoneOffset();
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
  const eventPayload = useMemo(() => toAnalyticsInputEvents(events), [events]);
  const catalogPayload = useMemo(
    () => catalog as unknown as JsonObject[],
    [catalog],
  );
  const visibleMonth = state.calendar.visibleMonth;
  const yearSheetOpen = state.calendar.yearSheetOpen;
  const viewport = useWindowDimensions();
  const listRef = useRef<FlatList<number> | null>(null);
  const baseMonthRef = useRef(startOfMonth(visibleMonth));
  const currentIndexRef = useRef(CALENDAR_CENTER_INDEX);
  const [windowCenterIndex, setWindowCenterIndex] = useState(
    CALENDAR_CENTER_INDEX,
  );
  const lastWindowCenterIndexRef = useRef(CALENDAR_CENTER_INDEX);
  const [pageWidth, setPageWidth] = useState(() => Math.max(viewport.width, 1));
  const pageIndices = useMemo(
    () =>
      Array.from({ length: CALENDAR_TOTAL_PAGES }, (_unused, index) => index),
    [],
  );
  const committedMonthRef = useRef(startOfMonth(visibleMonth));
  const monthStatsCacheRef = useRef<Map<string, CalendarMonthStats>>(new Map());
  const pendingMonthStatsRef = useRef<Set<string>>(new Set());
  const statsRevisionTokenRef = useRef(0);
  const monthDaysCacheRef = useRef<Map<number, Date[]>>(new Map());
  const sheetTranslate = useRef(new Animated.Value(0)).current;
  const [showAllMuscles, setShowAllMuscles] = useState(false);
  const [, setStatsVersion] = useState(0);
  const styles = useMemo(createStyles, []);

  useEffect(() => {
    if (yearSheetOpen) {
      sheetTranslate.setValue(0);
    }
  }, [yearSheetOpen, sheetTranslate]);

  useEffect(() => {
    setShowAllMuscles(false);
  }, [visibleMonth]);

  useEffect(() => {
    committedMonthRef.current = startOfMonth(visibleMonth);
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

  const monthForIndex = useCallback((index: number) => {
    return shiftMonth(baseMonthRef.current, index - CALENDAR_CENTER_INDEX);
  }, []);

  const indexForMonth = useCallback((month: Date) => {
    const base = baseMonthRef.current;
    const delta =
      (month.getFullYear() - base.getFullYear()) * 12 +
      (month.getMonth() - base.getMonth());
    return CALENDAR_CENTER_INDEX + delta;
  }, []);

  const applyIndex = useCallback((nextIndex: number) => {
    if (nextIndex === currentIndexRef.current) {
      return false;
    }
    currentIndexRef.current = nextIndex;
    setWindowCenterIndex(nextIndex);
    lastWindowCenterIndexRef.current = nextIndex;
    return true;
  }, []);

  useEffect(() => {
    if (viewport.width <= 0) return;
    if (Math.abs(viewport.width - pageWidth) <= 1) return;
    setPageWidth(viewport.width);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        index: currentIndexRef.current,
        animated: false,
      });
    });
  }, [pageWidth, viewport.width]);

  useEffect(() => {
    let targetIndex = indexForMonth(startOfMonth(visibleMonth));
    if (targetIndex < 0 || targetIndex >= CALENDAR_TOTAL_PAGES) {
      baseMonthRef.current = startOfMonth(visibleMonth);
      targetIndex = CALENDAR_CENTER_INDEX;
    }
    if (applyIndex(targetIndex)) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      });
    }
  }, [applyIndex, indexForMonth, visibleMonth]);

  const getMonthStatsKey = useCallback(
    (month: Date) =>
      `${getMonthBucket(month)}:${state.eventsRevision}:${
        state.catalogRevision
      }:${offsetMinutes}`,
    [offsetMinutes, state.catalogRevision, state.eventsRevision],
  );
  const getMonthStatsFromCache = useCallback(
    (month: Date): CalendarMonthStats | null => {
      const cacheKey = getMonthStatsKey(month);
      return monthStatsCacheRef.current.get(cacheKey) ?? null;
    },
    [getMonthStatsKey],
  );
  const computeAndStoreMonthStats = useCallback(
    (month: Date, token: number) => {
      const monthBucket = getMonthBucket(month);
      const cacheKey = getMonthStatsKey(month);
      if (monthStatsCacheRef.current.has(cacheKey)) {
        pendingMonthStatsRef.current.delete(cacheKey);
        return;
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
      if (token !== statsRevisionTokenRef.current) {
        pendingMonthStatsRef.current.delete(cacheKey);
        return;
      }
      const stats: CalendarMonthStats = {
        sessions: analytics.sessions,
        attendance: analytics.attendance_percent,
        isFutureMonth: analytics.is_future_month,
        topMuscles: mapCalendarMuscles(analytics.top_muscles),
        allMuscles: mapCalendarMuscles(analytics.all_muscles),
        pieData: mapCalendarPieData(analytics),
      };
      cacheSet(
        monthStatsCacheRef.current,
        cacheKey,
        stats,
        MONTH_STATS_CACHE_LIMIT,
      );
      pendingMonthStatsRef.current.delete(cacheKey);
      setStatsVersion(version => version + 1);
    },
    [
      catalogPayload,
      eventPayload,
      getMonthStatsKey,
      offsetMinutes,
      state.catalogRevision,
      state.eventsRevision,
    ],
  );
  const requestMonthStats = useCallback(
    (month: Date, priority: 'high' | 'low') => {
      const cacheKey = getMonthStatsKey(month);
      if (
        monthStatsCacheRef.current.has(cacheKey) ||
        pendingMonthStatsRef.current.has(cacheKey)
      ) {
        return;
      }
      pendingMonthStatsRef.current.add(cacheKey);
      const token = statsRevisionTokenRef.current;
      const run = () => computeAndStoreMonthStats(month, token);
      if (priority === 'high') {
        requestAnimationFrame(run);
        return;
      }
      InteractionManager.runAfterInteractions(run);
    },
    [computeAndStoreMonthStats, getMonthStatsKey],
  );
  useEffect(() => {
    statsRevisionTokenRef.current += 1;
    monthStatsCacheRef.current.clear();
    pendingMonthStatsRef.current.clear();
    setStatsVersion(version => version + 1);
  }, [offsetMinutes, state.catalogRevision, state.eventsRevision]);
  const centerMonth = useMemo(
    () => monthForIndex(windowCenterIndex),
    [monthForIndex, windowCenterIndex],
  );
  useEffect(() => {
    requestMonthStats(centerMonth, 'high');
    requestMonthStats(shiftMonth(centerMonth, -1), 'low');
    requestMonthStats(shiftMonth(centerMonth, 1), 'low');
  }, [centerMonth, requestMonthStats]);
  const getMonthDays = useCallback((month: Date) => {
    const monthBucket = getMonthBucket(month);
    const cached = monthDaysCacheRef.current.get(monthBucket);
    if (cached) {
      return cached;
    }
    const days = buildCalendarDays(month);
    cacheSet(
      monthDaysCacheRef.current,
      monthBucket,
      days,
      MONTH_DAYS_CACHE_LIMIT,
    );
    return days;
  }, []);
  const getPageModel = useCallback(
    (index: number) => {
      const month = monthForIndex(index);
      return {
        key: `${month.getFullYear()}-${month.getMonth()}`,
        month,
        days: getMonthDays(month),
        stats: getMonthStatsFromCache(month),
      };
    },
    [getMonthDays, getMonthStatsFromCache, monthForIndex],
  );
  const selectedDayBucket = useMemo(
    () => roundToLocalDay(selectedDate.getTime()),
    [selectedDate],
  );
  const displayMonth = centerMonth;
  const monthLabel = displayMonth.toLocaleDateString(undefined, {
    month: 'long',
  });
  const yearLabel = displayMonth.getFullYear();
  const yearOptions = useMemo(() => {
    const base = displayMonth.getFullYear() - 25;
    return Array.from({ length: 60 }, (_, index) => base + index);
  }, [displayMonth]);

  const setPreviewIndex = useCallback(
    (nextIndex: number) => {
      applyIndex(nextIndex);
    },
    [applyIndex],
  );

  const commitIndex = useCallback(
    (nextIndex: number) => {
      setPreviewIndex(nextIndex);
      const targetMonth = monthForIndex(nextIndex);
      const currentMonth = committedMonthRef.current;
      const currentMonthKey =
        currentMonth.getFullYear() * 12 + currentMonth.getMonth();
      const targetMonthKey =
        targetMonth.getFullYear() * 12 + targetMonth.getMonth();
      if (currentMonthKey !== targetMonthKey) {
        committedMonthRef.current = startOfMonth(targetMonth);
        dispatch({ type: 'calendar/visibleMonth', date: targetMonth });
      }
    },
    [dispatch, monthForIndex, setPreviewIndex],
  );

  const commitIndexFromOffset = useCallback(
    (offsetX: number) => {
      const width = Math.max(pageWidth, 1);
      const nextIndex = Math.max(
        0,
        Math.min(CALENDAR_TOTAL_PAGES - 1, Math.round(offsetX / width)),
      );
      commitIndex(nextIndex);
    },
    [commitIndex, pageWidth],
  );

  const handleShift = useCallback(
    (delta: number) => {
      const nextIndex = Math.max(
        0,
        Math.min(CALENDAR_TOTAL_PAGES - 1, currentIndexRef.current + delta),
      );
      if (nextIndex === currentIndexRef.current) {
        return;
      }
      listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      commitIndex(nextIndex);
    },
    [commitIndex],
  );
  const handleMomentumScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      commitIndexFromOffset(event.nativeEvent.contentOffset.x);
    },
    [commitIndexFromOffset],
  );
  const handleListScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const width = Math.max(pageWidth, 1);
      const thresholdOffset = event.nativeEvent.contentOffset.x + width * 0.5;
      const nextIndex = Math.max(
        0,
        Math.min(CALENDAR_TOTAL_PAGES - 1, Math.floor(thresholdOffset / width)),
      );
      if (nextIndex === lastWindowCenterIndexRef.current) {
        return;
      }
      setPreviewIndex(nextIndex);
    },
    [pageWidth, setPreviewIndex],
  );
  const handleListLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      const nextWidth = Math.max(event.nativeEvent.layout.width, 1);
      if (Math.abs(nextWidth - pageWidth) <= 1) return;
      setPageWidth(nextWidth);
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: currentIndexRef.current,
          animated: false,
        });
      });
    },
    [pageWidth],
  );
  const jumpToMonth = useCallback(
    (targetDate: Date, animated: boolean) => {
      const targetMonth = startOfMonth(targetDate);
      let targetIndex = indexForMonth(targetMonth);
      if (targetIndex < 0 || targetIndex >= CALENDAR_TOTAL_PAGES) {
        baseMonthRef.current = targetMonth;
        targetIndex = CALENDAR_CENTER_INDEX;
      }
      listRef.current?.scrollToIndex({ index: targetIndex, animated });
      commitIndex(targetIndex);
    },
    [commitIndex, indexForMonth],
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
              jumpToMonth(today, true);
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

      <FlatList
        ref={listRef}
        data={pageIndices}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={5}
        initialScrollIndex={CALENDAR_CENTER_INDEX}
        keyExtractor={index => `calendar-month-${index}`}
        getItemLayout={(_unused, index) => ({
          length: pageWidth,
          offset: pageWidth * index,
          index,
        })}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        onLayout={handleListLayout}
        renderItem={({ item: index }) => {
          const page = getPageModel(index);
          const monthStats = page.stats;
          const hasMonthStats = monthStats !== null;
          const safeMonthStats = monthStats ?? EMPTY_MONTH_STATS;
          return (
            <View style={{ width: pageWidth, flex: 1 }}>
              <ScrollView
                contentContainerStyle={{
                  paddingTop: spacing(1.5),
                  paddingBottom: spacing(6),
                }}
              >
                <Card variant="analytics" style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryTitle}>Monthly summary</Text>
                    <Text style={styles.summarySubtitle}>
                      {hasMonthStats
                        ? `${
                            safeMonthStats.sessions
                          } sessions • ${formatPercent(
                            safeMonthStats.attendance,
                          )} attendance`
                        : 'Loading monthly summary...'}
                    </Text>
                  </View>
                  {!hasMonthStats ? (
                    <Text style={styles.summaryValue}>
                      Computing month stats...
                    </Text>
                  ) : safeMonthStats.sessions === 0 ? (
                    <Text style={styles.summaryValue}>
                      {safeMonthStats.isFutureMonth
                        ? 'No sessions logged yet'
                        : 'No sessions logged'}
                    </Text>
                  ) : (
                    <View style={styles.summaryBody}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.summaryRow}>
                          <Text style={styles.summaryLabel}>
                            Top muscle groups
                          </Text>
                          {safeMonthStats.allMuscles.length > 3 ? (
                            <TouchableOpacity
                              onPress={() =>
                                setShowAllMuscles(current => !current)
                              }
                            >
                              <Text style={styles.summaryLink}>
                                {showAllMuscles ? 'Show less' : 'Show all'}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        {(showAllMuscles
                          ? safeMonthStats.allMuscles
                          : safeMonthStats.topMuscles
                        ).map(item => (
                          <View key={item.group} style={styles.summaryRow}>
                            <View
                              style={[
                                styles.dot,
                                { backgroundColor: item.color },
                              ]}
                            />
                            <Text style={styles.summaryValue}>
                              {formatLabel(item.group)} · {item.count}
                            </Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.summaryChart}>
                        <DonutChart data={safeMonthStats.pieData} radius={38} />
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
                    {page.days.map((day, indexInMonth) => {
                      const dateKey = roundToLocalDay(day.getTime());
                      const colors = dayColorMap.get(dateKey) ?? [];
                      const isCurrentMonth =
                        day.getMonth() === page.month.getMonth();
                      const isSelected = selectedDayBucket === dateKey;
                      const isWeekend =
                        day.getDay() === 0 || day.getDay() === 6;
                      const isLastColumn =
                        (indexInMonth + 1) % DAYS_IN_WEEK === 0;
                      const isLastRow =
                        indexInMonth >= TOTAL_CELLS - DAYS_IN_WEEK;
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
            </View>
          );
        }}
      />

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
                        const target = new Date(displayMonth);
                        target.setFullYear(year, target.getMonth(), 1);
                        const currentMonthKey =
                          displayMonth.getFullYear() * 12 +
                          displayMonth.getMonth();
                        const targetMonthKey =
                          target.getFullYear() * 12 + target.getMonth();
                        if (targetMonthKey !== currentMonthKey) {
                          jumpToMonth(target, true);
                        }
                        dispatch({ type: 'calendar/yearSheet', open: false });
                      }}
                      style={[
                        styles.sheetRow,
                        displayMonth.getFullYear() === year && {
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

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const getMonthBucket = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1).getTime();

const cacheSet = <K, V>(cache: Map<K, V>, key: K, value: V, limit: number) => {
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

const mapCalendarMuscles = (rows: CalendarMonthResponse['all_muscles']) =>
  rows.map(item => {
    const group = toCalendarGroup(item.group);
    return {
      group,
      count: item.count,
      color: getMuscleColor(group),
    };
  });

const mapCalendarPieData = (analytics: CalendarMonthResponse) =>
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
