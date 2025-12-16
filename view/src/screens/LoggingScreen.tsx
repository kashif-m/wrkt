import React, { useEffect, useMemo, useState } from "react"
import { ScrollView, Text, TextInput, View, TouchableOpacity } from "react-native"
import { insertEvent } from "../storage"
import { WorkoutEvent, WorkoutState, logSet } from "../workoutFlows"
import { Card, Divider, PrimaryButton, BodyText } from "../ui/components"
import { palette, radius, spacing } from "../ui/theme"
import { ExerciseCatalogEntry, fetchMergedCatalog } from "../exercise/catalogStorage"
import { roundToLocalDay } from "../timePolicy"

type Props = {
  state: WorkoutState
  onStateChange: (state: WorkoutState) => void
  refreshFromStorage: () => Promise<void>
  prefillExerciseName?: string
}

const sessionTabs = ["Track", "History", "Trends"] as const
type SessionTab = (typeof sessionTabs)[number]

const INITIAL_FIELDS = { reps: "", weight: "", duration: "", distance: "" }
type FieldKey = keyof typeof INITIAL_FIELDS
type FieldConfig = {
  key: FieldKey
  label: string
  unit?: string
  step: number
}

const FIELD_CONFIGS: Record<string, FieldConfig[]> = {
  reps_weight: [
    { key: "weight", label: "Weight", unit: "kg", step: 2.5 },
    { key: "reps", label: "Reps", unit: "reps", step: 1 },
  ],
  reps: [{ key: "reps", label: "Reps", unit: "reps", step: 1 }],
  time_distance: [
    { key: "duration", label: "Time", unit: "min", step: 0.5 },
    { key: "distance", label: "Distance", unit: "m", step: 50 },
  ],
  distance_time: [
    { key: "distance", label: "Distance", unit: "m", step: 50 },
    { key: "duration", label: "Time", unit: "min", step: 0.5 },
  ],
  default: [
    { key: "reps", label: "Reps", unit: "reps", step: 1 },
    { key: "weight", label: "Weight", unit: "kg", step: 2.5 },
  ],
}

