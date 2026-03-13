import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  ListRenderItemInfo,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { DonutChart } from '../components/analytics/DonutChart';
import {
  computeCalendarMonthAnalytics,
  computeHomeDaysAnalytics,
  JsonObject,
} from '../TrackerEngine';
import {
  DistributionItem,
  HomeDayResponse,
  HomeDaysResponse,
} from '../domain/analytics';
import { roundToLocalDay } from '../timePolicy';
import { palette, radius, spacing } from '../ui/theme';
import { Card, EmptyState } from '../ui/components';
import { getMuscleColor } from '../ui/muscleColors';
import { formatMuscleLabel, formatPercent } from '../ui/formatters';
import ChevronLeftIcon from '../assets/chevron-left.svg';
import ChevronRightIcon from '../assets/chevron-right.svg';
import DumbbellIcon from '../assets/dumbbell.svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import {
  ColorHex,
  DisplayLabel,
  ExerciseName,
  MuscleGroup,
  asDisplayLabel,
  asExerciseName,
  asMuscleGroup,
  asScreenKey,
} from '../domain/types';
import { toAnalyticsInputEvents } from '../components/analytics/analyticsPayload';
import { strings } from '../i18n/strings';

type HomeDayModel = {
  date: Date;
  dayBucket: number;
  primaryLabel: string;
  secondaryLabel: string;
  sections: Array<{
    key: MuscleGroup;
    label: DisplayLabel;
    exercises: {
      name: ExerciseName;
      sets: { description: DisplayLabel; count: number }[];
      totalSets: number;
    }[];
  }>;
  emptyState: boolean;
  muscleChips: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  musclePieData: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  volumeChips: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  volumePieData: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>;
  totalSets: number;
  totalExercises: number;
  averageSets: number;
};

const HOME_PAGER_TOTAL_PAGES = 20001;
const HOME_PAGER_CENTER_INDEX = Math.floor(HOME_PAGER_TOTAL_PAGES / 2);
const DAY_MS = 24 * 60 * 60 * 1000;

const HomeScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const [expandedExercises, setExpandedExercises] = useState<
    Record<string, boolean>
  >({});
  const homeSplitMode = state.preferences.homeSplitMode;
  const styles = createStyles();
  const { events } = state;
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
  const offsetMinutes = -new Date().getTimezoneOffset();
  const eventPayload = useMemo(() => toAnalyticsInputEvents(events), [events]);
  const catalogPayload = useMemo(
    () => catalog as unknown as JsonObject[],
    [catalog],
  );
  const viewport = useWindowDimensions();
  const listRef = useRef<FlatList<number> | null>(null);
  const baseDateRef = useRef(new Date(selectedDate));
  const baseDayBucketRef = useRef(
    roundToLocalDay(selectedDate.getTime(), offsetMinutes),
  );
  const [currentIndex, setCurrentIndex] = useState(HOME_PAGER_CENTER_INDEX);
  const currentIndexRef = useRef(HOME_PAGER_CENTER_INDEX);
  const [windowCenterIndex, setWindowCenterIndex] = useState(
    HOME_PAGER_CENTER_INDEX,
  );
  const lastWindowCenterIndexRef = useRef(HOME_PAGER_CENTER_INDEX);
  const [pageWidth, setPageWidth] = useState(() => Math.max(viewport.width, 1));
  const pageIndices = useMemo(
    () =>
      Array.from({ length: HOME_PAGER_TOTAL_PAGES }, (_unused, index) => index),
    [],
  );
  const prewarmKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setExpandedExercises({});
  }, [selectedDate]);

  // Pre-warm native bridge cache for adjacent calendar months.
  useEffect(() => {
    const prewarmKey = `${state.eventsRevision}:${state.catalogRevision}:${offsetMinutes}`;
    if (prewarmKeyRef.current === prewarmKey) {
      return;
    }
    prewarmKeyRef.current = prewarmKey;

    const runPrewarm = () => {
      const currentMonth = startOfMonth(new Date());
      const prevMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - 1,
        1,
      );
      const nextMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        1,
      );

      [prevMonth, currentMonth, nextMonth].forEach(month => {
        const monthBucket = getMonthBucket(month);
        runWhenIdle(() => {
          computeCalendarMonthAnalytics(
            eventPayload,
            offsetMinutes,
            catalogPayload,
            { month_bucket: monthBucket },
            {
              trace: 'home/prewarm',
              cache: {
                enabled: true,
                eventsRevision: state.eventsRevision,
                catalogRevision: state.catalogRevision,
              },
            },
          );
        });
      });
    };

    const timer = setTimeout(runPrewarm, 1200);
    return () => clearTimeout(timer);
  }, [
    catalogPayload,
    eventPayload,
    offsetMinutes,
    state.catalogRevision,
    state.eventsRevision,
  ]);

  const buildDayModel = useCallback(
    (date: Date, analytics?: HomeDayResponse): HomeDayModel => {
      const dayBucket = roundToLocalDay(date.getTime(), offsetMinutes);
      const todayBucket = roundToLocalDay(Date.now());
      const isToday = dayBucket === todayBucket;
      const primaryLabel = isToday
        ? 'Today'
        : date.toLocaleDateString(undefined, { weekday: 'long' });
      const secondaryLabel = date.toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
      const resolved = analytics ?? emptyHomeDayResponse(dayBucket);
      const sections = mapHomeSections(resolved);
      const muscleChips = mapSplitItems(resolved.muscle_split);
      const volumeChips = mapSplitItems(resolved.volume_split);
      const musclePieData = collapseSplitItems(muscleChips);
      const volumePieData = collapseSplitItems(volumeChips);

      return {
        date,
        dayBucket,
        primaryLabel,
        secondaryLabel,
        sections,
        emptyState: resolved.empty_state,
        muscleChips,
        musclePieData,
        volumeChips,
        volumePieData,
        totalSets: resolved.totals.total_sets,
        totalExercises: resolved.totals.total_exercises,
        averageSets: resolved.totals.average_sets_per_exercise,
      };
    },
    [offsetMinutes],
  );

  const dayBucketForIndex = useCallback(
    (index: number) =>
      baseDayBucketRef.current + (index - HOME_PAGER_CENTER_INDEX) * DAY_MS,
    [],
  );

  const dateForIndex = useCallback((index: number) => {
    const date = new Date(baseDateRef.current);
    date.setDate(date.getDate() + (index - HOME_PAGER_CENTER_INDEX));
    return date;
  }, []);

  const indexForDayBucket = useCallback(
    (dayBucket: number) =>
      HOME_PAGER_CENTER_INDEX +
      Math.round((dayBucket - baseDayBucketRef.current) / DAY_MS),
    [],
  );

  const applyPagerIndex = useCallback((nextIndex: number) => {
    if (nextIndex === currentIndexRef.current) {
      return false;
    }
    currentIndexRef.current = nextIndex;
    setCurrentIndex(nextIndex);
    setWindowCenterIndex(nextIndex);
    lastWindowCenterIndexRef.current = nextIndex;
    return true;
  }, []);

  useEffect(() => {
    if (viewport.width <= 0) return;
    if (Math.abs(viewport.width - pageWidth) <= 1) return;
    setPageWidth(viewport.width);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: currentIndex, animated: false });
    });
  }, [currentIndex, pageWidth, viewport.width]);

  useEffect(() => {
    const selectedBucket = roundToLocalDay(
      selectedDate.getTime(),
      offsetMinutes,
    );
    let targetIndex = indexForDayBucket(selectedBucket);
    if (targetIndex < 0 || targetIndex >= HOME_PAGER_TOTAL_PAGES) {
      // Re-anchor when selected date moves outside the seeded index range.
      baseDateRef.current = new Date(selectedDate);
      baseDayBucketRef.current = selectedBucket;
      targetIndex = HOME_PAGER_CENTER_INDEX;
    }
    if (applyPagerIndex(targetIndex)) {
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: targetIndex, animated: false });
      });
    }
  }, [applyPagerIndex, indexForDayBucket, offsetMinutes, selectedDate]);

  const visibleBuckets = useMemo(() => {
    const buckets: number[] = [];
    const startIndex = Math.max(
      0,
      Math.min(currentIndex, windowCenterIndex) - 6,
    );
    const endIndex = Math.min(
      HOME_PAGER_TOTAL_PAGES - 1,
      Math.max(currentIndex, windowCenterIndex) + 6,
    );
    for (let index = startIndex; index <= endIndex; index += 1) {
      if (index < 0 || index >= HOME_PAGER_TOTAL_PAGES) continue;
      buckets.push(dayBucketForIndex(index));
    }
    return buckets;
  }, [currentIndex, dayBucketForIndex, windowCenterIndex]);
  const batchedDays = useMemo<HomeDaysResponse>(() => {
    if (!catalogPayload || visibleBuckets.length === 0) {
      return { days: [] };
    }
    return computeHomeDaysAnalytics(
      eventPayload,
      offsetMinutes,
      catalogPayload,
      {
        day_buckets: visibleBuckets,
      },
      {
        trace: 'home/day-change',
        cache: {
          enabled: true,
          eventsRevision: state.eventsRevision,
          catalogRevision: state.catalogRevision,
        },
      },
    );
  }, [
    catalogPayload,
    eventPayload,
    offsetMinutes,
    state.catalogRevision,
    state.eventsRevision,
    visibleBuckets,
  ]);
  const homeByBucket = useMemo(() => {
    const map = new Map<number, HomeDayResponse>();
    batchedDays.days.forEach(day => {
      map.set(day.day_bucket, day);
    });
    return map;
  }, [batchedDays.days]);
  const getModelForIndex = useCallback(
    (index: number) => {
      const date = dateForIndex(index);
      return buildDayModel(date, homeByBucket.get(dayBucketForIndex(index)));
    },
    [buildDayModel, dateForIndex, dayBucketForIndex, homeByBucket],
  );

  const currentModel = useMemo(
    () => getModelForIndex(currentIndex),
    [currentIndex, getModelForIndex],
  );

  const commitIndexFromOffset = useCallback(
    (offsetX: number) => {
      const width = Math.max(pageWidth, 1);
      const nextIndex = Math.max(
        0,
        Math.min(HOME_PAGER_TOTAL_PAGES - 1, Math.round(offsetX / width)),
      );
      if (!applyPagerIndex(nextIndex)) {
        return;
      }
      const selectedBucket = roundToLocalDay(
        selectedDate.getTime(),
        offsetMinutes,
      );
      const nextBucket = dayBucketForIndex(nextIndex);
      if (nextBucket !== selectedBucket) {
        actions.setSelectedDate(dateForIndex(nextIndex));
      }
    },
    [
      actions,
      applyPagerIndex,
      dateForIndex,
      dayBucketForIndex,
      offsetMinutes,
      pageWidth,
      selectedDate,
    ],
  );

  const handleMomentumScrollEnd = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      commitIndexFromOffset(event.nativeEvent.contentOffset.x);
    },
    [commitIndexFromOffset],
  );

  const handleScrollEndDrag = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      commitIndexFromOffset(event.nativeEvent.contentOffset.x);
    },
    [commitIndexFromOffset],
  );

  const handleListScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      const width = Math.max(pageWidth, 1);
      const nextIndex = Math.max(
        0,
        Math.min(
          HOME_PAGER_TOTAL_PAGES - 1,
          Math.round(event.nativeEvent.contentOffset.x / width),
        ),
      );
      if (nextIndex === lastWindowCenterIndexRef.current) {
        return;
      }
      lastWindowCenterIndexRef.current = nextIndex;
      setWindowCenterIndex(nextIndex);
    },
    [pageWidth],
  );

  const handleListLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number } } }) => {
      const nextWidth = Math.max(event.nativeEvent.layout.width, 1);
      if (Math.abs(nextWidth - pageWidth) <= 1) return;
      setPageWidth(nextWidth);
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({
          index: currentIndex,
          animated: false,
        });
      });
    },
    [currentIndex, pageWidth],
  );

  const getItemLayout = useCallback(
    (_unused: ArrayLike<number> | null | undefined, index: number) => ({
      length: pageWidth,
      offset: pageWidth * index,
      index,
    }),
    [pageWidth],
  );

  const renderPage = useCallback(
    ({ item: index }: ListRenderItemInfo<number>) => {
      const model = getModelForIndex(index);
      return (
        <View style={{ width: pageWidth, flex: 1 }}>
          <HomeDayContent
            model={model}
            date={model.date}
            expandedExercises={expandedExercises}
            setExpandedExercises={setExpandedExercises}
            onOpenLog={actions.openLogForExercise}
            splitMode={homeSplitMode}
            onSplitModeChange={mode =>
              dispatch({ type: 'preferences/homeSplitMode', mode })
            }
            styles={styles}
          />
        </View>
      );
    },
    [
      actions.openLogForExercise,
      dispatch,
      expandedExercises,
      getModelForIndex,
      homeSplitMode,
      pageWidth,
      styles,
    ],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.daySelector}>
        <TouchableOpacity
          onPress={() => actions.shiftDate(-1)}
          style={styles.arrowButton}
        >
          <ChevronLeftIcon width={20} height={20} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => actions.navigate(asScreenKey('calendar'), 'home')}
          style={{ alignItems: 'center' }}
        >
          <Text
            style={{ color: palette.text, fontSize: 24, fontWeight: '600' }}
          >
            {currentModel.primaryLabel}
          </Text>
          <Text style={{ color: palette.mutedText, fontSize: 14 }}>
            {currentModel.secondaryLabel}
          </Text>
        </TouchableOpacity>
        <View style={{ flexDirection: 'row', gap: spacing(0.75) }}>
          <TouchableOpacity
            onPress={() => actions.shiftDate(1)}
            style={styles.arrowButton}
          >
            <ChevronRightIcon width={20} height={20} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      <FlatList<number>
        ref={listRef}
        data={pageIndices}
        horizontal
        pagingEnabled
        style={{ flex: 1 }}
        showsHorizontalScrollIndicator={false}
        bounces={false}
        initialScrollIndex={HOME_PAGER_CENTER_INDEX}
        onLayout={handleListLayout}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        keyExtractor={index => `home-day-${index}`}
        renderItem={renderPage}
        getItemLayout={getItemLayout}
        keyboardShouldPersistTaps="handled"
        removeClippedSubviews
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        onScrollToIndexFailed={info => {
          requestAnimationFrame(() => {
            listRef.current?.scrollToIndex({
              index: info.index,
              animated: false,
            });
          });
        }}
      />
    </View>
  );
};

