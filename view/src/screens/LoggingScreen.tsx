import React, { useCallback, useMemo } from "react"
import { ScrollView, Text, TextInput, View, TouchableOpacity } from "react-native"
import Svg, { Polyline, Circle } from "react-native-svg"
import { WorkoutEvent } from "../workoutFlows"
import { Card, Divider, PrimaryButton, BodyText, ToastBanner } from "../ui/components"
import { palette, radius, spacing } from "../ui/theme"
import { roundToLocalDay } from "../timePolicy"
import { getMuscleColor } from "../ui/muscleColors"
import { useAppActions, useAppDispatch, useAppState } from "../state/appContext"
import { LoggingFields } from "../state/appState"

const sessionTabs = ["Track", "History", "Trends"] as const
export type SessionTab = (typeof sessionTabs)[number]

const INITIAL_FIELDS: LoggingFields = { reps: "", weight: "", duration: "", distance: "" }
type FieldKey = keyof typeof INITIAL_FIELDS
type FieldConfig = {
  key: FieldKey
  label: string
  unit?: string
  step: number
}

const trendRangeOptions = [
  { key: "1m", label: "1m", days: 30, longLabel: "Last 1 month" },
  { key: "3m", label: "3m", days: 90, longLabel: "Last 3 months" },
  { key: "6m", label: "6m", days: 180, longLabel: "Last 6 months" },
  { key: "1y", label: "1y", days: 365, longLabel: "Last year" },
  { key: "all", label: "All", days: null, longLabel: "All time" },
] as const
type TrendRangeKey = (typeof trendRangeOptions)[number]["key"]

type MetricDefinition = {
  label: string
  description: string
  reducer: "max" | "sum"
  compute: (event: WorkoutEvent) => number | undefined
}

const metricDefinitions = {
  estimated_1rm: {
    label: "Estimated 1RM",
    description: "Epley estimate based on top sets.",
    reducer: "max",
    compute: (event: WorkoutEvent) => {
      const weight = readNumber(event.payload?.weight)
      const reps = readNumber(event.payload?.reps)
      if (!weight || !reps) return undefined
      return Math.round(weight * (1 + reps / 30) * 10) / 10
    },
  },
  max_weight: {
    label: "Max Weight",
    description: "Heaviest set logged per day.",
    reducer: "max",
    compute: (event: WorkoutEvent) => {
      const weight = readNumber(event.payload?.weight)
      return weight && weight > 0 ? weight : undefined
    },
  },
  max_reps: {
    label: "Max Reps",
    description: "Highest rep count recorded.",
    reducer: "max",
    compute: (event: WorkoutEvent) => {
      const reps = readNumber(event.payload?.reps)
      return reps && reps > 0 ? reps : undefined
    },
  },
  max_volume: {
    label: "Max Volume",
    description: "Largest weight × reps combo for the day.",
    reducer: "max",
    compute: (event: WorkoutEvent) => {
      const weight = readNumber(event.payload?.weight)
      const reps = readNumber(event.payload?.reps)
      if (!weight || !reps) return undefined
      return weight * reps
    },
  },
  workout_volume: {
    label: "Workout Volume",
    description: "Total weight × reps per day.",
    reducer: "sum",
    compute: (event: WorkoutEvent) => {
      const weight = readNumber(event.payload?.weight)
      const reps = readNumber(event.payload?.reps)
      if (!weight || !reps) return undefined
      return weight * reps
    },
  },
  workout_reps: {
    label: "Workout Reps",
    description: "Total reps completed per day.",
    reducer: "sum",
    compute: (event: WorkoutEvent) => {
      const reps = readNumber(event.payload?.reps)
      return reps && reps > 0 ? reps : undefined
    },
  },
} satisfies Record<string, MetricDefinition>
type TrendMetricKey = keyof typeof metricDefinitions

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