const LoggingScreen = ({ state, onStateChange, refreshFromStorage, prefillExerciseName }: Props) => {
  const [catalog, setCatalog] = useState<ExerciseCatalogEntry[]>([])
  const [selectedExercise, setSelectedExercise] = useState<ExerciseCatalogEntry | null>(null)
  const [fields, setFields] = useState(INITIAL_FIELDS)
  const [sessionTab, setSessionTab] = useState<SessionTab>("Track")
  const [loggingDate] = useState(new Date())
  const [prefillApplied, setPrefillApplied] = useState(false)

  useEffect(() => {
    fetchMergedCatalog()
      .then((list) => {
        console.log("LoggingScreen: catalog loaded", list.length)
        setCatalog(list)
      })
      .catch((error) => console.warn("Failed to load catalog", error))
  }, [])

  useEffect(() => {
    setPrefillApplied(false)
  }, [prefillExerciseName])

  useEffect(() => {
    if (!prefillExerciseName || prefillApplied || catalog.length === 0) return
    const match = catalog.find((entry) => entry.display_name === prefillExerciseName)
    if (match) {
      setSelectedExercise(match)
      setPrefillApplied(true)
    }
  }, [prefillExerciseName, prefillApplied, catalog])

  const fieldDefinitions = useMemo(() => {
    return selectedExercise
      ? FIELD_CONFIGS[selectedExercise.logging_mode] ?? FIELD_CONFIGS.default
      : FIELD_CONFIGS.default
  }, [selectedExercise])

  const todaySets = useMemo(() => {
    if (!selectedExercise) return []
    const start = new Date(loggingDate)
    start.setHours(0, 0, 0, 0)
    return state.events.filter((event) => {
      const exerciseName = formatValue(event.payload?.exercise)
      return exerciseName === selectedExercise.display_name && event.ts >= start.getTime()
    })
  }, [state.events, selectedExercise, loggingDate])

  const historySets = useMemo(() => {
    if (!selectedExercise) return []
    return state.events.filter(
      (event) => formatValue(event.payload?.exercise) === selectedExercise.display_name,
    )
  }, [state.events, selectedExercise])

  useEffect(() => {
    if (!selectedExercise) {
      setFields(INITIAL_FIELDS)
      return
    }
    const sorted = [...historySets].sort((a, b) => b.ts - a.ts)
    const lastEvent = sorted[0]
    if (!lastEvent) {
      setFields(INITIAL_FIELDS)
      return
    }
    setFields(fieldsFromEvent(lastEvent))
  }, [selectedExercise, historySets])

  const groupedHistory = useMemo(() => {
    const groups = new Map<number, WorkoutEvent[]>()
    historySets.forEach((event) => {
      const day = roundToLocalDay(event.ts)
      const bucket = groups.get(day) ?? []
      bucket.push(event)
      groups.set(day, bucket)
    })
    return [...groups.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([day, events]) => ({
        day,
        label: new Date(day).toLocaleDateString(undefined, {
          weekday: "long",
          month: "short",
          day: "numeric",
        }),
        events: events.sort((a, b) => b.ts - a.ts),
      }))
  }, [historySets])

  const trendData = useMemo(() => {
    if (!historySets.length) return []
    const last = historySets.slice(-12)
    return last.map((event) => {
      const reps = Number(event.payload?.reps) || 0
      const weight = Number(event.payload?.weight) || 0
      const distance = Number(event.payload?.distance) || 0
      const duration = Number(event.payload?.duration) || 0
      const volume = weight && reps ? weight * reps : distance || duration || reps
      return {
        label: new Date(event.ts).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value: volume,
      }
    })
  }, [historySets])

  const parseNumericField = (value: string): number | undefined => {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const parsed = Number(trimmed)
    return Number.isNaN(parsed) ? undefined : parsed
  }

  const trackDisabled =
    !selectedExercise ||
    fieldDefinitions.every((definition) => {
      const numericValue = parseNumericField(fields[definition.key])
      return typeof numericValue !== "number"
    })

  const handleAddSet = async () => {
    if (!selectedExercise) return
    const reps = parseNumericField(fields.reps)
    const weight = parseNumericField(fields.weight)
    const duration = parseNumericField(fields.duration)
    const distance = parseNumericField(fields.distance)
    const payload: WorkoutEvent["payload"] = {
      exercise: selectedExercise.display_name,
    }
    if (typeof reps === "number") payload.reps = reps
    if (typeof weight === "number") payload.weight = weight
    if (typeof duration === "number") payload.duration = duration
    if (typeof distance === "number") payload.distance = distance
    console.log("LoggingScreen: submitting payload", payload)
    const event = logSet(state, {
      event_id: `evt-${Date.now()}`,
      tracker_id: "workout",
      ts: Date.now(),
      payload,
      meta: {},
    })
    const nextState = await event
    onStateChange(nextState)
    await insertEvent(nextState.events[nextState.events.length - 1])
    await refreshFromStorage()
    const nextFields = { ...fields }
    if (typeof reps === "number") nextFields.reps = reps.toString()
    if (typeof weight === "number") nextFields.weight = weight.toString()
    if (typeof duration === "number") nextFields.duration = duration.toString()
    if (typeof distance === "number") nextFields.distance = distance.toString()
    setFields(nextFields)
    setSessionTab("Track")
  }

  const setFieldValue = (key: FieldKey, delta: number) => {
    setFields((prev) => {
      const current = parseFloat(prev[key]) || 0
      const next = Math.max(0, Math.round((current + delta) * 100) / 100)
      return { ...prev, [key]: next === 0 ? "" : next.toString() }
    })
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing(2), gap: spacing(2), paddingBottom: spacing(2) }}
      >
        {selectedExercise ? (
          <Card>
            <View
              style={{
                padding: spacing(1.5),
                borderRadius: 12,
                backgroundColor: addAlpha(getMuscleColor(selectedExercise?.primary_muscle_group), 0.2),
                marginBottom: spacing(1),
              }}
            >
              <Text style={{ color: palette.text, fontSize: 18, fontWeight: "700" }}>
                {selectedExercise.display_name}
              </Text>
              <Text style={{ color: palette.mutedText, marginTop: spacing(0.5) }}>
                {formatDateLabel(loggingDate)} Sets
              </Text>
              <Text style={{ color: palette.mutedText, textTransform: "capitalize" }}>
                {selectedExercise.primary_muscle_group.replace(/_/g, " ")} · {selectedExercise.modality}
              </Text>
            </View>
          </Card>
        ) : (
          <Card>
            <Text style={{ color: palette.mutedText }}>Select an exercise to log sets.</Text>
          </Card>
        )}

        {selectedExercise && (
          <Card>
            <View style={{ flexDirection: "row", gap: spacing(1), marginBottom: spacing(1) }}>
              {sessionTabs.map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setSessionTab(tab)}
                  style={{
                    flex: 1,
                    paddingVertical: spacing(1),
                    borderRadius: radius.card,
                    backgroundColor: sessionTab === tab ? palette.primary : palette.mutedSurface,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: sessionTab === tab ? "#0f172a" : palette.text, fontWeight: "600" }}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {sessionTab === "Track" && (
              <>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1) }}>
                  {fieldDefinitions.map((definition) => (
                    <Stepper
                      key={definition.key}
                      label={definition.label}
                      unit={definition.unit}
                      value={fields[definition.key]}
                      step={definition.step}
                      onIncrement={() => setFieldValue(definition.key, definition.step)}
                      onDecrement={() => setFieldValue(definition.key, -definition.step)}
                      onChange={(value) => setFields((prev) => ({ ...prev, [definition.key]: value }))}
                    />
                  ))}
                </View>
                <Divider />
                <Text style={{ fontSize: 14, fontWeight: "600", color: palette.mutedText, marginBottom: spacing(1) }}>
                  {formatDateLabel(loggingDate)} Sets
                </Text>
                {todaySets.length === 0 ? (
                  <BodyText style={{ color: palette.mutedText }}>No sets logged today.</BodyText>
                ) : (
                  todaySets.map((set) => (
                    <SetRow key={set.event_id} event={set} highlightColor={getMuscleColor(selectedExercise?.primary_muscle_group)} />
                  ))
                )}
              </>
            )}

            {sessionTab === "History" && (
              <>
                {groupedHistory.length === 0 ? (
                  <BodyText style={{ color: palette.mutedText }}>Log sets to unlock history.</BodyText>
                ) : (
                  groupedHistory.map((bucket) => (
                    <View key={bucket.day} style={{ marginBottom: spacing(1.5) }}>
                      <Text style={{ color: palette.mutedText, marginBottom: spacing(0.5) }}>{bucket.label}</Text>
                      {bucket.events.map((event) => (
                        <SetRow key={event.event_id} event={event} compact />
                      ))}
                    </View>
                  ))
                )}
              </>
            )}

            {sessionTab === "Trends" && <TrendChart data={trendData} muscleColor={getMuscleColor(selectedExercise?.primary_muscle_group)} />}
          </Card>
        )}
      </ScrollView>

      {selectedExercise && (
        <View style={bottomCta}>
          <PrimaryButton label="Log set" onPress={handleAddSet} disabled={trackDisabled} />
        </View>
      )}
    </View>
  )
}

