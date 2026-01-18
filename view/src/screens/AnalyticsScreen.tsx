import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { WorkoutEvent } from '../workoutFlows';
import { Card, SectionHeading, BodyText } from '../ui/components';
import { palette, spacing, radius } from '../ui/theme';
import { roundToLocalWeek, roundToLocalDay } from '../timePolicy';
import { useAppDispatch, useAppState } from '../state/appContext';
import {
  AnalyticsMetricKey,
  AnalyticsRangeKey,
  ColorHex,
  DisplayLabel,
  ExerciseName,
  LabelText,
  asAnalyticsMetricKey,
  asAnalyticsRangeKey,
  asColorHex,
  asDisplayLabel,
  asLabelText,
} from '../domain/types';

type VolumePoint = { label: DisplayLabel; value: number };
type PersonalRecord = {
  exercise: ExerciseName;
  weight: number;
  reps: number;
  oneRm: number;
};

const WEEK = 7 * 24 * 60 * 60 * 1000;
const rangeOptions: ReadonlyArray<{
  key: AnalyticsRangeKey;
  label: LabelText;
  weeks: number | null;
}> = [
  { key: asAnalyticsRangeKey('8w'), label: asLabelText('8w'), weeks: 8 },
  { key: asAnalyticsRangeKey('16w'), label: asLabelText('16w'), weeks: 16 },
  { key: asAnalyticsRangeKey('6m'), label: asLabelText('6m'), weeks: 26 },
  { key: asAnalyticsRangeKey('1y'), label: asLabelText('1y'), weeks: 52 },
  { key: asAnalyticsRangeKey('all'), label: asLabelText('All'), weeks: null },
];

const metricOptions: ReadonlyArray<{
  key: AnalyticsMetricKey;
  label: LabelText;
  unit: LabelText;
}> = [
  {
    key: asAnalyticsMetricKey('volume'),
    label: asLabelText('Volume'),
    unit: asLabelText('kg·reps'),
  },
  {
    key: asAnalyticsMetricKey('sessions'),
    label: asLabelText('Sessions'),
    unit: asLabelText('sets'),
  },
];

const formatWeekLabel = (ts: number): DisplayLabel => {
  const start = new Date(ts);
  const end = new Date(ts + WEEK - 1);
  return asDisplayLabel(
    `${start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })} – ${end.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    })}`,
  );
};

const computeSeries = (
  events: WorkoutEvent[],
  metric: AnalyticsMetricKey,
  range: AnalyticsRangeKey,
): VolumePoint[] => {
  const rangeConfig =
    rangeOptions.find(option => option.key === range) ?? rangeOptions[0];
  const minTs = rangeConfig.weeks
    ? Date.now() - rangeConfig.weeks * WEEK
    : null;
  const totals = new Map<number, { volume: number; count: number }>();
  events.forEach(event => {
    if (minTs && event.ts < minTs) return;
    const reps = Number(event.payload?.reps ?? 0);
    const weight = Number(event.payload?.weight ?? 0);
    const volume = reps * weight;
    const bucket = roundToLocalWeek(event.ts);
    const current = totals.get(bucket) ?? { volume: 0, count: 0 };
    totals.set(bucket, {
      volume: current.volume + volume,
      count: current.count + 1,
    });
  });
  return Array.from(totals.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bucket, value]) => ({
      label: formatWeekLabel(bucket),
      value:
        metric === asAnalyticsMetricKey('volume') ? value.volume : value.count,
    }));
};

const estimateOneRm = (weight: number, reps: number) =>
  weight * (1 + reps / 30);

const computePRs = (events: WorkoutEvent[]): PersonalRecord[] => {
  const best = new Map<ExerciseName, PersonalRecord>();
  events.forEach(event => {
    if (event.payload?.pr !== true) return;
    const exercise = asLabelText(
      String(event.payload?.exercise ?? 'Unknown'),
    ) as unknown as ExerciseName;
    const reps = Number(event.payload?.reps ?? 0);
    const weight = Number(event.payload?.weight ?? 0);
    if (!weight) return;
    const oneRm = estimateOneRm(weight, reps || 1);
    const current = best.get(exercise);
    if (!current || oneRm > current.oneRm) {
      best.set(exercise, { exercise, weight, reps, oneRm });
    }
  });
  return Array.from(best.values()).sort((a, b) => b.oneRm - a.oneRm);
};

