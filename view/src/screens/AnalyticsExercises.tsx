import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BodyText, Card, SectionHeading } from '../ui/components';
import { palette, spacing, typography } from '../ui/theme';
import { useAppState } from '../state/appContext';
import { ExerciseMetricKey } from '../domain/analytics';
import {
  asLabelText,
  asMuscleGroup,
  unwrapDisplayLabel,
  unwrapLabelText,
  unwrapLoggingMode,
} from '../domain/types';
import { AnalyticsRangeSelector } from '../components/analytics/AnalyticsRangeSelector';
import { AnalyticsRangeKey } from '../components/analytics/analyticsRanges';
import {
  AnalyticsSelect,
  AnalyticsSelectOption,
} from '../components/analytics/AnalyticsSelect';
import { AnalyticsInlineSelect } from '../components/analytics/AnalyticsInlineSelect';
import { AnalyticsChartHeader } from '../components/analytics/AnalyticsChartHeader';
import { AnalyticsChartModal } from '../components/analytics/AnalyticsChartModal';
import {
  exerciseMetricOptionsForMode,
  unitForExerciseMetric,
} from '../components/analytics/analyticsExercises';
import { SkiaTrendChart } from '../components/analytics/SkiaTrendChart';
import { formatMuscleLabel } from '../ui/formatters';
import { secondsToMinutes } from '../ui/formatters';
import { useExerciseTrendSeries } from '../components/analytics/useExerciseTrendSeries';
import { useAnalyticsData } from '../components/analytics/AnalyticsDataContext';