const LoggingScreen = () => {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const actions = useAppActions()
  const catalog = state.catalog.entries
  const favoriteSlugs = state.catalog.favorites
  const selectedExercise = useMemo(
    () => catalog.find((entry) => entry.display_name === state.logging.exerciseName) ?? null,
    [catalog, state.logging.exerciseName],
  )
  const fields = state.logging.fields
  const sessionTab = state.logging.tab
  const selectedTrendRange = state.logging.selectedTrendRange
  const selectedMetric = state.logging.selectedMetric
  const loggingDate = state.logging.logDate
  const editingEventId = state.logging.editingEventId
  const statusBanner = state.logging.status

  const showStatus = useCallback(
    (text: string, tone: "success" | "info" | "danger" = "success") => {
      dispatch({ type: "log/status", status: { text, tone } })
    },
    [dispatch],
  )

  const fieldDefinitions = useMemo(() => {
    return selectedExercise
      ? FIELD_CONFIGS[selectedExercise.logging_mode] ?? FIELD_CONFIGS.default
      : FIELD_CONFIGS.default
  }, [selectedExercise])

  const todaySets = useMemo(() => {
    if (!selectedExercise) return []
    const start = new Date(loggingDate)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setDate(start.getDate() + 1)
    return state.events.filter((event) => {
      const exerciseName = formatValue(event.payload?.exercise)
      return (
        exerciseName === selectedExercise.display_name &&
        event.ts >= start.getTime() &&
        event.ts < end.getTime()
      )
    })
  }, [state.events, selectedExercise, loggingDate])

  const historySets = useMemo(() => {
    if (!selectedExercise) return []
    return state.events.filter(
      (event) => formatValue(event.payload?.exercise) === selectedExercise.display_name,
    )
  }, [state.events, selectedExercise])

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

  const prEventIds = useMemo(() => {
    const ids = historySets
      .filter((event) => event.payload?.pr === true)
      .map((event) => event.event_id)
    return new Set(ids)
  }, [historySets])

  const trendData = useMemo(() => {
    if (!historySets.length) return []
    const range = trendRangeOptions.find((option) => option.key === selectedTrendRange) ?? trendRangeOptions[0]
    const minTimestamp =
      range.days === null ? null : Date.now() - range.days * 24 * 60 * 60 * 1000
    const metricDef = metricDefinitions[selectedMetric]
    const grouped = new Map<number, number>()
    historySets.forEach((event) => {
      if (minTimestamp && event.ts < minTimestamp) return
      const metricValue = metricDef.compute(event)
      if (typeof metricValue !== "number") return
      const day = roundToLocalDay(event.ts)
      const current = grouped.get(day)
      if (metricDef.reducer === "sum") {
        grouped.set(day, (current ?? 0) + metricValue)
      } else {
        grouped.set(day, Math.max(current ?? Number.NEGATIVE_INFINITY, metricValue))
      }
    })
    return [...grouped.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, value]) => ({
        label: new Date(day).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        value,
      }))
  }, [historySets, selectedMetric, selectedTrendRange])

  const trackDisabled =
    !selectedExercise ||
    fieldDefinitions.every((definition) => {
      const numericValue = parseNumericField(fields[definition.key])
      return typeof numericValue !== "number"
    })

  const handleAddSet = async () => {
    if (!selectedExercise) return
    const payload = buildPayloadFromFields(fields, selectedExercise.display_name)
    console.log("LoggingScreen: submitting payload", payload)
    await actions.logSet(payload)
    const nextFields = { ...fields }
    if (typeof payload.reps === "number") nextFields.reps = payload.reps.toString()
    if (typeof payload.weight === "number") nextFields.weight = payload.weight.toString()
    if (typeof payload.duration === "number") nextFields.duration = payload.duration.toString()
    if (typeof payload.distance === "number") nextFields.distance = payload.distance.toString()
    dispatch({ type: "log/fields", fields: nextFields })
    dispatch({ type: "log/tab", tab: "Track" })
    showStatus("Training saved", "success")
  }

  const handleSelectSet = (event: WorkoutEvent) => {
    dispatch({ type: "log/editing", eventId: event.event_id })
    dispatch({ type: "log/fields", fields: fieldsFromEvent(event) })
    dispatch({ type: "log/tab", tab: "Track" })
  }

  const handleUpdateSet = async () => {
    if (!selectedExercise || !editingEventId) return
    const payload = buildPayloadFromFields(fields, selectedExercise.display_name)
    await actions.updateSet(editingEventId, payload)
    dispatch({ type: "log/editing", eventId: null })
    showStatus("Set updated", "info")
  }

  const handleDeleteSet = async () => {
    if (!editingEventId) return
    await actions.deleteSet(editingEventId)
    dispatch({ type: "log/editing", eventId: null })
    dispatch({ type: "log/fields", fields: { ...INITIAL_FIELDS } })
    showStatus("Set deleted", "danger")
  }

  const setFieldValue = (key: FieldKey, delta: number) => {
    const nextFields = { ...fields }
    const current = parseFloat(nextFields[key]) || 0
    const next = Math.max(0, Math.round((current + delta) * 100) / 100)
    nextFields[key] = next === 0 ? "" : next.toString()
    dispatch({ type: "log/fields", fields: nextFields })
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing(2), gap: spacing(2), paddingBottom: spacing(2) }}
      >
        {selectedExercise ? (
          <Card>
            {statusBanner ? <ToastBanner text={statusBanner.text} tone={statusBanner.tone} /> : null}
            <View
              style={{
                padding: spacing(1.5),
                borderRadius: 12,
                backgroundColor: addAlpha(getMuscleColor(selectedExercise?.primary_muscle_group), 0.2),
                marginBottom: spacing(1),
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: palette.text, fontSize: 18, fontWeight: "700" }}>
                  {selectedExercise.display_name}
                </Text>
                <TouchableOpacity
                  onPress={() => actions.toggleFavorite(selectedExercise.slug, !favoriteSlugs.includes(selectedExercise.slug))}
                >
                  <Text style={{ fontSize: 18, color: favoriteSlugs.includes(selectedExercise.slug) ? palette.primary : palette.mutedText }}>
                    {favoriteSlugs.includes(selectedExercise.slug) ? "★" : "☆"}
                  </Text>
                </TouchableOpacity>
              </View>
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
                  onPress={() => dispatch({ type: "log/tab", tab })}
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
                      onChange={(value) =>
                        dispatch({ type: "log/fields", fields: { ...fields, [definition.key]: value } })
                      }
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
                    <SetRow
                      key={set.event_id}
                      event={set}
                      highlightColor={getMuscleColor(selectedExercise?.primary_muscle_group)}
                      onPress={() => handleSelectSet(set)}
                      active={editingEventId === set.event_id}
                      pr={prEventIds.has(set.event_id)}
                      onPrPress={() => showStatus("Personal record set for this exercise.", "info")}
                    />
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
                        <SetRow
                          key={event.event_id}
                          event={event}
                          compact
                          onPress={() => handleSelectSet(event)}
                          active={editingEventId === event.event_id}
                          pr={prEventIds.has(event.event_id)}
                          onPrPress={() => showStatus("Personal record set for this exercise.", "info")}
                        />
                      ))}
                    </View>
                  ))
                )}
              </>
            )}

            {sessionTab === "Trends" && (
              <>
                <View style={{ marginBottom: spacing(1) }}>
                  <Text style={{ color: palette.mutedText, marginBottom: spacing(0.5), fontWeight: "600" }}>
                    Metric
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {Object.entries(metricDefinitions).map(([key, def]) => (
                      <TouchableOpacity
                        key={key}
                        onPress={() => dispatch({ type: "log/trendMetric", metric: key as TrendMetricKey })}
                        style={[
                          pillStyle,
                          selectedMetric === key && { backgroundColor: palette.primary },
                        ]}
                      >
                        <Text
                          style={{
                            color: selectedMetric === key ? "#0f172a" : palette.text,
                            fontWeight: "600",
                          }}
                        >
                          {def.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={{ marginBottom: spacing(1) }}>
                  <Text style={{ color: palette.mutedText, marginBottom: spacing(0.5), fontWeight: "600" }}>
                    Range
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1) }}>
                    {trendRangeOptions.map((option) => (
                      <TouchableOpacity
                        key={option.key}
                        onPress={() => dispatch({ type: "log/trendRange", range: option.key })}
                        style={[
                          pillStyle,
                          {
                            paddingVertical: spacing(0.5),
                            paddingHorizontal: spacing(1.5),
                          },
                          selectedTrendRange === option.key && { backgroundColor: palette.primary },
                        ]}
                      >
                        <Text
                          style={{
                            color: selectedTrendRange === option.key ? "#0f172a" : palette.text,
                            fontWeight: "600",
                          }}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <TrendChart
                  data={trendData}
                  muscleColor={getMuscleColor(selectedExercise?.primary_muscle_group)}
                  metricLabel={metricDefinitions[selectedMetric].label}
                  metricDescription={metricDefinitions[selectedMetric].description}
                  rangeLabel={
                    trendRangeOptions.find((option) => option.key === selectedTrendRange)?.longLabel ?? "Recent"
                  }
                />
              </>
            )}
          </Card>
        )}
      </ScrollView>

      {selectedExercise && (
        <View style={bottomCta}>
          {editingEventId ? (
            <>
              <PrimaryButton label="Update set" onPress={handleUpdateSet} disabled={trackDisabled} />
              <TouchableOpacity onPress={handleDeleteSet} style={dangerButton}>
                <Text style={{ color: palette.danger, fontWeight: "600" }}>Delete set</Text>
              </TouchableOpacity>
            </>
          ) : (
            <PrimaryButton label="Log set" onPress={handleAddSet} disabled={trackDisabled} />
          )}
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
  gap: spacing(1),
}

const dangerButton = {
  paddingVertical: spacing(1.25),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.danger,
  alignItems: "center" as const,
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

const pillStyle = {
  marginRight: spacing(1),
  borderRadius: radius.pill,
  borderWidth: 1,
  borderColor: palette.border,
  paddingVertical: spacing(0.75),
  paddingHorizontal: spacing(2),
  backgroundColor: palette.mutedSurface,
} as const

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const readNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

type LoggedSetPayload = {
  exercise: string
  reps?: number
  weight?: number
  duration?: number
  distance?: number
}

type LoggedSetRead = {
  exercise?: string
  reps?: number
  weight?: number
  duration?: number
  distance?: number
}

const readLoggedSetPayload = (event: WorkoutEvent): LoggedSetRead => ({
  exercise: typeof event.payload?.exercise === "string" ? event.payload.exercise : undefined,
  reps: readNumber(event.payload?.reps),
  weight: readNumber(event.payload?.weight),
  duration: readNumber(event.payload?.duration),
  distance: readNumber(event.payload?.distance),
})

const describeLoggedSet = (event: WorkoutEvent) => {
  const payload = readLoggedSetPayload(event)
  if (payload.weight && payload.reps) {
    return `${payload.weight} kg × ${payload.reps} reps`
  }
  if (payload.reps) {
    return `${payload.reps} reps`
  }
  if (payload.distance && payload.duration) {
    return `${payload.distance} m / ${payload.duration} s`
  }
  if (payload.distance) {
    return `${payload.distance} m`
  }
  if (payload.duration) {
    return `${payload.duration} s`
  }
  return "Logged set"
}

const SetRow = ({
  event,
  highlightColor,
  compact = false,
  active = false,
  onPress,
  pr = false,
  onPrPress,
}: {
  event: WorkoutEvent
  highlightColor?: string
  compact?: boolean
  active?: boolean
  onPress?: () => void
  pr?: boolean
  onPrPress?: () => void
}) => {
  const description = describeLoggedSet(event)

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: spacing(0.75),
        borderBottomWidth: compact ? 0 : 1,
        borderColor: palette.border,
        backgroundColor: active ? addAlpha(highlightColor ?? palette.primary, 0.15) : "transparent",
        paddingHorizontal: onPress ? spacing(0.5) : 0,
        borderRadius: active ? radius.card : 0,
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(0.5) }}>
        {pr ? (
          <TouchableOpacity onPress={onPrPress} disabled={!onPrPress} activeOpacity={0.7}>
            <Text style={{ color: palette.warning, fontSize: 12, fontWeight: "700" }}>★ PR</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>
          {new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
      </View>
    </TouchableOpacity>
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

const buildPayloadFromFields = (fieldsState: typeof INITIAL_FIELDS, exerciseName: string) => {
  const reps = parseNumericField(fieldsState.reps)
  const weight = parseNumericField(fieldsState.weight)
  const duration = parseNumericField(fieldsState.duration)
  const distance = parseNumericField(fieldsState.distance)
  const payload: LoggedSetPayload = { exercise: exerciseName }
  if (typeof reps === "number") payload.reps = reps
  if (typeof weight === "number") payload.weight = weight
  if (typeof duration === "number") payload.duration = duration
  if (typeof distance === "number") payload.distance = distance
  return payload
}

const parseNumericField = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const parsed = Number(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

const addAlpha = (hex: string, alpha: number) => {
  const normalized = Math.max(0, Math.min(1, alpha))
  const alphaHex = Math.round(normalized * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${alphaHex}`
}

const TrendChart = ({
  data,
  muscleColor,
  metricLabel,
  metricDescription,
  rangeLabel,
}: {
  data: { label: string; value: number }[]
  muscleColor: string
  metricLabel: string
  metricDescription: string
  rangeLabel: string
}) => {
  if (!data.length) {
    return <BodyText style={{ color: palette.mutedText }}>Need more sessions to display trends.</BodyText>
  }
  const maxValue = Math.max(...data.map((point) => point.value)) || 1
  const minValue = Math.min(...data.map((point) => point.value)) || 0
  const width = 320
  const height = 160
  const padding = 16
  const step = data.length > 1 ? (width - padding * 2) / (data.length - 1) : 0
  const points = data.map((point, index) => {
    const x = padding + step * index
    const range = Math.max(maxValue - minValue, 1)
    const normalized = (point.value - minValue) / range
    const y = height - padding - normalized * (height - padding * 2)
    return { x, y, label: point.label, value: point.value }
  })
  const linePath = points.map((point) => `${point.x},${point.y}`).join(" ")
  return (
    <View style={{ marginTop: spacing(1) }}>
      <Text style={{ color: palette.text, fontWeight: "700", marginBottom: spacing(0.5) }}>{metricLabel}</Text>
      <Text style={{ color: palette.mutedText, marginBottom: spacing(1) }}>{rangeLabel}</Text>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 44, justifyContent: "space-between", paddingRight: spacing(0.5) }}>
          <Text style={{ color: palette.mutedText, fontSize: 10, textAlign: "right" }}>
            {Math.round(maxValue)}
          </Text>
          <Text style={{ color: palette.mutedText, fontSize: 10, textAlign: "right" }}>
            {Math.round(minValue)}
          </Text>
        </View>
        <View>
          <Svg width={width} height={height}>
            <Polyline
              points={linePath}
              fill="none"
              stroke={muscleColor}
              strokeWidth={3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((point) => (
              <Circle key={`${point.label}-${point.value}`} cx={point.x} cy={point.y} r={4} fill={muscleColor} />
            ))}
          </Svg>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: spacing(0.5) }}>
            {points.map((point) => (
              <Text key={`label-${point.label}`} style={{ color: palette.mutedText, fontSize: 10 }}>
                {point.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
      <Text style={{ color: palette.mutedText, fontSize: 12, marginTop: spacing(1) }}>{metricDescription}</Text>
    </View>
  )
}

export default LoggingScreen