const bottomCta = {
  padding: spacing(2),
  borderTopWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.background,
}

const Stepper = ({
  label,
  unit,
  value,
  step,
  onIncrement,
  onDecrement,
  onChange,
}: {
  label: string
  unit?: string
  value: string
  step: number
  onIncrement: () => void
  onDecrement: () => void
  onChange: (value: string) => void
}) => (
  <View
    style={{
      flex: 1,
      minWidth: "45%",
      backgroundColor: palette.mutedSurface,
      borderRadius: radius.card,
      padding: spacing(1),
    }}
  >
    <Text style={{ color: palette.mutedText, marginBottom: spacing(0.5) }}>{label}</Text>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <TouchableOpacity
        onPress={onDecrement}
        style={{
          backgroundColor: palette.surface,
          width: 40,
          height: 40,
          borderRadius: radius.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: palette.text, fontSize: 18 }}>-</Text>
      </TouchableOpacity>
      <View style={{ alignItems: "center" }}>
        <Text style={{ color: palette.text, fontSize: 20, fontWeight: "600" }}>{value || "0"}</Text>
        {unit ? <Text style={{ color: palette.mutedText, fontSize: 12 }}>{unit}</Text> : null}
      </View>
      <TouchableOpacity
        onPress={onIncrement}
        style={{
          backgroundColor: palette.surface,
          width: 40,
          height: 40,
          borderRadius: radius.card,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ color: palette.text, fontSize: 18 }}>+</Text>
      </TouchableOpacity>
    </View>
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      placeholder={`Enter ${label.toLowerCase()}`}
      placeholderTextColor={palette.mutedText}
      style={{
        marginTop: spacing(1),
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: radius.card,
        paddingVertical: 8,
        paddingHorizontal: spacing(1),
        color: palette.text,
        backgroundColor: palette.surface,
      }}
    />
  </View>
)

