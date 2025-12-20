import React, { useEffect, useMemo, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { WorkoutEvent } from "../workoutFlows"
import { roundToLocalDay } from "../timePolicy"
import { palette, radius, spacing, typography, fontSizes } from "../ui/theme"
import { Card } from "../ui/components"
import { ExerciseCatalogEntry, fetchMergedCatalog } from "../exercise/catalogStorage"
import { getMuscleColor } from "../ui/muscleColors"

type Props = {
  events: WorkoutEvent[]
  selectedDate: Date
  onSelectPreviousDay: () => void
  onSelectNextDay: () => void
  onOpenCalendar: () => void
  onStartExercise: () => void
  onSelectExerciseFromList: (exerciseName: string) => void
}

const HomeScreen = ({
  events,
  selectedDate,
  onSelectPreviousDay,
  onSelectNextDay,
  onOpenCalendar,
  onStartExercise,
  onSelectExerciseFromList,
}: Props) => {
  const [catalog, setCatalog] = useState<ExerciseCatalogEntry[]>([])
  const dayBucket = roundToLocalDay(selectedDate.getTime())
  const todayBucket = roundToLocalDay(Date.now())
  const isToday = dayBucket === todayBucket
  const monthYearLabel = selectedDate
    .toLocaleDateString(undefined, { month: "long", year: "numeric" })
    .toUpperCase()
  const secondaryLabel = isToday
    ? "Today"
    : selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric" })

  useEffect(() => {
    fetchMergedCatalog().then(setCatalog).catch(console.warn)
  }, [])

  const catalogMap = useMemo(() => {
    const map = new Map<string, ExerciseCatalogEntry>()
    catalog.forEach((entry) => map.set(entry.display_name, entry))
    return map
  }, [catalog])

  const dayExercises = useMemo(() => {
    const map = new Map<string, WorkoutEvent[]>()
    events.forEach((event) => {
      if (roundToLocalDay(event.ts) !== dayBucket) return
      const exercise = typeof event.payload?.exercise === "string" ? event.payload.exercise : "Exercise"
      const existing = map.get(exercise) ?? []
      existing.push(event)
      map.set(exercise, existing)
    })
    return Array.from(map.entries()).map(([exercise, sets]) => ({
      exercise,
      sets: [...sets].sort((a, b) => a.ts - b.ts),
    }))
  }, [events, dayBucket])

  const sections = useMemo(() => {
    const groupMap = new Map<
      string,
      { label: string; exercises: { name: string; sets: { description: string; count: number }[]; color: string }[] }
    >()
    dayExercises.forEach(({ exercise, sets }) => {
      const meta = catalogMap.get(exercise)
      const groupKey = meta?.primary_muscle_group ?? "untracked"
      const label = groupKey.replace(/_/g, " ").toUpperCase() || "UNTRACKED"
      const setChunks = summarizeSets(sets)
      const color = getMuscleColor(meta?.primary_muscle_group)
      const bucket = groupMap.get(groupKey) ?? { label, exercises: [] }
      bucket.exercises.push({ name: exercise, sets: setChunks, color })
      groupMap.set(groupKey, bucket)
    })
    return Array.from(groupMap.entries())
      .map(([key, section]) => ({ key, ...section }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [dayExercises, catalogMap])

  const emptyState = sections.length === 0

  return (
    <View style={{ flex: 1 }}>
      <View style={toolbarContainer}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
          <View style={appBadge}>
            <Text style={{ color: palette.text, fontWeight: "700" }}>WR</Text>
          </View>
          <Text style={[typography.title, { fontSize: 20 }]}>wrkt</Text>
        </View>
        <View style={{ flexDirection: "row", gap: spacing(1) }}>
          <IconButton label="CAL" onPress={onOpenCalendar} />
          <IconButton label="+" onPress={onStartExercise} />
        </View>
      </View>

      <View style={daySelector}>
        <TouchableOpacity onPress={onSelectPreviousDay} style={arrowButton}>
          <Text style={arrowLabel}>{"<"}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenCalendar} style={{ alignItems: "center" }}>
          <Text style={{ color: palette.text, fontSize: 12, letterSpacing: 1 }}>{monthYearLabel}</Text>
          <Text style={{ color: palette.mutedText, fontSize: 12 }}>
            {secondaryLabel} ·{" "}
            {selectedDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onSelectNextDay} style={arrowButton}>
          <Text style={arrowLabel}>{">"}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6), gap: spacing(2) }}>
        {emptyState ? (
          <Card style={{ alignItems: "center", paddingVertical: spacing(6) }}>
            <Text style={{ color: palette.mutedText, fontSize: 16 }}>Workout Log Empty</Text>
          </Card>
        ) : (
          sections.map((section) => (
            <Card key={section.key}>
              <Text style={{ color: palette.mutedText, fontSize: 12, textTransform: "uppercase", marginBottom: spacing(1) }}>
                {section.label}
              </Text>
              {section.exercises.map((exercise, index) => (
                <TouchableOpacity
                  key={`${exercise.name}-${index}`}
                  onPress={() => onSelectExerciseFromList(exercise.name)}
                  style={[exerciseRow, index !== section.exercises.length - 1 && exerciseRowDivider]}
                >
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(1) }}>
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          backgroundColor: exercise.color,
                        }}
                      />
                      <Text style={{ color: palette.text, fontSize: 16, fontWeight: "600" }}>{exercise.name}</Text>
                    </View>
                    <View style={{ marginTop: spacing(1) }}>
                      {exercise.sets.map((setItem, chunkIndex) => (
                        <Text key={`${exercise.name}-${chunkIndex}`} style={{ color: palette.mutedText, fontSize: 12 }}>
                          {formatSetLabel(setItem)}
                        </Text>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </Card>
          ))
        )}
        </ScrollView>
        <View style={bottomActions}>
          <PrimaryAction
            label="Start New Workout"
            onPress={() => {
              console.log("Home: start new workout tapped")
              onStartExercise()
            }}
          />
          <SecondaryAction
            label="Copy Previous Workout"
            onPress={() => console.log("Home: copy previous workout tapped")}
          />
        </View>
      </View>
    </View>
  )
}

const PrimaryAction = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: palette.primary,
      backgroundColor: palette.primary,
      paddingVertical: spacing(1.5),
      alignItems: "center",
    }}
  >
    <Text style={{ color: "#0f172a", fontWeight: "700", fontSize: fontSizes.actionButton }}>+ {label}</Text>
  </TouchableOpacity>
)