const MetricChart = ({
  data,
  metricLabel,
  metricUnit,
}: {
  data: VolumePoint[];
  metricLabel: LabelText;
  metricUnit: LabelText;
}) => {
  if (data.length === 0) {
    return (
      <BodyText style={{ color: palette.mutedText }}>
        {asLabelText('Log a few sessions to unlock this view.')}
      </BodyText>
    );
  }
  const max = data.reduce((m, p) => Math.max(m, p.value), 0) || 1;
  return (
    <View style={{ gap: spacing(0.75) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 12, color: palette.mutedText }}>
          {asDisplayLabel('0')}
        </Text>
        <Text style={{ fontSize: 12, color: palette.mutedText }}>
          {asDisplayLabel(`${Math.round(max)} ${metricUnit}`)}
        </Text>
      </View>
      {data.map((point, index) => (
        <View key={point.label}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: spacing(0.25),
            }}
          >
            <Text style={{ fontSize: 12, color: palette.mutedText }}>
              {point.label}
            </Text>
            <Text
              style={{ fontSize: 12, color: palette.text, fontWeight: '600' }}
            >
              {Math.round(point.value)} {metricUnit}
            </Text>
          </View>
          <Bar value={point.value} max={max} delay={index * 50} />
        </View>
      ))}
      <Text
        style={{
          color: palette.mutedText,
          fontSize: 12,
          marginTop: spacing(0.25),
        }}
      >
        {metricLabel}
      </Text>
    </View>
  );
};

const Bar = ({
  value,
  max,
  delay,
}: {
  value: number;
  max: number;
  delay?: number;
}) => {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: Math.min(1, value / max),
      duration: 400,
      delay,
      useNativeDriver: false,
    }).start();
  }, [value, max, delay, progress]);
  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  return (
    <View
      style={{
        backgroundColor: palette.mutedSurface,
        height: 12,
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={{ width, backgroundColor: palette.primary, height: '100%' }}
      />
    </View>
  );
};

const PRTable = ({ prs }: { prs: PersonalRecord[] }) => (
  <Card>
    <SectionHeading label={asLabelText('Estimated PRs')} />
    {prs.length === 0 ? (
      <BodyText style={{ color: palette.mutedText }}>
        Log sets to see personal records.
      </BodyText>
    ) : (
      prs.map(record => (
        <View
          key={record.exercise}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingVertical: 6,
            borderBottomWidth: 0.5,
            borderColor: palette.border,
          }}
        >
          <View>
            <BodyText style={{ fontWeight: '600' }}>{record.exercise}</BodyText>
            <Text style={{ fontSize: 12, color: palette.mutedText }}>
              {record.weight} kg × {record.reps || 1} reps
            </Text>
          </View>
          <BodyText style={{ fontWeight: '600' }}>
            {Math.round(record.oneRm)} kg 1RM
          </BodyText>
        </View>
      ))
    )}
  </Card>
);