const SetRow = ({ event, highlightColor, compact = false }: { event: WorkoutEvent; highlightColor?: string; compact?: boolean }) => {
  const reps = formatValue(event.payload?.reps)
  const weight = formatValue(event.payload?.weight)
  const duration = formatValue(event.payload?.duration)
  const distance = formatValue(event.payload?.distance)
  const description =
    weight !== "-" && reps !== "-"
      ? `${weight} kg × ${reps} reps`
      : duration !== "-"
        ? `${duration} min`
        : distance !== "-"
          ? `${distance} m`
          : "Set"

  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing(0.75),
        borderBottomWidth: compact ? 0 : 1,
        borderColor: palette.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            backgroundColor: highlightColor ?? palette.primary,
          }}
        />
        <Text style={{ color: palette.text }}>{description}</Text>
      </View>
      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
        {new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Text>
    </View>
  )
}

const formatDateLabel = (date: Date) => {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  if (diff === 0) return "Today"
  if (diff === -1) return "Yesterday"
  if (diff === 1) return "Tomorrow"
  return target.toLocaleDateString()
}

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "-"
  if (typeof value === "string") return value
  if (typeof value === "number") return value.toString()
  if (typeof value === "boolean") return value ? "Yes" : "No"
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ")
  return JSON.stringify(value)
}

const formatNumberInput = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") return value.toString()
  return String(value)
}

const fieldsFromEvent = (event: WorkoutEvent) => ({
  reps: formatNumberInput(event.payload?.reps),
  weight: formatNumberInput(event.payload?.weight),
  duration: formatNumberInput(event.payload?.duration),
  distance: formatNumberInput(event.payload?.distance),
})

const getMuscleColor = (group?: string | null) => {
  const colorMap: Record<string, string> = {
    chest: "#f472b6",
    back: "#22d3ee",
    legs: "#34d399",
    shoulders: "#f97316",
    triceps: "#fb7185",
    biceps: "#a78bfa",
    posterior_chain: "#38d3ee",
    cardio: "#2dd4bf",
    core: "#fbbf24",
    glutes: "#f472b6",
    grip: "#67e8f9",
  }
  if (!group) return palette.primary
  return colorMap[group] ?? palette.primary
}

const addAlpha = (hex: string, alpha: number) => {
  const normalized = Math.max(0, Math.min(1, alpha))
  const alphaHex = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${alphaHex}`
}

const TrendChart = ({ data, muscleColor }: { data: { label: string; value: number }[]; muscleColor: string }) => {
  if (!data.length) {
    return <BodyText style={{ color: palette.mutedText }}>Need more sessions to display trends.</BodyText>
  }
  const maxValue = Math.max(...data.map((point) => point.value)) || 1
  return (
    <View style={{ marginTop: spacing(1) }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 160, gap: spacing(1) }}>
        {data.map((point) => (
          <View key={`${point.label}-${point.value}`} style={{ flex: 1, alignItems: "center" }}>
            <View
              style={{
                width: 16,
                borderRadius: 8,
                backgroundColor: muscleColor,
                height: Math.max(8, (point.value / maxValue) * 140),
              }}
            />
            <Text style={{ color: palette.mutedText, fontSize: 10, marginTop: spacing(0.5) }}>
              {point.label}
            </Text>
          </View>
        ))}
      </View>
      <Text style={{ color: palette.mutedText, fontSize: 12, marginTop: spacing(1) }}>
        Volume calculated from recent sets.
      </Text>
    </View>
  )
}

export default LoggingScreen