const SecondaryAction = ({
  label,
  onPress,
}: {
  label: string
  onPress?: () => void
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: palette.border,
      paddingVertical: spacing(1.5),
      alignItems: "center",
    }}
  >
    <Text style={{ color: palette.mutedText, fontWeight: "600", fontSize: fontSizes.actionButton }}>{label}</Text>
  </TouchableOpacity>
)

type SetChunk = { description: string; count: number }

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

const summarizeSets = (sets: WorkoutEvent[]): SetChunk[] => {
  const condensation: Array<{ description: string; count: number }> = []
  sets.forEach((event) => {
    const description = describeSet(event)
    const last = condensation[condensation.length - 1]
    if (last && last.description === description) {
      last.count += 1
    } else {
      condensation.push({ description, count: 1 })
    }
  })
  return condensation
}

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value
  const parsed = Number(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

const describeSet = (event: WorkoutEvent) => {
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

const formatSetLabel = (chunk: SetChunk) => {
  if (chunk.count === 1) {
    return chunk.description
  }
  return `${chunk.count} sets · ${chunk.description}`
}

const IconButton = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity onPress={onPress} style={iconButton}>
    <Text style={{ color: palette.text, fontSize: 16 }}>{label}</Text>
  </TouchableOpacity>
)

const toolbarContainer = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderColor: palette.border,
}

const appBadge = {
  width: 40,
  height: 40,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: palette.surface,
}

const iconButton = {
  paddingHorizontal: spacing(1),
  paddingVertical: spacing(0.5),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  backgroundColor: palette.surface,
}

const daySelector = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1),
  borderBottomWidth: 1,
  borderColor: palette.border,
}

const arrowButton = {
  width: 36,
  height: 36,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: palette.surface,
}

const arrowLabel = { color: palette.text, fontSize: 18 }

const exerciseRow = {
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  alignItems: "center" as const,
  paddingVertical: spacing(1.25),
}

const exerciseRowDivider = {
  borderBottomWidth: 1,
  borderColor: palette.border,
}

const bottomActions = {
  paddingHorizontal: spacing(2),
  paddingBottom: spacing(2.5),
  paddingTop: spacing(1.5),
  gap: spacing(1.5),
}


export default HomeScreen
