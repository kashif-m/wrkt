import React, { useMemo, useState } from "react"
import { ScrollView, Text, View } from "react-native"
import { insertEvent } from "../storage"
import { WorkoutState, logSet, WorkoutEvent } from "../workoutFlows"
import { Card, InputField, PrimaryButton, SectionHeading, BodyText } from "../ui/components"
import { palette, spacing } from "../ui/theme"

type Props = {
  state: WorkoutState
  onStateChange: (state: WorkoutState) => void
  refreshFromStorage: () => Promise<void>
}

const stringifyJson = (json: WorkoutEvent) => JSON.stringify(json, null, 2)

const makeEventId = () => {
  return `evt-${Date.now().toString()}`
}

const buildEvent = (exercise: string, repsText: string, weightText: string): WorkoutEvent => {
  const payload: NonNullable<WorkoutEvent["payload"]> = { exercise }
  if (repsText) payload.reps = Number(repsText)
  if (weightText) payload.weight = Number(weightText)

  return {
    event_id: makeEventId(),
    tracker_id: "workout",
    ts: Date.now(),
    payload,
    meta: {},
  }
}

const LoggedEvents = ({ state }: { state: WorkoutState }) => {
  const latest = useMemo(() => state.events[state.events.length - 1], [state.events])
  return (
    <Card style={{ marginBottom: spacing(2) }}>
      <SectionHeading label="Today’s progress" />
      <BodyText>Logged sets: {state.events.length}</BodyText>
      {latest ? (
        <View style={{ marginTop: spacing(1) }}>
          <Text style={{ color: palette.mutedText, fontSize: 12 }}>Last entry</Text>
          <Text style={{ color: palette.text, fontSize: 12 }}>{stringifyJson(latest)}</Text>
        </View>
      ) : null}
    </Card>
  )
}

const statusMessages = {
  empty: "Exercise name is required",
  success: "Set logged successfully",
}

type MessageKey = keyof typeof statusMessages

const initialFields = { exercise: "", reps: "", weight: "" }

const LoggingScreen = ({ state, onStateChange, refreshFromStorage }: Props) => {
  const [exercise, setExercise] = useState(initialFields.exercise)
  const [reps, setReps] = useState(initialFields.reps)
  const [weight, setWeight] = useState(initialFields.weight)
  const [status, setStatus] = useState<MessageKey | null>(null)

  const handleSubmit = async () => {
    if (!exercise.trim()) {
      setStatus("empty")
      return
    }
    const event = buildEvent(exercise.trim(), reps, weight)
    const nextState = await logSet(state, event)
    onStateChange(nextState)
    const normalized = nextState.events[nextState.events.length - 1]
    await insertEvent(normalized)
    await refreshFromStorage()
    setExercise("")
    setReps("")
    setWeight("")
    setStatus("success")
  }

  const statusColor = status === "success" ? palette.success : palette.warning

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6) }}
    >
      <LoggedEvents state={state} />
      <Card>
        <SectionHeading label="Log a set" />
        <BodyText style={{ color: palette.mutedText, marginBottom: spacing(1.5) }}>
          Track every effort and the engine will keep your insights fresh.
        </BodyText>
        {status ? (
          <Text style={{ color: statusColor, marginBottom: spacing(1) }}>{statusMessages[status]}</Text>
        ) : null}
        <InputField label="Exercise" value={exercise} onChangeText={setExercise} placeholder="Deadlift" />
        <InputField label="Reps" value={reps} onChangeText={setReps} keyboardType="numeric" placeholder="5" />
        <InputField
          label="Weight (kg)"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="120"
        />
        <PrimaryButton label="Log Set" onPress={handleSubmit} disabled={!exercise.trim()} />
      </Card>
    </ScrollView>
  )
}

export default LoggingScreen
