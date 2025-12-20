import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ScrollView, Text, TextInput, View, TouchableOpacity } from "react-native"
import { insertEvent, updateEvent as persistUpdatedEvent, removeEvent } from "../storage"
import { WorkoutEvent, WorkoutState, logSet, updateLoggedSet, deleteLoggedSet } from "../workoutFlows"
import { Card, Divider, PrimaryButton, BodyText } from "../ui/components"
import { palette, radius, spacing } from "../ui/theme"
import {
  ExerciseCatalogEntry,
  fetchMergedCatalog,
  loadFavoriteExercises,
  setExerciseFavorite,
} from "../exercise/catalogStorage"
import { roundToLocalDay } from "../timePolicy"
import { getMuscleColor } from "../ui/muscleColors"

type Props = {
  state: WorkoutState
  onStateChange: (state: WorkoutState) => void
  refreshFromStorage: () => Promise<void>
  prefillExerciseName?: string
  initialTab?: SessionTab
}

const sessionTabs = ["Track", "History", "Trends"] as const
export type SessionTab = (typeof sessionTabs)[number]

const INITIAL_FIELDS = { reps: "", weight: "", duration: "", distance: "" }
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

const LoggingScreen = ({
  state,
  onStateChange,
  refreshFromStorage,
  prefillExerciseName,
  initialTab = "Track",
}: Props) => {
  const [catalog, setCatalog] = useState<ExerciseCatalogEntry[]>([])
  const [selectedExercise, setSelectedExercise] = useState<ExerciseCatalogEntry | null>(null)
  const [fields, setFields] = useState(INITIAL_FIELDS)
  const [sessionTab, setSessionTab] = useState<SessionTab>(initialTab)
  const [selectedTrendRange, setSelectedTrendRange] = useState<TrendRangeKey>("3m")
  const [selectedMetric, setSelectedMetric] = useState<TrendMetricKey>("estimated_1rm")
  const [loggingDate] = useState(new Date())
  const [prefillApplied, setPrefillApplied] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [statusBanner, setStatusBanner] = useState<{ text: string; tone: "success" | "info" | "danger" } | null>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [favoriteSlugs, setFavoriteSlugs] = useState<string[]>([])
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    fetchMergedCatalog()
      .then((list) => {
        console.log("LoggingScreen: catalog loaded", list.length)
        setCatalog(list)
      })
      .catch((error) => console.warn("Failed to load catalog", error))
    loadFavoriteExercises().then(setFavoriteSlugs).catch((error) => console.warn("Failed to load favorites", error))
  }, [])

  useEffect(() => {
    setPrefillApplied(false)
  }, [prefillExerciseName])

  useEffect(() => {
    setEditingEventId(null)
  }, [selectedExercise])

  useEffect(() => {
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current)
      }
    }
  }, [])

  const showStatus = useCallback((text: string, tone: "success" | "info" | "danger" = "success") => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current)
    }
    setStatusBanner({ text, tone })
    statusTimerRef.current = setTimeout(() => {
      setStatusBanner(null)
    }, 2500)
  }, [])

  useEffect(() => {
    setSessionTab(initialTab)
  }, [initialTab])

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
    if (typeof payload.reps === "number") nextFields.reps = payload.reps.toString()
    if (typeof payload.weight === "number") nextFields.weight = payload.weight.toString()
    if (typeof payload.duration === "number") nextFields.duration = payload.duration.toString()
    if (typeof payload.distance === "number") nextFields.distance = payload.distance.toString()
    setFields(nextFields)
    setSessionTab("Track")
    showStatus("Training saved", "success")
  }

  const handleSelectSet = (event: WorkoutEvent) => {
    setEditingEventId(event.event_id)
    setFields(fieldsFromEvent(event))
    setSessionTab("Track")
  }

  const handleUpdateSet = async () => {
    if (!selectedExercise || !editingEventId) return
    const payload = buildPayloadFromFields(fields, selectedExercise.display_name)
    const nextState = await updateLoggedSet(state, editingEventId, payload)
    onStateChange(nextState)
    const updatedEvent = nextState.events.find((event) => event.event_id === editingEventId)
    if (updatedEvent) {
      await persistUpdatedEvent(updatedEvent)
    }
    await refreshFromStorage()
    setEditingEventId(null)
    showStatus("Set updated", "info")
  }

  const handleDeleteSet = async () => {
    if (!editingEventId) return
    const nextState = deleteLoggedSet(state, editingEventId)
    onStateChange(nextState)
    await removeEvent(editingEventId)
    await refreshFromStorage()
    setEditingEventId(null)
    setFields(INITIAL_FIELDS)
    showStatus("Set deleted", "danger")
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
      {searchVisible ? (
        <View style={searchOverlay}>
          <Card style={{ flex: undefined, width: "90%", maxHeight: "80%" }}>
            <Text style={{ color: palette.text, fontWeight: "700", marginBottom: spacing(1) }}>Find exercise</Text>
            <TextInput
              placeholder="Search exercises"
              placeholderTextColor={palette.mutedText}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: radius.card,
                paddingVertical: spacing(1),
                paddingHorizontal: spacing(1.5),
                color: palette.text,
                backgroundColor: palette.mutedSurface,
              }}
            />
            <ScrollView style={{ marginTop: spacing(1) }}>
              {catalog
                .filter((entry) =>
                  entry.display_name.toLowerCase().includes(searchQuery.trim().toLowerCase() || ""),
                )
                .map((entry) => (
                  <TouchableOpacity
                    key={entry.slug}
                    style={{
                      paddingVertical: spacing(1),
                      borderBottomWidth: 1,
                      borderColor: palette.border,
                    }}
                    onPress={() => {
                      setSelectedExercise(entry)
                      setSearchVisible(false)
                      setSearchQuery("")
                    }}
                  >
                    <Text style={{ color: palette.text, fontWeight: "600" }}>{entry.display_name}</Text>
                    <Text style={{ color: palette.mutedText, fontSize: 12 }}>{entry.primary_muscle_group}</Text>
                  </TouchableOpacity>
                ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setSearchVisible(false)} style={{ marginTop: spacing(1) }}>
              <Text style={{ color: palette.primary, fontWeight: "600", textAlign: "center" }}>Close</Text>
            </TouchableOpacity>
          </Card>
        </View>
      ) : null}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing(2), gap: spacing(2), paddingBottom: spacing(2) }}
      >
        {selectedExercise ? (
          <Card>
            {statusBanner ? (
              <View style={[statusContainer, statusTone(statusBanner.tone)]}>
                <Text style={{ color: palette.text, fontWeight: "600" }}>{statusBanner.text}</Text>
              </View>
            ) : null}
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
                <TouchableOpacity onPress={async () => {
                  const next = await setExerciseFavorite(
                    selectedExercise.slug,
                    !favoriteSlugs.includes(selectedExercise.slug),
                  )
                  setFavoriteSlugs(next)
                }}>
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
              <TouchableOpacity onPress={() => setSearchVisible(true)} style={changeExerciseButton}>
                <Text style={{ color: palette.text, fontWeight: "600" }}>Change exercise</Text>
              </TouchableOpacity>
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
                    <SetRow
                      key={set.event_id}
                      event={set}
                      highlightColor={getMuscleColor(selectedExercise?.primary_muscle_group)}
                      onPress={() => handleSelectSet(set)}
                      active={editingEventId === set.event_id}
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
                        onPress={() => setSelectedMetric(key as TrendMetricKey)}
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
                        onPress={() => setSelectedTrendRange(option.key)}
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

const statusContainer = {
  padding: spacing(1),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  marginBottom: spacing(1),
}

const statusTone = (tone: "success" | "info" | "danger") => {
  const toneColors = {
    success: palette.success,
    info: palette.primary,
    danger: palette.danger,
  } as const
  const color = toneColors[tone]
  return {
    backgroundColor: addAlpha(color, 0.18),
    borderColor: color,
  }
}

const dangerButton = {
  paddingVertical: spacing(1.25),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.danger,
  alignItems: "center" as const,
}

const changeExerciseButton = {
  marginTop: spacing(1),
  borderWidth: 1,
  borderColor: palette.border,
  borderRadius: radius.card,
  paddingVertical: spacing(0.5),
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

const describeLoggedSet = (event: WorkoutEvent) => {
  const reps = toNumber(event.payload?.reps)
  const weight = toNumber(event.payload?.weight)
  if (weight > 0 && reps > 0) {
    return `${weight} kg × ${reps} reps`
  }
  if (reps > 0) {
    return `${reps} reps`
  }
  return "0 reps"
}

const SetRow = ({
  event,
  highlightColor,
  compact = false,
  active = false,
  onPress,
}: {
  event: WorkoutEvent
  highlightColor?: string
  compact?: boolean
  active?: boolean
  onPress?: () => void
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
      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
        {new Date(event.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </Text>
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
  const payload: WorkoutEvent["payload"] = { exercise: exerciseName }
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
  return (
    <View style={{ marginTop: spacing(1) }}>
      <Text style={{ color: palette.text, fontWeight: "700", marginBottom: spacing(0.5) }}>
        {metricLabel}
      </Text>
      <Text style={{ color: palette.mutedText, marginBottom: spacing(1) }}>{rangeLabel}</Text>
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
      <Text style={{ color: palette.mutedText, fontSize: 12, marginTop: spacing(1) }}>{metricDescription}</Text>
    </View>
  )
}

const searchOverlay = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: "#000000aa",
  alignItems: "center" as const,
  justifyContent: "center" as const,
  zIndex: 10,
}

export default LoggingScreen
