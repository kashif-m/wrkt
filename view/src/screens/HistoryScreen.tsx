import React, { useMemo } from 'react';
import { ScrollView, View, Text } from 'react-native';
import { WorkoutEvent } from '../workoutFlows';
import { Card, SectionHeading, EmptyState, ListRow } from '../ui/components';
import { cardShadowStyle, spacing, palette, radius } from '../ui/theme';
import { roundToLocalDay } from '../timePolicy';
import { useAppState } from '../state/appContext';
import {
  ExerciseName,
  LabelText,
  asExerciseName,
  asLabelText,
} from '../domain/types';

const HistoryScreen = () => {
  const state = useAppState();
  const groupedDays = useMemo(() => {
    const buckets = new Map<number, WorkoutEvent[]>();
    state.events.forEach(event => {
      const day = roundToLocalDay(event.ts);
      const current = buckets.get(day) ?? [];
      current.push(event);
      buckets.set(day, current);
    });
    return Array.from(buckets.entries()).sort((a, b) => b[0] - a[0]);
  }, [state.events]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        padding: spacing(2),
        paddingBottom: spacing(6),
        gap: spacing(1.5),
      }}
    >
      <SectionHeading label={asLabelText('Workout history')} />
      {groupedDays.length === 0 ? (
        <Card>
          <EmptyState
            title={asLabelText('No workouts yet')}
            subtitle={asLabelText(
              'Log a session to start building your history.',
            )}
          />
        </Card>
      ) : (
        groupedDays.map(([day, events]) => {
          const dayLabel = new Date(day).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          });
          const summaries = summarizeDay(events);
          return (
            <View key={day} style={{ gap: spacing(0.75) }}>
              <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                {dayLabel}
              </Text>
              <View style={dayList}>
                {summaries.map((summary, index) => (
                  <ListRow
                    key={summary.exercise}
                    title={summary.exercise}
                    subtitle={summary.detail}
                    value={summary.setsLabel}
                    showDivider={index !== summaries.length - 1}
                  />
                ))}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
};

export default HistoryScreen;

const summarizeDay = (events: WorkoutEvent[]) => {
  const byExercise = new Map<ExerciseName, WorkoutEvent[]>();
  events.forEach(event => {
    const exercise = asExerciseName(
      String(event.payload?.exercise ?? 'Unlabeled'),
    );
    const bucket = byExercise.get(exercise) ?? [];
    bucket.push(event);
    byExercise.set(exercise, bucket);
  });
  return Array.from(byExercise.entries())
    .map(([exercise, sets]) => {
      const totals = sets.reduce(
        (acc, event) => {
          const reps = toNumber(event.payload?.reps);
          const weight = toNumber(event.payload?.weight);
          acc.reps += reps;
          acc.volume += reps * weight;
          return acc;
        },
        { reps: 0, volume: 0 },
      );
      const detailParts = [];
      if (totals.reps > 0) detailParts.push(`${totals.reps} reps`);
      if (totals.volume > 0)
        detailParts.push(`${Math.round(totals.volume)} kg·reps`);
      const detail = detailParts.length
        ? detailParts.join(' · ')
        : 'Logged sets';
      return {
        exercise: asLabelText(String(exercise)),
        detail: asLabelText(detail),
        setsLabel: asLabelText(
          `${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`,
        ),
        volume: totals.volume,
      };
    })
    .sort((a, b) => b.volume - a.volume);
};

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dayList = {
  backgroundColor: palette.surface,
  borderRadius: radius.card,
  borderWidth: 0,
  borderColor: 'transparent',
  ...cardShadowStyle,
  padding: spacing(1.5),
  gap: spacing(1),
};
