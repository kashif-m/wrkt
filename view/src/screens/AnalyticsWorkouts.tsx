import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Card, SectionHeading } from '../ui/components';
import { palette, spacing, typography } from '../ui/theme';
import { AnalyticsRangeSelector } from '../components/analytics/AnalyticsRangeSelector';
import { AnalyticsRangeKey } from '../components/analytics/analyticsRanges';
import {
  formatBucketLabel,
  groupByForRange,
  metricSignalsFromEvents,
} from '../components/analytics/analyticsUtils';
import { SkiaTrendChart } from '../components/analytics/SkiaTrendChart';
import { computeWorkoutAnalytics } from '../TrackerEngine';
import {
  asLabelText,
  asMuscleGroup,
  unwrapDisplayLabel,
  unwrapLabelText,
} from '../domain/types';
import { formatMuscleLabel, secondsToMinutes } from '../ui/formatters';
import {
  DEFAULT_WORKOUT_METRIC_KEY,
  WorkoutAnalyticsQuery,
  WorkoutFilterKind,
  WorkoutMetricKey,
} from '../domain/analytics';
import {
  AnalyticsSelect,
  AnalyticsSelectOption,
} from '../components/analytics/AnalyticsSelect';
import { AnalyticsInlineSelect } from '../components/analytics/AnalyticsInlineSelect';
import { AnalyticsChartHeader } from '../components/analytics/AnalyticsChartHeader';
import { AnalyticsChartModal } from '../components/analytics/AnalyticsChartModal';
import {
  metricLabelForSelection,
  workoutMetricEnabledForSignals,
  unitForMetric,
  workoutFilterOptions,
  workoutMetricOptions,
} from '../components/analytics/analyticsWorkouts';
import { useAnalyticsData } from '../components/analytics/AnalyticsDataContext';

