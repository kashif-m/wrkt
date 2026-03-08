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
type CalendarDayCell = {
  date: Date;
  dayBucket: number;
};
type CalendarPageModel = {
  key: string;
  month: Date;
  days: CalendarDayCell[];
  stats: CalendarMonthStats | null;
};

// Module-level cache that persists across navigation
export const globalMonthStatsCache = new Map<string, CalendarMonthStats>();
export const globalPendingMonthStats = new Set<string>();
const globalPrevRevisions = {
  eventsRevision: -1,
  catalogRevision: -1,
};
const globalDayColorMapCache = {
  eventsRevision: -1,
  catalogRevision: -1,
  value: null as Map<number, ColorHex[]> | null,
};

const CalendarScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const events = state.events;
  const offsetMinutes = -new Date().getTimezoneOffset();
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
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
  const statsRevisionTokenRef = useRef(0);
  const committedMonthRef = useRef(startOfMonth(visibleMonth));
  const monthStatsCacheRef = useRef(globalMonthStatsCache);
  const pendingMonthStatsRef = useRef(globalPendingMonthStats);
  const monthDaysCacheRef = useRef<Map<string, CalendarDayCell[]>>(new Map());
  const monthInputCacheRef = useRef<Map<string, JsonObject[]>>(new Map());
  const sheetTranslate = useRef(new Animated.Value(0)).current;
  const [showAllMuscles, setShowAllMuscles] = useState(false);
  const [statsVersion, setStatsVersion] = useState(0);
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
    const cached = globalDayColorMapCache.value;
    if (
      cached &&
      globalDayColorMapCache.eventsRevision === state.eventsRevision &&
      globalDayColorMapCache.catalogRevision === state.catalogRevision
    ) {
      return cached;
    }

    const buckets = new Map<number, ColorHex[]>();
    events.forEach(event => {
      const day = readEventDayBucket(event);
      if (day === null) {
        return;
      }
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

    globalDayColorMapCache.eventsRevision = state.eventsRevision;
    globalDayColorMapCache.catalogRevision = state.catalogRevision;
    globalDayColorMapCache.value = buckets;
    return buckets;
  }, [catalogMap, events, state.catalogRevision, state.eventsRevision]);

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
      `${getMonthBucket(month)}:${offsetMinutes}:${state.eventsRevision}:${
        state.catalogRevision
      }`,
    [offsetMinutes, state.catalogRevision, state.eventsRevision],
  );
  const computeAndStoreMonthStats = useCallback(
    (month: Date, token: number) => {
      const monthBucket = getMonthBucket(month);
      const cacheKey = getMonthStatsKey(month);
      if (monthStatsCacheRef.current.has(cacheKey)) {
        pendingMonthStatsRef.current.delete(cacheKey);
        return;
      }
      let monthEvents = monthInputCacheRef.current.get(cacheKey);
      if (!monthEvents) {
        monthEvents = buildMonthInputEvents(events, monthBucket, offsetMinutes);
        cacheSet(
          monthInputCacheRef.current,
          cacheKey,
          monthEvents,
          MONTH_STATS_CACHE_LIMIT,
        );
      }
      const analytics = computeCalendarMonthAnalytics(
        monthEvents,
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
      events,
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
        globalMonthStatsCache.has(cacheKey) ||
        globalPendingMonthStats.has(cacheKey)
      ) {
        return;
      }
      globalPendingMonthStats.add(cacheKey);
      const token = statsRevisionTokenRef.current;
      const run = () => computeAndStoreMonthStats(month, token);
      if (priority === 'high') {
        requestAnimationFrame(run);
        return;
      }
      runWhenIdle(run);
    },
    [computeAndStoreMonthStats, getMonthStatsKey],
  );
  useEffect(() => {
    // Track data changes for cache invalidation
    const hasEventsChanged =
      globalPrevRevisions.eventsRevision !== -1 &&
      globalPrevRevisions.eventsRevision !== state.eventsRevision;
    const hasCatalogChanged =
      globalPrevRevisions.catalogRevision !== -1 &&
      globalPrevRevisions.catalogRevision !== state.catalogRevision;

    if (hasEventsChanged || hasCatalogChanged) {
      statsRevisionTokenRef.current += 1;
      // Note: We DON'T clear the cache here - let it serve stale data while recomputing
      setStatsVersion(version => version + 1);
    }

    // Always update tracking
    globalPrevRevisions.eventsRevision = state.eventsRevision;
    globalPrevRevisions.catalogRevision = state.catalogRevision;
  }, [state.catalogRevision, state.eventsRevision]);
  const centerMonth = useMemo(
    () => monthForIndex(windowCenterIndex),
    [monthForIndex, windowCenterIndex],
  );
  useEffect(() => {
    requestMonthStats(centerMonth, 'high');
    requestMonthStats(shiftMonth(centerMonth, -1), 'low');
    requestMonthStats(shiftMonth(centerMonth, 1), 'low');
  }, [centerMonth, requestMonthStats]);
  const getMonthDays = useCallback(
    (month: Date): CalendarDayCell[] => {
      const monthCacheKey = `${getMonthBucket(month)}:${offsetMinutes}`;
      const cached = monthDaysCacheRef.current.get(monthCacheKey);
      if (cached) {
        return cached;
      }
      const days = buildCalendarDays(month, offsetMinutes);
      cacheSet(
        monthDaysCacheRef.current,
        monthCacheKey,
        days,
        MONTH_DAYS_CACHE_LIMIT,
      );
      return days;
    },
    [offsetMinutes],
  );
  const getPageModel = useCallback(
    (index: number): CalendarPageModel => {
      const month = monthForIndex(index);
      const cacheKey = getMonthStatsKey(month);
      const stats = globalMonthStatsCache.get(cacheKey) ?? null;

      return {
        key: `${month.getFullYear()}-${month.getMonth()}`,
        month,
        days: getMonthDays(month),
        stats,
      };
    },
    [getMonthDays, getMonthStatsKey, monthForIndex],
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

  const handleSelectDay = useCallback(
    (day: Date) => {
      actions.setSelectedDate(new Date(day));
      actions.navigate(asScreenKey('home'), 'calendar');
    },
    [actions],
  );

  const toggleAllMuscles = useCallback(() => {
    setShowAllMuscles(current => !current);
  }, []);

  const renderMonthItem = useCallback(
    ({ item: index }: { item: number }) => {
      const page = getPageModel(index);
      return (
        <CalendarMonthPage
          page={page}
          pageWidth={pageWidth}
          styles={styles}
          dayColorMap={dayColorMap}
          selectedDayBucket={selectedDayBucket}
          showAllMuscles={showAllMuscles}
          onToggleShowAllMuscles={toggleAllMuscles}
          onSelectDay={handleSelectDay}
        />
      );
    },
    [
      dayColorMap,
      getPageModel,
      handleSelectDay,
      pageWidth,
      selectedDayBucket,
      showAllMuscles,
      styles,
      toggleAllMuscles,
    ],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => actions.navigate(asScreenKey('home'), 'calendar')}
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
        extraData={statsVersion}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        bounces={false}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
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
        renderItem={renderMonthItem}
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

type CalendarMonthPageProps = {
  page: CalendarPageModel;
  pageWidth: number;
  styles: ReturnType<typeof createStyles>;
  dayColorMap: Map<number, ColorHex[]>;
  selectedDayBucket: number;
  showAllMuscles: boolean;
  onToggleShowAllMuscles: () => void;
  onSelectDay: (day: Date) => void;
};

const CalendarMonthPage = React.memo(
  ({
    page,
    pageWidth,
    styles,
    dayColorMap,
    selectedDayBucket,
    showAllMuscles,
    onToggleShowAllMuscles,
    onSelectDay,
  }: CalendarMonthPageProps) => {
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
                  ? `${safeMonthStats.sessions} sessions • ${formatPercent(
                      safeMonthStats.attendance,
                    )} attendance`
                  : 'Loading monthly summary...'}
              </Text>
            </View>
            {!hasMonthStats ? (
              <Text style={styles.summaryValue}>Computing month stats...</Text>
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
                    <Text style={styles.summaryLabel}>Top muscle groups</Text>
                    {safeMonthStats.allMuscles.length > 3 ? (
                      <TouchableOpacity onPress={onToggleShowAllMuscles}>
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
                        style={[styles.dot, { backgroundColor: item.color }]}
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
              {page.days.map((dayCell, indexInMonth) => {
                const dateKey = dayCell.dayBucket;
                const colors = dayColorMap.get(dateKey) ?? [];
                const isCurrentMonth =
                  dayCell.date.getMonth() === page.month.getMonth();
                const isSelected = selectedDayBucket === dateKey;
                const isWeekend =
                  dayCell.date.getDay() === 0 || dayCell.date.getDay() === 6;
                const isLastColumn = (indexInMonth + 1) % DAYS_IN_WEEK === 0;
                const isLastRow = indexInMonth >= TOTAL_CELLS - DAYS_IN_WEEK;
                return (
                  <TouchableOpacity
                    key={dayCell.date.toISOString()}
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
                    onPress={() => onSelectDay(dayCell.date)}
                  >
                    <Text
                      style={{
                        color: isWeekend ? palette.warning : palette.text,
                        fontWeight: '600',
                      }}
                    >
                      {dayCell.date.getDate()}
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
  },
  (prev, next) =>
    prev.pageWidth === next.pageWidth &&
    prev.page.key === next.page.key &&
    prev.page.days === next.page.days &&
    prev.page.stats === next.page.stats &&
    prev.styles === next.styles &&
    prev.dayColorMap === next.dayColorMap &&
    prev.selectedDayBucket === next.selectedDayBucket &&
    prev.showAllMuscles === next.showAllMuscles &&
    prev.onToggleShowAllMuscles === next.onToggleShowAllMuscles &&
    prev.onSelectDay === next.onSelectDay,
);

const buildCalendarDays = (month: Date, offsetMinutes: number) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = firstDay.getDay();
  const startDate = new Date(firstDay);
  startDate.setDate(firstDay.getDate() - offset);
  const days: CalendarDayCell[] = [];
  for (let i = 0; i < TOTAL_CELLS; i += 1) {
    const date = new Date(
      startDate.getFullYear(),
      startDate.getMonth(),
      startDate.getDate() + i,
    );
    days.push({
      date,
      dayBucket: roundToLocalDay(date.getTime(), offsetMinutes),
    });
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

const pickNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const pickString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const toAnalyticsInputEvent = (event: {
  ts: number;
  payload?: JsonObject;
}): JsonObject => {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const compactPayload: Record<string, unknown> = {};
  const exercise = pickString(payload.exercise);
  const exerciseSlug = pickString(payload.exercise_slug);
  const reps = pickNumber(payload.reps);
  const weight = pickNumber(payload.weight);
  const duration = pickNumber(payload.duration);
  const distance = pickNumber(payload.distance);

  if (exercise) compactPayload.exercise = exercise;
  if (exerciseSlug) compactPayload.exercise_slug = exerciseSlug;
  if (typeof reps === 'number') compactPayload.reps = reps;
  if (typeof weight === 'number') compactPayload.weight = weight;
  if (typeof duration === 'number') compactPayload.duration = duration;
  if (typeof distance === 'number') compactPayload.distance = distance;

  return {
    ts: event.ts,
    payload: compactPayload,
  } as JsonObject;
};

const buildMonthInputEvents = (
  events: Array<{ ts: number; payload?: JsonObject; meta?: JsonObject }>,
  monthBucket: number,
  offsetMinutes: number,
): JsonObject[] => {
  const filtered: JsonObject[] = [];
  events.forEach(event => {
    const dayBucket =
      readEventDayBucket(event) ?? roundToLocalDay(event.ts, offsetMinutes);
    const eventMonthBucket = getMonthBucket(new Date(dayBucket));
    if (eventMonthBucket !== monthBucket) {
      return;
    }
    filtered.push(toAnalyticsInputEvent(event));
  });
  return filtered;
};

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

const readBucket = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const readEventDayBucket = (event: {
  payload?: JsonObject;
  meta?: JsonObject;
}): number | null => {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const meta = (event.meta ?? {}) as Record<string, unknown>;
  return readBucket(payload.day_bucket) ?? readBucket(meta.day_bucket);
};

const runWhenIdle = (task: () => void) => {
  const idleAPI = globalThis as unknown as {
    requestIdleCallback?: (
      callback: (deadline: {
        didTimeout: boolean;
        timeRemaining: () => number;
      }) => void,
      options?: { timeout: number },
    ) => number;
  };
  if (typeof idleAPI.requestIdleCallback === 'function') {
    idleAPI.requestIdleCallback(() => task(), { timeout: 350 });
    return;
  }
  setTimeout(task, 32);
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
