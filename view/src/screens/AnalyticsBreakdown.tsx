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
import { AnalyticsRangeSelector } from '../components/analytics/AnalyticsRangeSelector';
import { AnalyticsRangeKey } from '../components/analytics/analyticsRanges';
import {
  isBreakdownMetricRelevant,
  metricSignalsFromEvents,
} from '../components/analytics/analyticsUtils';
import { computeBreakdownAnalytics } from '../TrackerEngine';
import {
  ColorHex,
  asDisplayLabel,
  asLabelText,
  asMuscleGroup,
  unwrapDisplayLabel,
  unwrapLabelText,
} from '../domain/types';
import {
  formatMuscleLabel,
  formatPercent,
  formatTrimmedNumber,
  secondsToMinutes,
} from '../ui/formatters';
import { getMuscleColor } from '../ui/muscleColors';
import {
  BreakdownGroupByKey,
  BreakdownMetricKey,
  BreakdownQuery,
  DistributionItem,
} from '../domain/analytics';
import { AnalyticsInlineSelect } from '../components/analytics/AnalyticsInlineSelect';
import {
  breakdownGroupOptions,
  breakdownMetricOptions,
  unitForBreakdownMetric,
} from '../components/analytics/analyticsBreakdown';
import { DonutChart, DonutSlice } from '../components/analytics/DonutChart';
import { useAnalyticsData } from '../components/analytics/AnalyticsDataContext';
import { useAppState } from '../state/appContext';
import { toAnalyticsInputEvents } from '../components/analytics/analyticsPayload';

