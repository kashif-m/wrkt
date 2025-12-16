import React from "react"
import { ScrollView, View } from "react-native"
import { WorkoutState } from "../workoutFlows"
import { Card, SectionHeading, BodyText, LabeledText } from "../ui/components"
import { spacing, palette } from "../ui/theme"

type Props = { state: WorkoutState }

const formatDate = (ts: number) => {
  const date = new Date(ts)
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const HistoryScreen = ({ state }: Props) => (
  <ScrollView
    style={{ flex: 1 }}
    contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6), gap: spacing(1.5) }}
  >
    <SectionHeading label="Workout history" />
    {state.events.map((event, idx) => {
      const payload = event.payload ?? {}
      const repsValue = payload.reps != null ? String(payload.reps) : "-"
      const weightValue = payload.weight != null ? `${payload.weight} kg` : "-"
      const volumeValue =
        payload.reps != null && payload.weight != null
          ? `${Number(payload.reps) * Number(payload.weight)} kg·reps`
          : "-"
      return (
        <Card key={event.event_id ?? `${idx}`} style={{ gap: spacing(1) }}>
          <BodyText style={{ fontWeight: "600" }}>{payload.exercise ?? "Unknown movement"}</BodyText>
          <BodyText style={{ color: palette.mutedText }}>{formatDate(event.ts)}</BodyText>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <LabeledText label="reps" value={repsValue} />
            <LabeledText label="weight" value={weightValue} />
            <LabeledText label="volume" value={volumeValue} />
          </View>
        </Card>
      )
    })}
  </ScrollView>
)

export default HistoryScreen