const HomeDayContent = ({
  model,
  date,
  expandedExercises,
  setExpandedExercises,
  onOpenLog,
  splitMode,
  onSplitModeChange,
  styles,
}: {
  model: HomeDayModel;
  date: Date;
  expandedExercises: Record<string, boolean>;
  setExpandedExercises: React.Dispatch<
    React.SetStateAction<Record<string, boolean>>
  >;
  onOpenLog: (
    exerciseName: ExerciseName | undefined,
    date: Date,
    tab: 'Track' | 'History' | 'Trends',
  ) => void;
  splitMode: 'muscle' | 'volume';
  onSplitModeChange: (mode: 'muscle' | 'volume') => void;
  styles: ReturnType<typeof createStyles>;
}) => {
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const [splitAnchor, setSplitAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const splitMenuAnim = useRef(new Animated.Value(0)).current;
  const splitTriggerRef = useRef<View | null>(null);
  const window = useWindowDimensions();
  const splitLabel = splitMode === 'muscle' ? 'Muscle Split' : 'Volume Split';
  const splitLegend =
    splitMode === 'muscle' ? model.musclePieData : model.volumePieData;
  const hasSplitData = splitLegend.length > 0;
  const showSplitEmpty = !hasSplitData && !model.emptyState;

  useEffect(() => {
    setSplitMenuOpen(false);
  }, [date, splitMode]);

  useEffect(() => {
    Animated.timing(splitMenuAnim, {
      toValue: splitMenuOpen ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [splitMenuAnim, splitMenuOpen]);

  const openSplitMenu = useCallback(() => {
    splitTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setSplitAnchor({ x, y, width, height });
      setSplitMenuOpen(true);
    });
  }, []);

  const toggleSplitMenu = useCallback(() => {
    if (splitMenuOpen) {
      setSplitMenuOpen(false);
      return;
    }
    openSplitMenu();
  }, [openSplitMenu, splitMenuOpen]);

  const splitMenuWidth = 154;
  const splitMenuTop =
    (splitAnchor?.y ?? spacing(6)) + (splitAnchor?.height ?? 0) + spacing(0.5);
  const splitMenuLeft = Math.max(
    spacing(1),
    Math.min(
      (splitAnchor?.x ?? spacing(2)) +
        (splitAnchor?.width ?? 0) -
        splitMenuWidth,
      window.width - splitMenuWidth - spacing(1),
    ),
  );

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing(2),
          paddingBottom: spacing(6),
          gap: spacing(2),
        }}
      >
        {!model.emptyState ? (
          <Card style={styles.heroCard}>
            <View style={{ flexDirection: 'row', gap: spacing(2) }}>
              {hasSplitData ? (
                <View style={styles.donutWrap}>
                  <DonutChart data={splitLegend} radius={44} />
                </View>
              ) : null}
              <View style={{ flex: 1, gap: spacing(1) }}>
                <View style={styles.splitHeader}>
                  <View
                    ref={splitTriggerRef}
                    collapsable={false}
                    style={styles.splitDropdownAnchor}
                  >
                    <TouchableOpacity
                      onPress={toggleSplitMenu}
                      style={styles.splitLabelRow}
                      accessibilityRole="button"
                      accessibilityLabel="Change split mode"
                    >
                      <Text style={styles.splitHeaderLabel}>{splitLabel}</Text>
                      <View style={styles.splitDropdownTrigger}>
                        <ChevronRightIcon
                          width={14}
                          height={14}
                          color={palette.mutedText}
                          style={{
                            transform: [
                              { rotate: splitMenuOpen ? '270deg' : '90deg' },
                            ],
                          }}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
                {hasSplitData ? (
                  <View style={{ gap: spacing(0.5) }}>
                    {splitLegend.map(chip => (
                      <View key={chip.key} style={styles.legendRow}>
                        <View style={styles.legendLabel}>
                          <View
                            style={[
                              styles.legendDot,
                              {
                                backgroundColor: chip.color ?? palette.primary,
                              },
                            ]}
                          />
                          <Text style={styles.legendText}>{chip.label}</Text>
                        </View>
                        <Text style={styles.legendValue}>
                          {formatPercent(chip.percent)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : showSplitEmpty ? (
                  <Text style={styles.splitEmptyHint}>
                    No {splitMode === 'volume' ? 'volume' : 'muscle'} data for
                    this day
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statTitle}>Sets logged</Text>
                <View>
                  <Text style={styles.statValue}>{model.totalSets} sets</Text>
                  <Text style={styles.statMuted}>{model.averageSets} avg</Text>
                </View>
              </View>
            </View>
          </Card>
        ) : null}

        {model.emptyState ? (
          <Card style={styles.emptySetsCard}>
            <EmptyState
              title={strings.empty.noSetsToday}
              subtitle={strings.empty.noSetsSubtitle}
              actionLabel={strings.navigation.startWorkout}
              onPress={() => actions.pushScreen(asScreenKey('browser'))}
              icon={<DumbbellIcon width={48} height={48} fill={palette.mutedText} />}
            />
          </Card>
        ) : null}

        {model.emptyState ? null : (
          <Card style={styles.listContainer}>
            {model.sections.map((section, sectionIndex) => (
              <View key={section.key} style={styles.sectionBlock}>
                <Text style={styles.sectionLabel}>{section.label}</Text>
                {section.exercises.map((exercise, index) => (
                  <TouchableOpacity
                    key={`${section.key}-${exercise.name}-${index}`}
                    onPress={() => onOpenLog(exercise.name, date, 'Track')}
                    activeOpacity={0.78}
                    style={[
                      styles.listRow,
                      index !== section.exercises.length - 1 &&
                        styles.listRowDivider,
                    ]}
                  >
                    {(() => {
                      const exerciseKey = `${section.key}-${exercise.name}`;
                      const isExpanded = Boolean(
                        expandedExercises[exerciseKey],
                      );
                      const hasOverflow =
                        exercise.sets.length > MAX_SET_PREVIEW;
                      const visibleSets = isExpanded
                        ? exercise.sets
                        : exercise.sets.slice(0, MAX_SET_PREVIEW);
                      return (
                        <View style={{ flex: 1, gap: spacing(0.5) }}>
                          <Text 
                            style={styles.exerciseTitle}
                            numberOfLines={2}
                            ellipsizeMode="tail"
                          >
                            {exercise.name}
                          </Text>
                          <View style={{ gap: spacing(0.25) }}>
                            {visibleSets.map((setItem, chunkIndex) => (
                              <Text
                                key={`${exercise.name}-${chunkIndex}`}
                                style={styles.exerciseMeta}
                              >
                                {formatSetLabel(setItem)}
                              </Text>
                            ))}
                            {hasOverflow && !isExpanded ? (
                              <View style={styles.moreSetsRow}>
                                <Text style={styles.exerciseMeta}>
                                  {(() => {
                                    const hiddenCount = countHiddenSets(
                                      exercise.sets,
                                      MAX_SET_PREVIEW,
                                    );
                                    return `+ ${hiddenCount} more ${
                                      hiddenCount === 1 ? 'set' : 'sets'
                                    }`;
                                  })()}
                                </Text>
                                <TouchableOpacity
                                  onPress={event => {
                                    event.stopPropagation?.();
                                    setExpandedExercises(previous => ({
                                      ...previous,
                                      [exerciseKey]: true,
                                    }));
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.showMoreLink,
                                      { color: palette.primary },
                                    ]}
                                  >
                                    Show all
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                            {hasOverflow && isExpanded ? (
                              <TouchableOpacity
                                onPress={event => {
                                  event.stopPropagation?.();
                                  setExpandedExercises(previous => ({
                                    ...previous,
                                    [exerciseKey]: false,
                                  }));
                                }}
                              >
                                <Text
                                  style={[
                                    styles.showMoreLink,
                                    { color: palette.primary },
                                  ]}
                                >
                                  Show fewer
                                </Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>
                      );
                    })()}
                    <View style={styles.setCountPill}>
                      <Text style={styles.setCountText}>{`${
                        exercise.totalSets
                      } ${exercise.totalSets === 1 ? 'set' : 'sets'}`}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
                {sectionIndex !== model.sections.length - 1 ? (
                  <View style={styles.sectionDivider} />
                ) : null}
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
      <Modal
        visible={splitMenuOpen}
        transparent
        animationType="none"
        onRequestClose={() => setSplitMenuOpen(false)}
      >
        <Pressable
          style={styles.dropdownBackdrop}
          onPress={() => setSplitMenuOpen(false)}
        />
        <Animated.View
          style={[
            styles.splitInlineDropdown,
            {
              width: splitMenuWidth,
              left: splitMenuLeft,
              top: splitMenuTop,
              opacity: splitMenuAnim,
              transform: [
                {
                  translateY: splitMenuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 0],
                  }),
                },
                {
                  scale: splitMenuAnim.interpolate({
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
              onSplitModeChange('muscle');
              setSplitMenuOpen(false);
            }}
            style={styles.splitInlineOption}
          >
            <Text
              style={[
                styles.splitInlineOptionText,
                splitMode === 'muscle' && styles.splitInlineOptionTextActive,
              ]}
            >
              Muscle Split
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              onSplitModeChange('volume');
              setSplitMenuOpen(false);
            }}
            style={styles.splitInlineOption}
          >
            <Text
              style={[
                styles.splitInlineOptionText,
                splitMode === 'volume' && styles.splitInlineOptionTextActive,
              ]}
            >
              Volume Split
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </Modal>
    </View>
  );
};

type SetChunk = { description: DisplayLabel; count: number };
const MAX_SET_PREVIEW = 4;

const toMuscleGroup = (value: string | null | undefined): MuscleGroup =>
  asMuscleGroup(value && value.trim() ? value : 'untracked');

const toSplitLabel = (group: MuscleGroup): DisplayLabel =>
  formatMuscleLabel(group);

const mapSplitItems = (
  items: DistributionItem[],
): Array<{
  key: DisplayLabel;
  label: DisplayLabel;
  color?: ColorHex;
  percent: number;
}> =>
  items.map(item => {
    const group = toMuscleGroup(item.label);
    return {
      key: asDisplayLabel(item.label),
      label: toSplitLabel(group),
      color: getMuscleColor(group),
      percent: item.percentage,
    };
  });

const collapseSplitItems = (
  items: Array<{
    key: DisplayLabel;
    label: DisplayLabel;
    color?: ColorHex;
    percent: number;
  }>,
) =>
  items.length <= 4
    ? items
    : [
        ...items.slice(0, 3),
        {
          key: asDisplayLabel('other'),
          label: asDisplayLabel('Other'),
          color: palette.mutedSurface,
          percent: items.slice(3).reduce((sum, item) => sum + item.percent, 0),
        },
      ];

const mapHomeSections = (
  analytics: HomeDayResponse,
): HomeDayModel['sections'] =>
  analytics.sections.map(section => ({
    key: toMuscleGroup(section.key),
    label: asDisplayLabel(section.label),
    exercises: section.exercises.map(exercise => ({
      name: asExerciseName(exercise.exercise),
      sets: exercise.set_chunks.map(chunk => ({
        description: asDisplayLabel(chunk.description),
        count: chunk.count,
      })),
      totalSets: exercise.total_sets,
    })),
  }));

const emptyHomeDayResponse = (dayBucket: number): HomeDayResponse => ({
  day_bucket: dayBucket,
  empty_state: true,
  totals: {
    total_sets: 0,
    total_exercises: 0,
    average_sets_per_exercise: 0,
  },
  sections: [],
  muscle_split: [],
  volume_split: [],
});

const formatSetLabel = (chunk: SetChunk): DisplayLabel => {
  if (chunk.count === 1) {
    return chunk.description;
  }
  return asDisplayLabel(`${chunk.count} sets · ${chunk.description}`);
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const getMonthBucket = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1).getTime();

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

const createStyles = () => ({
  daySelector: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.25),
    borderBottomWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.background,
  },
  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: palette.surface,
  },
  heroCard: {
    paddingVertical: spacing(2),
    gap: spacing(1.5),
  },
  splitHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: spacing(1),
  },
  splitDropdownAnchor: {
    alignSelf: 'flex-start' as const,
  },
  splitLabelRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.25),
    paddingVertical: spacing(0.25),
    paddingRight: spacing(0.25),
  },
  splitHeaderLabel: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
    flexShrink: 1 as const,
  },
  splitDropdownTrigger: {
    width: 18,
    height: 18,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  splitInlineDropdown: {
    position: 'absolute' as const,
    backgroundColor: palette.mutedSurface,
    borderRadius: radius.card,
    overflow: 'hidden' as const,
    zIndex: 120,
  },
  splitInlineOption: {
    minHeight: 32,
    paddingHorizontal: spacing(1.5),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  splitInlineOptionText: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  splitInlineOptionTextActive: {
    color: palette.primary,
  },
  dropdownBackdrop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  splitEmptyHint: {
    color: palette.mutedText,
    fontSize: 12,
  },
  donutWrap: {
    width: 96,
    height: 96,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.mutedSurface,
  },
  legendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
  },
  legendLabel: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.5),
  },
  legendText: {
    color: palette.text,
    fontWeight: '600' as const,
    fontSize: 12,
  },
  legendValue: {
    color: palette.mutedText,
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row' as const,
    gap: spacing(1.5),
  },
  emptySetsCard: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: spacing(4),
  },
  emptySetsText: {
    color: palette.mutedText,
    fontSize: 20,
    fontWeight: '600' as const,
  },
  statCard: {
    flex: 1,
    paddingVertical: spacing(1.5),
    gap: spacing(1),
  },
  statTitle: {
    color: palette.text,
    fontWeight: '600' as const,
    fontSize: 14,
  },
  statValue: {
    color: palette.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  statMuted: {
    color: palette.mutedText,
    fontSize: 12,
  },
  listContainer: {
    padding: spacing(2),
    gap: spacing(1.5),
  },
  sectionBlock: {
    gap: spacing(0.75),
  },
  sectionLabel: {
    color: palette.mutedText,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  },
  listRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'flex-start' as const,
    paddingVertical: spacing(1),
  },
  listRowDivider: {
    borderBottomWidth: 1,
    borderColor: palette.border,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: palette.border,
    marginTop: spacing(1),
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  exerciseTitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  exerciseMeta: {
    color: palette.mutedText,
    fontSize: 12,
  },
  setCountPill: {
    paddingHorizontal: spacing(1.25),
    paddingVertical: spacing(0.5),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.mutedSurface,
    alignSelf: 'flex-start' as const,
  },
  setCountText: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  moreSetsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(0.5),
  },
  showMoreLink: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
});

const countHiddenSets = (chunks: SetChunk[], maxShown: number) =>
  chunks.slice(maxShown).reduce((total, chunk) => total + chunk.count, 0);

export default HomeScreen;