const AnalyticsBreakdown = () => {
  const state = useAppState();
  const {
    loading,
    error,
    catalog,
    eventsByRange,
    eventsPayloadByRange,
    catalogLookup,
    eventsRevision,
    catalogRevision,
  } = useAnalyticsData();
  const themeKey = `${state.preferences.themeMode}:${
    state.preferences.themeAccent
  }:${state.preferences.customAccentHex ?? ''}`;
  const styles = useMemo(() => createStyles(), [themeKey]);
  const [range, setRange] = useState<AnalyticsRangeKey>('1m');
  const [metric, setMetric] = useState<BreakdownMetricKey>('volume');
  const [groupBy, setGroupBy] = useState<BreakdownGroupByKey>('muscle');
  const [showAllRows, setShowAllRows] = useState(false);
  const [activeSliceIndex, setActiveSliceIndex] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
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
    () => eventsByRange[range] ?? [],
    [eventsByRange, range],
  );
  const filteredPayload = useMemo(
    () => eventsPayloadByRange[range] ?? [],
    [eventsPayloadByRange, range],
  );

  const categoryLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (!catalog) return map;
    catalog.forEach(entry => {
      const name = entry.display_name;
      const modality = entry.modality;
      if (typeof name === 'string' && typeof modality === 'string') {
        map.set(name, modality.toLowerCase());
      }
    });
    return map;
  }, [catalog]);

  const metricOptions = useMemo(() => {
    if (!catalog || filteredEvents.length === 0) {
      return [];
    }
    const signals = metricSignalsFromEvents(filteredEvents);
    return breakdownMetricOptions.filter(option =>
      isBreakdownMetricRelevant(option.key, signals),
    );
  }, [catalog, filteredEvents]);

  useEffect(() => {
    if (metricOptions.length === 0) return;
    if (!metricOptions.some(option => option.key === metric)) {
      setMetric(metricOptions[0].key);
    }
  }, [metric, metricOptions]);

  const breakdown = useMemo(() => {
    if (!catalog || filteredEvents.length === 0) return null;
    const offset = new Date().getTimezoneOffset();
    const query: BreakdownQuery = {
      metric,
      group_by: groupBy,
    };
    return computeBreakdownAnalytics(filteredPayload, -offset, catalog, query, {
      trace: 'trends/breakdown',
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
    groupBy,
    metric,
  ]);

  useEffect(() => {
    setShowAllRows(false);
  }, [groupBy, metric, range]);

  useEffect(() => {
    setActiveSliceIndex(0);
    setSelectedLabel(null);
  }, [groupBy, metric, range]);

  const chartItems = useMemo(() => {
    if (!breakdown || breakdown.items.length === 0) return [];
    const maxRows = groupBy === 'exercise' ? 8 : 6;
    if (showAllRows || breakdown.items.length <= maxRows)
      return breakdown.items;
    return breakdown.items.slice(0, maxRows);
  }, [breakdown, groupBy, showAllRows]);

  const decoratedItems = useMemo(() => {
    return chartItems.map((item, index) => ({
      ...item,
      color: colorForBreakdownItem(item, index, groupBy),
    }));
  }, [chartItems, groupBy]);

  useEffect(() => {
    if (activeSliceIndex < decoratedItems.length) return;
    setActiveSliceIndex(0);
  }, [activeSliceIndex, decoratedItems.length]);

  const selectedGroupTotals = useMemo(() => {
    if (!catalog || !selectedLabel) return null;
    const labelKey = normalizeBreakdownKey(selectedLabel);
    const eventsForGroup = filteredEvents.filter(event => {
      const exercise = event.payload?.exercise;
      if (typeof exercise !== 'string') return false;
      if (groupBy === 'exercise') {
        return normalizeBreakdownKey(exercise) === labelKey;
      }
      if (groupBy === 'muscle') {
        const muscle = catalogLookup.get(exercise);
        return (
          typeof muscle === 'string' &&
          normalizeBreakdownKey(muscle) === labelKey
        );
      }
      const category = categoryLookup.get(exercise);
      return (
        typeof category === 'string' &&
        normalizeBreakdownKey(category) === labelKey
      );
    });
    if (!eventsForGroup.length) return null;
    const offset = new Date().getTimezoneOffset();
    const inputEvents = toAnalyticsInputEvents(eventsForGroup);
    return computeBreakdownAnalytics(
      inputEvents,
      -offset,
      catalog,
      {
        metric,
        group_by: groupBy,
      },
      {
        trace: 'trends/breakdown-selected-group',
        cache: {
          enabled: true,
          eventsRevision,
          catalogRevision,
        },
      },
    ).totals;
  }, [
    catalog,
    catalogRevision,
    catalogLookup,
    categoryLookup,
    eventsRevision,
    filteredEvents,
    groupBy,
    metric,
    selectedLabel,
  ]);

  const donutSlices = useMemo<DonutSlice[]>(() => {
    return decoratedItems.map(item => ({
      key: asDisplayLabel(formatBreakdownLabel(item.label, groupBy)),
      label: asDisplayLabel(formatBreakdownLabel(item.label, groupBy)),
      percent: item.percentage,
      valueText: `${formatMetricValue(item.value, metric)}${
        unitForBreakdownMetric(metric)
          ? ` ${unitForBreakdownMetric(metric)}`
          : ''
      } · ${formatPercent(item.percentage)}`,
      color: item.color,
    }));
  }, [decoratedItems, groupBy, metric]);

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
          Unable to load breakdown
        </Text>
        <Text style={[typography.label, { marginTop: spacing(1) }]}>
          {error}
        </Text>
      </View>
    );
  }

  const metricLabel =
    metricOptions.find(option => option.key === metric)?.label ??
    asLabelText('Metric');
  const groupLabel =
    breakdownGroupOptions.find(option => option.key === groupBy)?.label ??
    asLabelText('Group');
  const unitLabel = unitForBreakdownMetric(metric);
  const hasRows = decoratedItems.length > 0;
  const totals = breakdown?.totals ?? {
    workouts: 0,
    sets: 0,
    reps: 0,
    volume: 0,
  };
  const visibleTotals = selectedGroupTotals ?? totals;

  return (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      scrollEnabled={!interactionLocked}
    >
      <Card variant="analytics" style={{ gap: spacing(1.5) }}>
        <View style={styles.headerBlock}>
          <SectionHeading label={asLabelText('Breakdown')} />
          <View style={styles.rangeRow}>
            <AnalyticsRangeSelector
              selected={range}
              onSelect={setRange}
              onInteractionLockChange={handleInteractionLockChange}
            />
          </View>
        </View>
        <BodyText style={{ color: palette.mutedText }}>
          {unwrapLabelText(metricLabel)} by {unwrapLabelText(groupLabel)}
        </BodyText>
        <View style={styles.selectorRow}>
          <View style={styles.selectorCell}>
            {metricOptions.length > 0 ? (
              <AnalyticsInlineSelect
                title={asLabelText('Metric')}
                options={metricOptions}
                selected={metric}
                onSelect={setMetric}
                onInteractionLockChange={handleInteractionLockChange}
              />
            ) : (
              <View style={{ gap: spacing(0.5) }}>
                <Text style={typography.label}>METRIC</Text>
                <Text style={typography.label}>
                  No metrics available for this range
                </Text>
              </View>
            )}
          </View>
          <View style={styles.selectorCell}>
            <AnalyticsInlineSelect
              title={asLabelText('Group')}
              options={breakdownGroupOptions}
              selected={groupBy}
              onSelect={setGroupBy}
              onInteractionLockChange={handleInteractionLockChange}
              justified
            />
          </View>
        </View>
        {hasRows ? (
          <>
            <View style={styles.donutWrap}>
              <DonutChart
                data={donutSlices}
                radius={58}
                innerRadius={30}
                interactive
                activeIndex={selectedLabel ? activeSliceIndex : null}
                onActiveIndexChange={index => {
                  setActiveSliceIndex(index);
                  setSelectedLabel(decoratedItems[index]?.label ?? null);
                }}
                onInteractionLockChange={handleInteractionLockChange}
              />
            </View>
            <View style={styles.legend}>
              {selectedLabel ? (
                <TouchableOpacity onPress={() => setSelectedLabel(null)}>
                  <Text style={[styles.toggleRows, { color: palette.primary }]}>
                    All
                  </Text>
                </TouchableOpacity>
              ) : null}
              {decoratedItems.map((item, index) => (
                <BreakdownRow
                  key={`${item.label}-${index}`}
                  item={item}
                  groupBy={groupBy}
                  unit={unitLabel}
                  metric={metric}
                  styles={styles}
                  active={selectedLabel === item.label}
                  onPress={() => {
                    setActiveSliceIndex(index);
                    setSelectedLabel(item.label);
                  }}
                />
              ))}
              {breakdown && breakdown.items.length > chartItems.length ? (
                <TouchableOpacity onPress={() => setShowAllRows(true)}>
                  <Text style={[styles.toggleRows, { color: palette.primary }]}>
                    Show all
                  </Text>
                </TouchableOpacity>
              ) : null}
              {showAllRows && breakdown && breakdown.items.length > 6 ? (
                <TouchableOpacity onPress={() => setShowAllRows(false)}>
                  <Text style={[styles.toggleRows, { color: palette.primary }]}>
                    Show fewer
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </>
        ) : (
          <Text style={typography.label}>
            No data for this metric in the selected range
          </Text>
        )}
        {typeof breakdown?.qa_unmapped_events === 'number' &&
        breakdown.qa_unmapped_events > 0 ? (
          <Text style={styles.qaHint}>
            {breakdown.qa_unmapped_events} entries are currently unmapped.
          </Text>
        ) : null}
      </Card>
      <Card variant="analytics" style={{ gap: spacing(1.5) }}>
        <SectionHeading
          label={asLabelText(
            selectedLabel
              ? `Totals (${formatBreakdownLabel(selectedLabel, groupBy)})`
              : 'Totals',
          )}
        />
        <View style={styles.totalsGrid}>
          <TotalsCell
            label={asLabelText('Workouts')}
            value={formatNumericValue(visibleTotals.workouts)}
            styles={styles}
          />
          <TotalsCell
            label={asLabelText('Sets')}
            value={formatNumericValue(visibleTotals.sets)}
            styles={styles}
          />
          <TotalsCell
            label={asLabelText('Reps')}
            value={formatNumericValue(visibleTotals.reps)}
            styles={styles}
          />
          <TotalsCell
            label={asLabelText('Volume')}
            value={formatNumericValue(visibleTotals.volume)}
            styles={styles}
          />
          {typeof visibleTotals.distance === 'number' &&
          visibleTotals.distance > 0 ? (
            <TotalsCell
              label={asLabelText('Distance')}
              value={`${formatNumericValue(visibleTotals.distance)} m`}
              styles={styles}
            />
          ) : null}
          {typeof visibleTotals.active_duration === 'number' &&
          visibleTotals.active_duration > 0 ? (
            <TotalsCell
              label={asLabelText('Active duration')}
              value={`${formatTrimmedNumber(
                secondsToMinutes(visibleTotals.active_duration),
              )} min`}
              styles={styles}
            />
          ) : null}
          {typeof visibleTotals.load_distance === 'number' &&
          visibleTotals.load_distance > 0 ? (
            <TotalsCell
              label={asLabelText('Load distance')}
              value={`${formatNumericValue(visibleTotals.load_distance)} kg*m`}
              styles={styles}
            />
          ) : null}
        </View>
      </Card>
    </ScrollView>
  );
};

const BreakdownRow = ({
  item,
  groupBy,
  unit,
  metric,
  styles,
  active,
  onPress,
}: {
  item: DistributionItem & { color?: ColorHex };
  groupBy: BreakdownGroupByKey;
  unit: string;
  metric: BreakdownMetricKey;
  styles: ReturnType<typeof createStyles>;
  active?: boolean;
  onPress?: () => void;
}) => {
  const label = formatBreakdownLabel(item.label, groupBy);
  const barColor = item.color ?? palette.primary;

  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: barColor }]} />
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress}
        style={[
          { flex: 1, borderRadius: 10, paddingVertical: spacing(0.25) },
          active ? { backgroundColor: `${palette.mutedSurface}99` } : null,
        ]}
      >
        <Text
          style={[
            styles.rowLabel,
            active ? styles.rowLabelActive : null,
            active ? { color: palette.primary } : null,
          ]}
        >
          {label}
        </Text>
        <Text style={styles.rowValue}>
          {formatMetricValue(item.value, metric)}
          {unit ? ` ${unit}` : ''} • {formatPercent(item.percentage)}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const TotalsCell = ({
  label,
  value,
  styles,
}: {
  label: ReturnType<typeof asLabelText>;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.totalsCell}>
    <Text style={styles.totalsLabel}>{unwrapLabelText(label)}</Text>
    <Text style={styles.totalsValue}>{value}</Text>
  </View>
);