const SegmentedControl = <T extends AnalyticsRangeKey | AnalyticsMetricKey>({
  options,
  selected,
  onSelect,
}: {
  options: ReadonlyArray<{ key: T; label: LabelText }>;
  selected: T;
  onSelect: (key: T) => void;
}) => (
  <View style={segmentedRow}>
    {options.map((option, index) => (
      <TouchableOpacity
        key={option.key}
        onPress={() => onSelect(option.key)}
        style={[
          segmentedButton,
          index === 0 && segmentedFirst,
          index === options.length - 1 && segmentedLast,
          selected === option.key && segmentedActive,
        ]}
      >
        <Text
          style={{
            color: selected === option.key ? asColorHex('#0f172a') : palette.text,
            fontWeight: '600',
          }}
        >
          {option.label}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

const scheduleIdle = (work: () => void) => {
  const idleCallback = (globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void) => number;
    cancelIdleCallback?: (id: number) => void;
  }).requestIdleCallback;
  if (idleCallback) {
    const id = idleCallback(work);
    return () => {
      const cancel = (globalThis as typeof globalThis & {
        cancelIdleCallback?: (id: number) => void;
      }).cancelIdleCallback;
      cancel?.(id);
    };
  }
  const timeout = setTimeout(work, 0);
  return () => clearTimeout(timeout);
};

const ExerciseHistory = ({ events }: { events: WorkoutEvent[] }) => {
  const grouped = useMemo(() => {
    const buckets = new Map<number, WorkoutEvent[]>();
    events.forEach(event => {
      const day = roundToLocalDay(event.ts);
      const bucket = buckets.get(day) ?? [];
      bucket.push(event);
      buckets.set(day, bucket);
    });
    return Array.from(buckets.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, 8);
  }, [events]);

  if (grouped.length === 0) {
    return (
      <Card>
        <SectionHeading label={asLabelText('Recent sessions')} />
        <BodyText style={{ color: palette.mutedText }}>
          Log a handful of sets to see history rollups.
        </BodyText>
      </Card>
    );
  }

  return (
    <Card style={{ gap: spacing(1.5) }}>
      <SectionHeading label={asLabelText('Recent sessions')} />
      {grouped.map(([day, sets]) => {
        const dayLabel = new Date(day).toLocaleDateString(undefined, {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        });
        return (
          <View
            key={day}
            style={{
              borderBottomWidth: 1,
              borderColor: palette.border,
              paddingBottom: spacing(1),
              gap: spacing(0.25),
            }}
          >
            <Text
              style={{
                color: palette.mutedText,
                fontSize: 12,
                letterSpacing: 0.3,
              }}
            >
              {dayLabel}
            </Text>
            {sets
              .sort((a, b) => b.ts - a.ts)
              .slice(0, 4)
              .map((set, index) => (
                <View
                  key={`${set.event_id}-${set.ts}-${index}`}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <View style={{ flex: 1, marginRight: spacing(1) }}>
                    <Text style={{ color: palette.text, fontWeight: '600' }}>
                      {String(set.payload?.exercise ?? 'Unlabeled')}
                    </Text>
                    <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                      {describeSet(set)}
                    </Text>
                  </View>
                  <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                    {new Date(set.ts).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ))}
          </View>
        );
      })}
    </Card>
  );
};

const describeSet = (event: WorkoutEvent) => {
  const reps = Number(event.payload?.reps ?? 0);
  const weight = Number(event.payload?.weight ?? 0);
  const distance = Number(event.payload?.distance ?? 0);
  const duration = Number(event.payload?.duration ?? 0);
  if (weight && reps) {
    return `${weight} kg × ${reps}`;
  }
  if (reps) {
    return `${reps} reps`;
  }
  if (distance && duration) {
    return `${distance} m / ${duration} s`;
  }
  if (duration) {
    return `${duration} sec`;
  }
  return 'Logged set';
};

const segmentedRow = {
  flexDirection: 'row' as const,
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  overflow: 'hidden' as const,
};

const segmentedButton = {
  flex: 1,
  paddingVertical: spacing(0.75),
  alignItems: 'center' as const,
  backgroundColor: palette.mutedSurface,
  borderRightWidth: 1,
  borderColor: palette.border,
};

const segmentedFirst = {
  borderTopLeftRadius: radius.card,
  borderBottomLeftRadius: radius.card,
};

const segmentedLast = {
  borderRightWidth: 0,
  borderTopRightRadius: radius.card,
  borderBottomRightRadius: radius.card,
};

const segmentedActive = {
  backgroundColor: palette.primary,
};

const AnalyticsScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const selectedRange = state.analytics.selectedRange;
  const selectedMetric = state.analytics.selectedMetric;
  const [volumeSeries, setVolumeSeries] = useState<VolumePoint[]>([]);
  const [prs, setPrs] = useState<PersonalRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      if (cancelled) return;
      setVolumeSeries(
        computeSeries(state.events, selectedMetric, selectedRange),
      );
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [state.events, selectedMetric, selectedRange]);

  useEffect(() => {
    let cancelled = false;
    const cancel = scheduleIdle(() => {
      if (cancelled) return;
      setPrs(computePRs(state.events));
    });
    return () => {
      cancelled = true;
      cancel();
    };
  }, [state.events]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: spacing(2),
        paddingBottom: spacing(6),
        gap: spacing(2),
      }}
    >
      <Card style={{ gap: spacing(1.25) }}>
        <SectionHeading label={asLabelText('Trends')} />
        <SegmentedControl
          options={metricOptions}
          selected={selectedMetric}
          onSelect={metric => dispatch({ type: 'analytics/metric', metric })}
        />
        <SegmentedControl
          options={rangeOptions}
          selected={selectedRange}
          onSelect={range => dispatch({ type: 'analytics/range', range })}
        />
        <MetricChart
          data={volumeSeries}
          metricLabel={
            metricOptions.find(opt => opt.key === selectedMetric)?.label ??
            asLabelText('Metric')
          }
          metricUnit={
            metricOptions.find(opt => opt.key === selectedMetric)?.unit ??
            asLabelText('')
          }
        />
      </Card>
      <PRTable prs={prs} />
      <ExerciseHistory events={state.events} />
    </ScrollView>
  );
};

export default AnalyticsScreen;