const AnalyticsWorkouts = () => {
  const {
    events,
    eventsRevision,
    catalogRevision,
    summary,
    loading,
    error,
    catalog,
    catalogLookup,
    analyticsCapabilities,
    getEventsForRange,
    getPayloadForRange,
  } = useAnalyticsData();
  const [range, setRange] = useState<AnalyticsRangeKey>('1m');
  const [metric, setMetric] = useState<WorkoutMetricKey>(
    DEFAULT_WORKOUT_METRIC_KEY,
  );
  const [filterKind, setFilterKind] = useState<WorkoutFilterKind>('exercise');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
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

  const filteredEvents = useMemo(
    () => getEventsForRange(range),
    [getEventsForRange, range],
  );
  const filteredPayload = useMemo(
    () => getPayloadForRange(range),
    [getPayloadForRange, range],
  );

  const exerciseOptions = useMemo<AnalyticsSelectOption<string>[]>(() => {
    const seen = new Set<string>();
    filteredEvents.forEach(event => {
      const exercise = event.payload?.exercise;
      if (typeof exercise === 'string') {
        seen.add(exercise);
      }
    });
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b))
      .map(exercise => ({
        key: exercise,
        label: asLabelText(exercise),
      }));
  }, [filteredEvents]);

  const muscleOptions = useMemo<AnalyticsSelectOption<string>[]>(() => {
    const seen = new Set<string>();
    filteredEvents.forEach(event => {
      const exercise = event.payload?.exercise;
      if (typeof exercise !== 'string') return;
      const muscle = catalogLookup.get(exercise);
      if (muscle) seen.add(muscle);
    });
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b))
      .map(muscle => ({
        key: muscle,
        label: asLabelText(
          unwrapDisplayLabel(formatMuscleLabel(asMuscleGroup(muscle))),
        ),
      }));
  }, [catalogLookup, filteredEvents]);

  useEffect(() => {
    if (filterKind !== 'exercise') return;
    if (exerciseOptions.length === 0) {
      if (selectedExercise) setSelectedExercise(null);
      return;
    }
    if (
      !selectedExercise ||
      !exerciseOptions.some(option => option.key === selectedExercise)
    ) {
      setSelectedExercise(exerciseOptions[0].key);
    }
  }, [exerciseOptions, filterKind, selectedExercise]);

  useEffect(() => {
    if (filterKind !== 'muscle') return;
    if (muscleOptions.length === 0) {
      if (selectedMuscle) setSelectedMuscle(null);
      return;
    }
    if (
      !selectedMuscle ||
      !muscleOptions.some(option => option.key === selectedMuscle)
    ) {
      setSelectedMuscle(muscleOptions[0].key);
    }
  }, [muscleOptions, filterKind, selectedMuscle]);

  const filterValue =
    filterKind === 'exercise'
      ? selectedExercise
      : filterKind === 'muscle'
      ? selectedMuscle
      : null;

  const contextEvents = useMemo(() => {
    if (!filterValue) return filteredEvents;
    if (filterKind === 'exercise') {
      const target = filterValue.toLowerCase();
      return filteredEvents.filter(event => {
        const exercise = event.payload?.exercise;
        return (
          typeof exercise === 'string' && exercise.toLowerCase() === target
        );
      });
    }
    if (filterKind === 'muscle') {
      const targetMuscle = filterValue.toLowerCase();
      return filteredEvents.filter(event => {
        const exercise = event.payload?.exercise;
        if (typeof exercise !== 'string') return false;
        const muscle = catalogLookup.get(exercise);
        return (
          typeof muscle === 'string' && muscle.toLowerCase() === targetMuscle
        );
      });
    }
    return filteredEvents;
  }, [catalogLookup, filterKind, filterValue, filteredEvents]);

  const metricOptions = useMemo(() => {
    const allowedMetrics = new Set(
      analyticsCapabilities?.views?.workouts?.metrics ?? [],
    );
    const signals = metricSignalsFromEvents(contextEvents);
    return workoutMetricOptions.filter(option => {
      if (allowedMetrics.size > 0 && !allowedMetrics.has(option.key)) {
        return false;
      }
      return workoutMetricEnabledForSignals(option.key, signals);
    });
  }, [analyticsCapabilities, contextEvents]);

  useEffect(() => {
    if (metricOptions.length === 0) return;
    if (!metricOptions.some(option => option.key === metric)) {
      setMetric(metricOptions[0].key);
    }
  }, [metric, metricOptions]);

  const groupBy = useMemo(() => groupByForRange(range), [range]);

  const workoutSeries = useMemo(() => {
    if (!catalog || filteredEvents.length === 0) return null;
    if (!filterValue) return null;
    const offset = new Date().getTimezoneOffset();
    const query: WorkoutAnalyticsQuery = {
      metric,
      group_by: groupBy,
      filter: {
        kind: filterKind,
        value: filterValue,
      },
    };
    return computeWorkoutAnalytics(filteredPayload, -offset, catalog, query, {
      trace: 'trends/workouts',
      cache: {
        enabled: true,
        eventsRevision,
        catalogRevision,
      },
    });
  }, [
    catalog,
    catalogRevision,
    eventsRevision,
    filteredEvents,
    filteredPayload,
    filterKind,
    filterValue,
    groupBy,
    metric,
  ]);

  const chartData = useMemo(() => {
    if (!workoutSeries) return [];
    const isDurationMetric = metric === 'total_active_duration';
    return workoutSeries.points.map(point => ({
      ...point,
      value: isDurationMetric ? secondsToMinutes(point.value) : point.value,
      label: formatBucketLabel(point.bucket, workoutSeries.group_by),
    }));
  }, [metric, workoutSeries]);
  const pointCountLabel =
    metric === 'total_volume' ||
    metric === 'total_sets' ||
    metric === 'total_reps'
      ? 'set'
      : 'entry';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={palette.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={[typography.section, { color: palette.danger }]}>
          Unable to load workouts
        </Text>
        <Text style={[typography.label, { marginTop: spacing(1) }]}>
          {error}
        </Text>
      </View>
    );
  }

  if (!summary || events.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={typography.section}>No workout data yet</Text>
        <Text style={[typography.label, { marginTop: spacing(0.5) }]}>
          Log sessions to see trends
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={!interactionLocked}
    >
      <Card variant="analytics" style={{ gap: spacing(1.5) }}>
        <View style={styles.headerBlock}>
          <SectionHeading label={asLabelText('Workouts')} />
          <View style={styles.rangeRow}>
            <AnalyticsRangeSelector
              selected={range}
              onSelect={setRange}
              onInteractionLockChange={handleInteractionLockChange}
            />
          </View>
        </View>
        <View style={styles.selectorRow}>
          <View style={styles.selectorCell}>
            {metricOptions.length > 0 ? (
              <AnalyticsInlineSelect
                title={asLabelText('Graph')}
                options={metricOptions}
                selected={metric}
                onSelect={setMetric}
                onInteractionLockChange={handleInteractionLockChange}
              />
            ) : (
              <View style={{ gap: spacing(0.5) }}>
                <Text style={typography.label}>GRAPH</Text>
                <Text style={typography.label}>
                  No metrics available for this filter
                </Text>
              </View>
            )}
          </View>
          <View style={styles.selectorCell}>
            <AnalyticsInlineSelect
              title={asLabelText('Filter')}
              options={workoutFilterOptions}
              selected={filterKind}
              onSelect={setFilterKind}
              onInteractionLockChange={handleInteractionLockChange}
              justified
            />
          </View>
        </View>
        {filterKind === 'exercise' ? (
          <AnalyticsSelect
            title={asLabelText('Exercise')}
            options={exerciseOptions}
            selected={selectedExercise ?? ''}
            onSelect={setSelectedExercise}
            searchable
            searchPlaceholder={asLabelText('Search exercises')}
          />
        ) : null}
        {filterKind === 'muscle' ? (
          <AnalyticsSelect
            title={asLabelText('Muscle group')}
            options={muscleOptions}
            selected={selectedMuscle ?? ''}
            onSelect={setSelectedMuscle}
          />
        ) : null}
        <AnalyticsChartHeader
          subtitle={`${unwrapLabelText(
            metricLabelForSelection(metric),
          )} per ${groupBy}`}
          onExpand={chartData.length ? () => setExpanded(true) : undefined}
        />
        {chartData.length === 0 ? (
          <Text style={typography.label}>No data for this selection</Text>
        ) : (
          <View style={{ height: 200 }}>
            <SkiaTrendChart
              data={chartData}
              height={200}
              unit={unitForMetric(metric)}
              showTooltip
              rangeKey={range}
              countLabel={pointCountLabel}
              onInteractionLockChange={handleInteractionLockChange}
            />
          </View>
        )}
      </Card>
      <AnalyticsChartModal
        visible={expanded}
        title={unwrapLabelText(metricLabelForSelection(metric))}
        onClose={() => setExpanded(false)}
        data={chartData}
        unit={unitForMetric(metric)}
        rangeKey={range}
        countLabel={pointCountLabel}
      />
    </ScrollView>
  );
};

const styles = {
  center: {
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    padding: spacing(2),
  },
  scrollContent: {
    padding: spacing(2),
    paddingBottom: spacing(6),
    gap: spacing(2),
  },
  headerBlock: {
    gap: spacing(0.75),
  },
  rangeRow: {
    width: '100%' as const,
  },
  selectorRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    gap: spacing(1.5),
  },
  selectorCell: {
    flex: 1,
  },
};

export default AnalyticsWorkouts;