const formatNumericValue = (value: number): string =>
  Math.round(value).toLocaleString('en-US');

const formatMetricValue = (
  value: number,
  metric: BreakdownMetricKey,
): string => {
  if (metric === 'active_duration') {
    return formatTrimmedNumber(secondsToMinutes(value));
  }
  return formatNumericValue(value);
};

const formatBreakdownLabel = (
  label: string,
  groupBy: BreakdownGroupByKey,
): string => {
  if (groupBy === 'muscle') {
    return unwrapDisplayLabel(formatMuscleLabel(asMuscleGroup(label)));
  }
  return label
    .split('_')
    .map(segment =>
      segment.length ? segment[0].toUpperCase() + segment.slice(1) : '',
    )
    .join(' ');
};

const normalizeBreakdownKey = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ');

const colorForBreakdownItem = (
  item: DistributionItem,
  index: number,
  groupBy: BreakdownGroupByKey,
) => {
  if (groupBy === 'muscle') {
    return getMuscleColor(asMuscleGroup(item.label));
  }
  const colorRamp = [
    palette.primary,
    palette.primaryMuted,
    palette.warning,
    palette.success,
    palette.danger,
    palette.border,
  ];
  return colorRamp[index % colorRamp.length];
};

const createStyles = () => ({
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
    flexDirection: 'column' as const,
    gap: spacing(1.5),
  },
  selectorCell: {
    width: '100%' as const,
  },
  donutWrap: {
    width: '100%' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginVertical: spacing(0.5),
  },
  legend: {
    width: '100%' as const,
    gap: spacing(1),
  },
  legendRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: spacing(1),
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  rowLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: '600' as const,
    flexShrink: 1,
  },
  rowLabelActive: {
    fontWeight: '700' as const,
  },
  rowValue: {
    color: palette.mutedText,
    fontSize: 12,
  },
  toggleRows: {
    fontSize: 12,
    fontWeight: '600' as const,
    marginTop: spacing(0.5),
  },
  qaHint: {
    color: palette.mutedText,
    fontSize: 11,
  },
  totalsGrid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: spacing(1.5),
  },
  totalsCell: {
    width: '47%' as const,
    paddingVertical: spacing(0.5),
    paddingHorizontal: spacing(1),
    borderRadius: 12,
    backgroundColor: palette.mutedSurface,
  },
  totalsLabel: {
    color: palette.mutedText,
    fontSize: 11,
    fontWeight: '600' as const,
    textTransform: 'uppercase' as const,
  },
  totalsValue: {
    color: palette.text,
    fontSize: 16,
    fontWeight: '700' as const,
  },
});

export default AnalyticsBreakdown;