const AnalyticsExercises = ({
  focusExercise,
  focusMuscle,
  onClearFilter,
}: {
  focusExercise?: string | null;
  focusMuscle?: string | null;
  onClearFilter?: () => void;
}) => {
  const state = useAppState();
  const {
    events,
    loading,
    error,
    catalog,
    eventsRevision,
    catalogRevision,
  } = useAnalyticsData();
  const [range, setRange] = useState<AnalyticsRangeKey>('1m');
  const [metric, setMetric] = useState<ExerciseMetricKey>('estimated_one_rm');
  const [selectedRm, setSelectedRm] = useState('1');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
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

  const catalogLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (!catalog) return map;
    catalog.forEach(entry => {
      const name = entry.display_name;
      const muscle = entry.primary_muscle_group;
      if (typeof name === 'string' && typeof muscle === 'string') {
        map.set(name, muscle);
      }
    });
    return map;
  }, [catalog]);

  const exerciseOptions = useMemo<AnalyticsSelectOption<string>[]>(() => {
    const seen = new Set<string>();
    events.forEach(event => {
      const exercise = event.payload?.exercise;
      if (typeof exercise === 'string') {
        if (focusMuscle) {
          const muscle = catalogLookup.get(exercise);
          if (muscle !== focusMuscle) return;
        }
        seen.add(exercise);
      }
    });
    return Array.from(seen)
      .sort((a, b) => a.localeCompare(b))
      .map(exercise => ({
        key: exercise,
        label: asLabelText(exercise),
      }));
  }, [catalogLookup, events, focusMuscle]);

  useEffect(() => {
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
  }, [exerciseOptions, selectedExercise]);

  useEffect(() => {
    if (!focusExercise) return;
    setSelectedExercise(focusExercise);
  }, [focusExercise]);

  const { chartData, exerciseEventsInRange } = useExerciseTrendSeries({
    events,
    catalog,
    exercise: selectedExercise,
    metric,
    range,
    rmReps: metric === 'pr_by_rm' && selectedRm ? Number(selectedRm) : null,
    traceSource: 'trends/exercises',
    revisions: { eventsRevision, catalogRevision },
  });

  const displayChartData = useMemo(() => {
    const isDurationMetric =
      metric === 'max_active_duration' || metric === 'workout_active_duration';
    if (!isDurationMetric) return chartData;
    return chartData.map(point => ({
      ...point,
      value: secondsToMinutes(point.value),
    }));
  }, [chartData, metric]);

  const selectedCatalogEntry = useMemo(
    () =>
      state.catalog.entries.find(
        entry =>
          entry.display_name.toLowerCase() ===
          (selectedExercise ?? '').toLowerCase(),
      ) ?? null,
    [selectedExercise, state.catalog.entries],
  );

  const metricSignals = useMemo(() => {
    if (!selectedExercise) {
      return {
        hasWeight: false,
        hasReps: false,
        hasDistance: false,
        hasDuration: false,
      };
    }

    return exerciseEventsInRange.reduce(
      (signals, event) => {
        const exercise = event.payload?.exercise;
        if (
          typeof exercise !== 'string' ||
          exercise.toLowerCase() !== selectedExercise.toLowerCase()
        ) {
          return signals;
        }

        if (
          typeof event.payload?.weight === 'number' &&
          event.payload.weight > 0
        ) {
          signals.hasWeight = true;
        }
        if (typeof event.payload?.reps === 'number' && event.payload.reps > 0) {
          signals.hasReps = true;
        }
        if (
          typeof event.payload?.distance === 'number' &&
          event.payload.distance > 0
        ) {
          signals.hasDistance = true;
        }
        if (
          typeof event.payload?.duration === 'number' &&
          event.payload.duration > 0
        ) {
          signals.hasDuration = true;
        }
        return signals;
      },
      {
        hasWeight: false,
        hasReps: false,
        hasDistance: false,
        hasDuration: false,
      },
    );
  }, [exerciseEventsInRange, selectedExercise]);

  const metricOptions = useMemo(
    () =>
      exerciseMetricOptionsForMode(
        selectedCatalogEntry
          ? unwrapLoggingMode(selectedCatalogEntry.logging_mode)
          : null,
        metricSignals,
      ),
    [metricSignals, selectedCatalogEntry],
  );

  useEffect(() => {
    if (metricOptions.length === 0) return;
    if (!metricOptions.some(option => option.key === metric)) {
      setMetric(metricOptions[0].key);
    }
  }, [metric, metricOptions]);

  const rmOptions = useMemo(() => {
    if (!selectedExercise) {
      return [];
    }
    const target = selectedExercise.toLowerCase();
    const reps = new Set<number>();
    exerciseEventsInRange.forEach(event => {
      const exercise = event.payload?.exercise;
      if (typeof exercise !== 'string' || exercise.toLowerCase() !== target) {
        return;
      }
      const weight = event.payload?.weight;
      const setReps = event.payload?.reps;
      if (
        typeof weight === 'number' &&
        weight > 0 &&
        typeof setReps === 'number' &&
        setReps > 0
      ) {
        reps.add(Math.round(setReps));
      }
    });
    return Array.from(reps)
      .sort((a, b) => a - b)
      .map(value => ({
        key: `${value}`,
        label: asLabelText(`${value}RM`),
      }));
  }, [exerciseEventsInRange, selectedExercise]);

  useEffect(() => {
    if (rmOptions.length === 0) {
      if (selectedRm !== '') {
        setSelectedRm('');
      }
      return;
    }
    if (!rmOptions.some(option => option.key === selectedRm)) {
      setSelectedRm(rmOptions[0].key);
    }
  }, [rmOptions, selectedRm]);

  const selectedPrRows = useMemo(() => {
    if (!selectedExercise) return [];
    const target = selectedExercise.toLowerCase();
    const best = {
      oneRm: { value: 0, ts: 0 },
      maxWeight: { value: 0, ts: 0 },
      maxReps: { value: 0, ts: 0 },
      bestVolume: { value: 0, ts: 0 },
    };

    events.forEach(event => {
      const exercise = event.payload?.exercise;
      if (typeof exercise !== 'string' || exercise.toLowerCase() !== target) {
        return;
      }

      const weight =
        typeof event.payload?.weight === 'number' && event.payload.weight > 0
          ? event.payload.weight
          : 0;
      const reps =
        typeof event.payload?.reps === 'number' && event.payload.reps > 0
          ? event.payload.reps
          : 0;
      if (weight <= 0 || reps <= 0) return;

      const ts = event.ts;
      const oneRm = weight * (1 + reps / 30);
      const volume = weight * reps;

      if (
        oneRm > best.oneRm.value ||
        (oneRm === best.oneRm.value && ts < best.oneRm.ts)
      ) {
        best.oneRm = { value: oneRm, ts };
      }
      if (
        weight > best.maxWeight.value ||
        (weight === best.maxWeight.value && ts < best.maxWeight.ts)
      ) {
        best.maxWeight = { value: weight, ts };
      }
      if (
        reps > best.maxReps.value ||
        (reps === best.maxReps.value && ts < best.maxReps.ts)
      ) {
        best.maxReps = { value: reps, ts };
      }
      if (
        volume > best.bestVolume.value ||
        (volume === best.bestVolume.value && ts < best.bestVolume.ts)
      ) {
        best.bestVolume = { value: volume, ts };
      }
    });

    const rows: Array<{ label: string; value: string; date: string }> = [];
    if (best.oneRm.value > 0) {
      rows.push({
        label: 'Estimated 1RM',
        value: `${Math.round(best.oneRm.value)} kg`,
        date: formatPrDate(best.oneRm.ts),
      });
    }
    if (best.maxWeight.value > 0) {
      rows.push({
        label: 'Max weight',
        value: `${Math.round(best.maxWeight.value)} kg`,
        date: formatPrDate(best.maxWeight.ts),
      });
    }
    if (best.maxReps.value > 0) {
      rows.push({
        label: 'Max reps',
        value: `${Math.round(best.maxReps.value)} reps`,
        date: formatPrDate(best.maxReps.ts),
      });
    }
    if (best.bestVolume.value > 0) {
      rows.push({
        label: 'Best set volume',
        value: `${Math.round(best.bestVolume.value).toLocaleString(
          'en-US',
        )} vol`,
        date: formatPrDate(best.bestVolume.ts),
      });
    }
    return rows;
  }, [events, selectedExercise]);

  const rmLadderRows = useMemo(() => {
    if (!selectedExercise) return [];
    const target = selectedExercise.toLowerCase();
    const bestByReps = new Map<number, { value: number; ts: number }>();

    events.forEach(event => {
      const exercise = event.payload?.exercise;
      if (typeof exercise !== 'string' || exercise.toLowerCase() !== target) {
        return;
      }
      const weight =
        typeof event.payload?.weight === 'number' && event.payload.weight > 0
          ? event.payload.weight
          : 0;
      const reps =
        typeof event.payload?.reps === 'number' && event.payload.reps > 0
          ? Math.round(event.payload.reps)
          : 0;
      if (weight <= 0 || reps <= 0) return;

      const current = bestByReps.get(reps);
      if (
        !current ||
        weight > current.value ||
        (weight === current.value && event.ts < current.ts)
      ) {
        bestByReps.set(reps, { value: weight, ts: event.ts });
      }
    });

    return Array.from(bestByReps.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(0, 12)
      .map(([reps, record]) => ({
        label: `${reps}RM`,
        value: `${Math.round(record.value)} kg`,
        date: formatPrDate(record.ts),
      }));
  }, [events, selectedExercise]);

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
          Unable to load exercises
        </Text>
        <Text style={[typography.label, { marginTop: spacing(1) }]}>
          {error}
        </Text>
      </View>
    );
  }

  if (exerciseOptions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={typography.section}>No exercise records yet</Text>
        <Text style={[typography.label, { marginTop: spacing(0.5) }]}>
          Log PRs to see exercise history
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
          <SectionHeading label={asLabelText('Exercises')} />
          <View style={styles.rangeRow}>
            <AnalyticsRangeSelector
              selected={range}
              onSelect={setRange}
              onInteractionLockChange={handleInteractionLockChange}
            />
          </View>
        </View>
        <AnalyticsSelect
          title={asLabelText('Exercise')}
          options={exerciseOptions}
          selected={selectedExercise ?? ''}
          onSelect={setSelectedExercise}
          searchable
          searchPlaceholder={asLabelText('Search exercises')}
        />
        {focusMuscle ? (
          <View style={styles.filterRow}>
            <Text style={styles.filterLabel}>
              Filtered by{' '}
              {unwrapDisplayLabel(
                formatMuscleLabel(asMuscleGroup(focusMuscle)),
              )}
            </Text>
            {onClearFilter ? (
              <TouchableOpacity onPress={onClearFilter}>
                <Text style={styles.filterClear}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
        {metricOptions.length > 0 ? (
          <AnalyticsInlineSelect
            title={asLabelText('Metric')}
            options={metricOptions}
            selected={metric}
            onSelect={setMetric}
            onInteractionLockChange={handleInteractionLockChange}
          />
        ) : (
          <Text style={typography.label}>
            No metrics available for this exercise in this range
          </Text>
        )}
        {metric === 'pr_by_rm' && rmOptions.length > 0 ? (
          <AnalyticsInlineSelect
            title={asLabelText('RM')}
            options={rmOptions}
            selected={selectedRm}
            onSelect={setSelectedRm}
            onInteractionLockChange={handleInteractionLockChange}
          />
        ) : null}
        {metric === 'pr_by_rm' && rmOptions.length === 0 ? (
          <Text style={typography.label}>
            No RM-specific records in this range
          </Text>
        ) : null}
        <AnalyticsChartHeader
          subtitle={unwrapLabelText(
            metricOptions.find(option => option.key === metric)?.label ??
              asLabelText('Metric'),
          )}
          onExpand={
            displayChartData.length ? () => setExpanded(true) : undefined
          }
        />
        {displayChartData.length === 0 ? (
          <Text style={typography.label}>No data for this range</Text>
        ) : (
          <View style={{ height: 200 }}>
            <SkiaTrendChart
              data={displayChartData}
              height={200}
              unit={unitForExerciseMetric(metric)}
              showTooltip
              rangeKey={range}
              countLabel="set"
              onInteractionLockChange={handleInteractionLockChange}
            />
          </View>
        )}
      </Card>
      <AnalyticsChartModal
        visible={expanded}
        title={selectedExercise ?? 'Exercise'}
        onClose={() => setExpanded(false)}
        data={displayChartData}
        unit={unitForExerciseMetric(metric)}
        rangeKey={range}
        countLabel="set"
      />
      <Card variant="analytics" style={{ gap: spacing(1.5) }}>
        <SectionHeading label={asLabelText('Personal Records')} />
        <BodyText style={{ color: palette.mutedText }}>
          {selectedExercise
            ? `All-time for ${selectedExercise}`
            : 'Select an exercise'}
        </BodyText>
        {selectedPrRows.length > 0 ? (
          <>
            {selectedPrRows.map(row => (
              <PRMetricRow
                key={row.label}
                label={row.label}
                value={row.value}
                date={row.date}
              />
            ))}
            {rmLadderRows.length > 0 ? (
              <>
                <Text style={styles.rmLadderTitle}>RM Ladder</Text>
                {rmLadderRows.map(row => (
                  <PRMetricRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    date={row.date}
                  />
                ))}
              </>
            ) : null}
          </>
        ) : (
          <Text style={typography.label}>
            No all-time records for this exercise
          </Text>
        )}
      </Card>
    </ScrollView>
  );
};

const formatPrDate = (ts: number) =>
  new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const PRMetricRow = ({
  label,
  value,
  date,
}: {
  label: string;
  value: string;
  date: string;
}) => (
  <View style={styles.prRow}>
    <View style={styles.prMeta}>
      <Text style={styles.prExercise}>{label}</Text>
      <Text style={styles.prDate}>{date}</Text>
    </View>
    <Text style={styles.prValue}>{value}</Text>
  </View>
);

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
  filterRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing(0.25),
    paddingHorizontal: spacing(0.75),
    borderRadius: 12,
    backgroundColor: palette.mutedSurface,
  },
  filterLabel: {
    color: palette.mutedText,
    fontSize: 12,
  },
  filterClear: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  prRow: {
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
    alignItems: 'center' as const,
    paddingVertical: spacing(0.75),
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  prExercise: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  prMeta: {
    flex: 1,
    marginRight: spacing(1),
  },
  prDate: {
    color: palette.mutedText,
    fontSize: 12,
    marginTop: spacing(0.125),
  },
  prValue: {
    color: palette.text,
    fontWeight: '800' as const,
  },
  rmLadderTitle: {
    color: palette.mutedText,
    fontSize: 12,
    fontWeight: '600' as const,
    marginTop: spacing(0.75),
    textTransform: 'uppercase' as const,
  },
};

export default AnalyticsExercises;
