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
      const repsValue = formatValue(payload.reps)
      const weightValue =
        payload.weight != null && typeof payload.weight === "number"
          ? `${payload.weight} kg`
          : formatValue(payload.weight)
      const volumeValue =
        payload.reps != null && payload.weight != null
          ? `${Number(payload.reps) * Number(payload.weight)} kg·reps`
          : "-"
      return (
        <Card key={event.event_id ?? `${idx}`} style={{ gap: spacing(1) }}>
          <BodyText style={{ fontWeight: "600" }}>{formatValue(payload.exercise)}</BodyText>
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

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "-"
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number") {
    return value.toString()
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No"
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatValue(item)).join(", ")
  }
  return JSON.stringify(value)
}
