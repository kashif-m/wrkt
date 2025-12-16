import React, { useMemo, useState } from "react"
import { ScrollView, View, Text, TextInput, Button } from "react-native"
import { insertEvent } from "../storage"
import { WorkoutState, logSet, WorkoutEvent } from "../workoutFlows"

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
    <View style={{ marginBottom: 16 }}>
      <Text>Logged sets: {state.events.length}</Text>
      {latest ? <Text>Latest: {stringifyJson(latest)}</Text> : null}
    </View>
  )
}

const statusMessages = {
  empty: "Exercise name is required",
  success: "Set logged successfully",
}

type MessageKey = keyof typeof statusMessages

const initialFields = { exercise: "", reps: "", weight: "" }

type FieldInputProps = {
  value: string
  label: string
  onChangeText: (text: string) => void
  keyboardType?: "default" | "numeric" | "email-address"
}

const FieldInput = ({ value, label, onChangeText, keyboardType = "default" }: FieldInputProps) => (
  <View style={{ marginBottom: 12 }}>
    <Text>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={label}
      keyboardType={keyboardType}
      style={{ borderColor: "#ccc", borderWidth: 1, padding: 8, borderRadius: 4 }}
    />
  </View>
)

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

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <LoggedEvents state={state} />
      {status ? <Text>{statusMessages[status]}</Text> : null}
      <FieldInput value={exercise} label="Exercise" onChangeText={setExercise} />
      <FieldInput value={reps} label="Reps" keyboardType="numeric" onChangeText={setReps} />
      <FieldInput value={weight} label="Weight (kg)" keyboardType="numeric" onChangeText={setWeight} />
      <Button title="Log Set" onPress={handleSubmit} disabled={!exercise.trim()} />
    </ScrollView>
  )
}

export default LoggingScreen
