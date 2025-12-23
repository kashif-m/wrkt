import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  ViewStyle,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { getMuscleColor } from '../ui/muscleColors';
import { roundToLocalDay } from '../timePolicy';
import { palette, radius, spacing } from '../ui/theme';
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
import {
  ColorHex,
  ExerciseName,
  MuscleGroup,
  asDisplayLabel,
  asExerciseName,
  asScreenKey,
} from '../domain/types';

const DAYS_IN_WEEK = 7;
const TOTAL_CELLS = 42;
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const CalendarScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const events = state.events;
  const selectedDate = state.selectedDate;
  const catalog = state.catalog.entries;
  const visibleMonth = state.calendar.visibleMonth;
  const yearSheetOpen = state.calendar.yearSheetOpen;
  const legendExpanded = state.calendar.legendExpanded;
  const monthAnim = useRef(new Animated.Value(1)).current;
  const sheetTranslate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (yearSheetOpen) {
      sheetTranslate.setValue(0);
    }
  }, [yearSheetOpen, sheetTranslate]);

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

  const legendEntries = useMemo(() => {
    const groups = new Map<MuscleGroup, ColorHex>();
    events.forEach(event => {
      const exerciseName =
        typeof event.payload?.exercise === 'string'
          ? asExerciseName(event.payload.exercise)
          : null;
      const meta = exerciseName ? catalogMap.get(exerciseName) : null;
      const group = meta?.primary_muscle_group;
      if (group && !groups.has(group)) {
        groups.set(group, getMuscleColor(group));
      }
    });
    return Array.from(groups.entries())
      .map(([group, color]) => ({
        key: group,
        label: asDisplayLabel(group.replace(/_/g, ' ')),
        color,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events, catalogMap]);

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: 'long',
  });
  const yearLabel = visibleMonth.getFullYear();
  const yearOptions = useMemo(() => {
    const base = visibleMonth.getFullYear() - 25;
    return Array.from({ length: 60 }, (_, index) => base + index);
  }, [visibleMonth]);

  const animateToMonth = useCallback(
    (target: Date) => {
      Animated.timing(monthAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start(() => {
        dispatch({ type: 'calendar/visibleMonth', date: target });
        Animated.timing(monthAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    },
    [dispatch, monthAnim],
  );

  const handleShift = useCallback(
    (delta: number) => {
      animateToMonth(shiftMonth(visibleMonth, delta));
    },
    [animateToMonth, visibleMonth],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          return (
            Math.abs(gesture.dx) > Math.abs(gesture.dy) &&
            Math.abs(gesture.dx) > 20
          );
        },
        onPanResponderRelease: (
          _: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          if (gesture.dx > 20) {
            handleShift(-1);
          } else if (gesture.dx < -20) {
            handleShift(1);
          }
        },
      }),
    [handleShift],
  );

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (
          _: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderMove: (
          _: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          if (gesture.dy > 0) {
            sheetTranslate.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (
          _: GestureResponderEvent,
          gesture: PanResponderGestureState,
        ) => {
          if (gesture.dy > 80) {
            dispatch({ type: 'calendar/yearSheet', open: false });
            sheetTranslate.setValue(0);
            return;
          }
          Animated.timing(sheetTranslate, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start();
        },
      }),
    [dispatch, sheetTranslate],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={headerRow}>
        <TouchableOpacity
          onPress={() => actions.navigate(asScreenKey('home'))}
          style={headerButton}
        >
          <ArrowLeftIcon width={18} height={18} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => dispatch({ type: 'calendar/yearSheet', open: true })}
          style={monthTitle}
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
        <View style={headerActions}>
          <TouchableOpacity onPress={() => handleShift(-1)} style={iconButton}>
            <ChevronLeftIcon width={18} height={18} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleShift(1)} style={iconButton}>
            <ChevronRightIcon width={18} height={18} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              const today = new Date();
              animateToMonth(today);
              actions.setSelectedDate(today);
            }}
            style={todayButton}
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

      <View style={weekdayRow}>
        {DAY_NAMES.map(label => (
          <Text
            key={label}
            style={{
              color: palette.mutedText,
              fontSize: 12,
              flex: 1,
              textAlign: 'center',
            }}
          >
            {label}
          </Text>
        ))}
      </View>

      <Animated.View
        style={[grid, { opacity: monthAnim }]}
        {...panResponder.panHandlers}
      >
        {days.map(day => {
          const dateKey = roundToLocalDay(day.getTime());
          const colors = dayColorMap.get(dateKey) ?? [];
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth();
          const isSelected =
            roundToLocalDay(selectedDate.getTime()) === dateKey;
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[
                cell,
                !isCurrentMonth && { opacity: 0.3 },
                isSelected && { borderColor: palette.primary, borderWidth: 2 },
              ]}
              onPress={() => {
                actions.setSelectedDate(day);
                actions.navigate(asScreenKey('home'));
              }}
            >
              <Text style={{ color: palette.text, fontWeight: '600' }}>
                {day.getDate()}
              </Text>
              <View style={dotRow}>
                {colors.slice(0, 3).map(color => (
                  <View
                    key={`${dateKey}-${color}`}
                    style={[dot, { backgroundColor: color }]}
                  />
                ))}
              </View>
            </TouchableOpacity>
          );
        })}
      </Animated.View>

      {legendEntries.length > 0 ? (
        <>
          <TouchableOpacity
            onPress={() =>
              dispatch({ type: 'calendar/legend', expanded: !legendExpanded })
            }
            style={legendToggle}
          >
            <Text style={{ color: palette.primary, fontWeight: '600' }}>
              {legendExpanded ? 'Hide muscle legend' : 'Show muscle legend'}
            </Text>
          </TouchableOpacity>
          {legendExpanded ? (
            <View style={legendContainer}>
              {legendEntries.map(entry => (
                <View key={entry.key} style={legendItem}>
                  <View style={[dot, { backgroundColor: entry.color }]} />
                  <Text style={{ color: palette.text }}>{entry.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {yearSheetOpen ? (
        <TouchableWithoutFeedback
          onPress={() => dispatch({ type: 'calendar/yearSheet', open: false })}
        >
          <View style={sheetOverlay}>
            <TouchableWithoutFeedback>
              <Animated.View
                style={[
                  sheetContainer,
                  { transform: [{ translateY: sheetTranslate }] },
                ]}
                {...sheetPanResponder.panHandlers}
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
                        animateToMonth(target);
                        dispatch({ type: 'calendar/yearSheet', open: false });
                      }}
                      style={[
                        sheetRow,
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
            </TouchableWithoutFeedback>
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

const headerRow = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderColor: palette.border,
  gap: spacing(1),
};

const headerButton = {
  width: 36,
  height: 36,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: palette.surface,
};

const headerActions = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.75),
};

const monthTitle = {
  flex: 1,
  alignItems: 'center' as const,
};

const iconButton = {
  width: 36,
  height: 36,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  backgroundColor: palette.mutedSurface,
};

const todayButton = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.5),
  paddingHorizontal: spacing(1.5),
  paddingVertical: spacing(0.5),
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.surface,
};

const weekdayRow = {
  flexDirection: 'row' as const,
  paddingHorizontal: spacing(2),
  paddingBottom: spacing(1),
};

const grid = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  paddingHorizontal: spacing(1),
};

const cell: ViewStyle = {
  width: `${100 / DAYS_IN_WEEK}%`,
  paddingVertical: spacing(2),
  alignItems: 'center',
  borderWidth: 1,
  borderColor: palette.border,
};

const dotRow = {
  flexDirection: 'row' as const,
  gap: 4,
  marginTop: spacing(1),
};

const dot = {
  width: 8,
  height: 8,
  borderRadius: 999,
};

const legendContainer = {
  flexDirection: 'row' as const,
  flexWrap: 'wrap' as const,
  gap: spacing(1.25),
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  justifyContent: 'center' as const,
};

const legendToggle = {
  paddingHorizontal: spacing(2),
  paddingTop: spacing(1),
  alignItems: 'center' as const,
};

const legendItem = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: spacing(0.5),
};

const sheetOverlay = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: '#00000099',
  alignItems: 'center' as const,
  justifyContent: 'flex-end' as const,
};

const sheetContainer: ViewStyle = {
  width: '100%',
  maxHeight: '60%',
  backgroundColor: palette.surface,
  borderTopLeftRadius: radius.card,
  borderTopRightRadius: radius.card,
  padding: spacing(2),
};

const sheetRow = {
  paddingVertical: spacing(1),
  paddingHorizontal: spacing(0.5),
  borderRadius: radius.card,
};

export default CalendarScreen;
