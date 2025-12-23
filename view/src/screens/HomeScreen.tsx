import React, { useEffect, useMemo, useState } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import Svg, { Path } from "react-native-svg"
import { WorkoutEvent } from "../workoutFlows"
import { roundToLocalDay } from "../timePolicy"
import { palette, radius, spacing, typography, fontSizes } from "../ui/theme"
import { Card } from "../ui/components"
import { ExerciseCatalogEntry, fetchMergedCatalog } from "../exercise/catalogStorage"
import { getMuscleColor } from "../ui/muscleColors"
import ChevronLeftIcon from "../assets/chevron-left.svg"
import ChevronRightIcon from "../assets/chevron-right.svg"
import PlusIcon from "../assets/plus.svg"
import TodayIcon from "../assets/today-target.svg"

type Props = {
  events: WorkoutEvent[]
  selectedDate: Date
  onSelectPreviousDay: () => void
  onSelectNextDay: () => void
  onOpenCalendar: () => void
  onJumpToToday: () => void
  onStartExercise: () => void
  onSelectExerciseFromList: (exerciseName: string) => void
}

const HomeScreen = ({
  events,
  selectedDate,
  onSelectPreviousDay,
  onSelectNextDay,
  onOpenCalendar,
  onJumpToToday,
  onStartExercise,
  onSelectExerciseFromList,
}: Props) => {
  const [catalog, setCatalog] = useState<ExerciseCatalogEntry[]>([])
  const dayBucket = roundToLocalDay(selectedDate.getTime())
  const todayBucket = roundToLocalDay(Date.now())
  const isToday = dayBucket === todayBucket
  const primaryLabel = isToday ? "Today" : selectedDate.toLocaleDateString(undefined, { weekday: "long" })
  const secondaryLabel = selectedDate.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  useEffect(() => {
    fetchMergedCatalog().then(setCatalog).catch(console.warn)
  }, [])

  const catalogMap = useMemo(() => {
    const map = new Map<string, ExerciseCatalogEntry>()
    catalog.forEach((entry) => map.set(entry.display_name, entry))
    return map
  }, [catalog])

  const dayEvents = useMemo(
    () =>
      events
        .filter((event) => roundToLocalDay(event.ts) === dayBucket)
        .sort((a, b) => a.ts - b.ts),
    [events, dayBucket],
  )

  const sections = useMemo(() => {
    const groupMap = new Map<
      string,
      {
        label: string
        firstTs: number
        exerciseOrder: string[]
        exerciseSets: Map<string, WorkoutEvent[]>
        exercises: {
          name: string
          sets: { description: string; count: number }[]
          color: string
          totalSets: number
        }[]
      }
    >()
    dayEvents.forEach((event) => {
      const exercise = typeof event.payload?.exercise === "string" ? event.payload.exercise : "Exercise"
      const meta = catalogMap.get(exercise)
      const groupKey = meta?.primary_muscle_group ?? "untracked"
      const label = groupKey.replace(/_/g, " ").toUpperCase() || "UNTRACKED"
      const color = getMuscleColor(meta?.primary_muscle_group)
      const bucket =
        groupMap.get(groupKey) ??
        {
          label,
          firstTs: event.ts,
          exerciseOrder: [],
          exerciseSets: new Map<string, WorkoutEvent[]>(),
          exercises: [],
        }
      if (!bucket.exerciseSets.has(exercise)) {
        bucket.exerciseSets.set(exercise, [])
        bucket.exerciseOrder.push(exercise)
      }
      bucket.exerciseSets.get(exercise)?.push(event)
      groupMap.set(groupKey, bucket)
    })
    return Array.from(groupMap.entries())
      .map(([key, section]) => {
        const exercises = section.exerciseOrder.map((name) => {
          const sets = section.exerciseSets.get(name) ?? []
          const setChunks = summarizeSets(sets)
          const meta = catalogMap.get(name)
          return {
            name,
            sets: setChunks,
            color: getMuscleColor(meta?.primary_muscle_group),
            totalSets: setChunks.reduce((total, chunk) => total + chunk.count, 0),
          }
        })
        return { key, ...section, exercises }
      })
      .sort((a, b) => a.firstTs - b.firstTs)
  }, [dayEvents, catalogMap])

  const emptyState = sections.length === 0
  const showStartCta = true
  const muscleChips = useMemo(() => {
    const total = sections.reduce((sum, section) => sum + section.exercises.length, 0)
    if (!total) return []
    return sections
      .map((section) => ({
        key: section.key,
        label: formatMuscleLabel(section.key),
        color: section.exercises[0]?.color,
        percent: Math.round((section.exercises.length / total) * 100),
      }))
      .sort((a, b) => b.percent - a.percent)
  }, [sections])

  const musclePieData = useMemo(() => {
    if (muscleChips.length <= 4) return muscleChips
    const top = muscleChips.slice(0, 3)
    const remainder = muscleChips.slice(3)
    const remainderPercent = remainder.reduce((sum, item) => sum + item.percent, 0)
    return [
      ...top,
      {
        key: "other",
        label: "Other",
        color: palette.mutedSurface,
        percent: remainderPercent,
      },
    ]
  }, [muscleChips])

  return (
    <View style={{ flex: 1 }}>
      <View style={daySelector}>
        <TouchableOpacity onPress={onSelectPreviousDay} style={arrowButton}>
          <ChevronLeftIcon width={20} height={20} color={palette.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenCalendar} style={{ alignItems: "center" }}>
          <Text style={{ color: palette.text, fontSize: 18, fontWeight: "600" }}>{primaryLabel}</Text>
          <Text style={{ color: palette.mutedText, fontSize: 12 }}>{secondaryLabel}</Text>
        </TouchableOpacity>
        <View style={{ flexDirection: "row", gap: spacing(0.75) }}>
          <TouchableOpacity onPress={onSelectNextDay} style={arrowButton}>
            <ChevronRightIcon width={20} height={20} color={palette.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onJumpToToday}
            style={[arrowButton, isToday && { opacity: 0.4 }]}
            disabled={isToday}
          >
            <TodayIcon width={18} height={18} color={palette.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6), gap: spacing(2) }}>
          <Card style={{ gap: spacing(1) }}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={[typography.title, { fontSize: 20 }]}>{primaryLabel}</Text>
                <Text style={{ color: palette.mutedText, fontSize: 12 }}>{secondaryLabel}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(0.5) }}>
                {showStartCta ? (
                  <PrimaryAction label="Start workout" onPress={onStartExercise} />
                ) : (
                  <View style={badge}>
                    <Text style={{ color: palette.text, fontWeight: "600", fontSize: 12 }}>
                      {events.filter((event) => roundToLocalDay(event.ts) === dayBucket).length} sets
                    </Text>
                  </View>
                )}
              </View>
            </View>
            {muscleChips.length > 0 ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(2) }}>
                <MusclePie data={musclePieData} radius={30} />
                <View style={{ flex: 1, gap: spacing(0.5) }}>
                  <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                    {sections.length} groups {isToday ? "logged today" : "logged"}
                  </Text>
                  {musclePieData.map((chip) => (
                    <View
                      key={chip.key}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing(0.5) }}>
                        <View style={[legendDot, { backgroundColor: chip.color ?? palette.primary }]} />
                        <Text style={{ color: palette.text, fontWeight: "600", fontSize: 12 }}>{chip.label}</Text>
                      </View>
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>{chip.percent}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : (
              <Text style={{ color: palette.mutedText }}>No muscles logged yet.</Text>
            )}
          </Card>

          {emptyState ? (
            <Card style={{ paddingVertical: spacing(3), alignItems: "center", gap: spacing(1) }}>
              <Text style={{ color: palette.text, fontWeight: "700", fontSize: 16 }}>Workout log empty</Text>
              <Text style={{ color: palette.mutedText, fontSize: 13 }}>Start a quick session for this day.</Text>
              {showStartCta ? <PrimaryAction label="Log workout" onPress={onStartExercise} /> : null}
            </Card>
          ) : (
            <View style={listContainer}>
              {sections.map((section, sectionIndex) => (
                <View key={section.key} style={sectionBlock}>
                  <Text style={sectionLabel}>{section.label}</Text>
                  {section.exercises.map((exercise, index) => (
                    <TouchableOpacity
                      key={`${exercise.name}-${index}`}
                      onPress={() => onSelectExerciseFromList(exercise.name)}
                      style={[listRow, index !== section.exercises.length - 1 && listRowDivider]}
                    >
                      <View style={{ flex: 1, gap: spacing(0.5) }}>
                        <Text style={{ color: palette.text, fontSize: 16, fontWeight: "600" }}>{exercise.name}</Text>
                        <View style={{ gap: spacing(0.25) }}>
                          {exercise.sets.slice(0, 5).map((setItem, chunkIndex) => (
                            <Text key={`${exercise.name}-${chunkIndex}`} style={{ color: palette.mutedText, fontSize: 12 }}>
                              {formatSetLabel(setItem)}
                            </Text>
                          ))}
                          {exercise.sets.length > 5 ? (
                            <Text style={{ color: palette.mutedText, fontSize: 12 }}>
                              + {countHiddenSets(exercise.sets)} more sets
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Text style={{ color: palette.mutedText, fontSize: 12 }}>{`${exercise.totalSets} ${
                        exercise.totalSets === 1 ? "set" : "sets"
                      }`}</Text>
                    </TouchableOpacity>
                  ))}
                  {sectionIndex !== sections.length - 1 ? <View style={sectionDivider} /> : null}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

    </View>
  )
}

const PrimaryAction = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: palette.primary,
      backgroundColor: palette.primary,
      paddingVertical: spacing(0.75),
      paddingHorizontal: spacing(1.5),
      alignItems: "center",
      flexDirection: "row",
      gap: spacing(0.5),
    }}
  >
    <PlusIcon width={16} height={16} color="#0f172a" />
    <Text style={{ color: "#0f172a", fontWeight: "700", fontSize: fontSizes.actionButton }}>{label}</Text>
  </TouchableOpacity>
)

type SetChunk = { description: string; count: number }

const formatMuscleLabel = (label: string) =>
  label
    .split("_")
    .map((part) => (part.length ? part[0].toUpperCase() + part.slice(1) : ""))
    .join(" ")

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
  const distance = toNumber(event.payload?.distance)
  const duration = toNumber(event.payload?.duration)
  if (weight > 0 && reps > 0) {
    return `${weight} kg × ${reps} reps`
  }
  if (reps > 0) {
    return `${reps} reps`
  }
  if (distance > 0 && duration > 0) {
    return `${distance} m / ${duration} s`
  }
  if (distance > 0) {
    return `${distance} m`
  }
  if (duration > 0) {
    return `${duration} s`
  }
  return "Logged set"
}

const formatSetLabel = (chunk: SetChunk) => {
  if (chunk.count === 1) {
    return chunk.description
  }
  return `${chunk.count} sets · ${chunk.description}`
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

const badge = {
  paddingHorizontal: spacing(1.25),
  paddingVertical: spacing(0.5),
  borderRadius: radius.pill,
  backgroundColor: palette.mutedSurface,
  borderWidth: 1,
  borderColor: palette.border,
}

const listContainer = {
  backgroundColor: palette.surface,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  padding: spacing(2),
  gap: spacing(1.5),
}

const sectionBlock = {
  gap: spacing(0.75),
}

const sectionLabel = {
  color: palette.mutedText,
  fontSize: 12,
  letterSpacing: 0.5,
  textTransform: "uppercase" as const,
}

const listRow = {
  flexDirection: "row" as const,
  justifyContent: "space-between" as const,
  alignItems: "flex-start" as const,
  paddingVertical: spacing(1),
}

const listRowDivider = {
  borderBottomWidth: 1,
  borderColor: palette.border,
}

const sectionDivider = {
  height: 1,
  backgroundColor: palette.border,
  marginTop: spacing(1),
}

const legendDot = {
  width: 8,
  height: 8,
  borderRadius: 999,
}

const MusclePie = ({
  data,
  radius = 36,
}: {
  data: { key: string; label: string; percent: number; color?: string }[]
  radius?: number
}) => {
  if (!data.length) return null
  const center = radius
  let currentAngle = 0
  const arcs = data.map((slice) => {
    const sweep = (slice.percent / 100) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + sweep
    currentAngle = endAngle
    return {
      key: slice.key,
      label: slice.label,
      color: slice.color ?? palette.primary,
      percent: slice.percent,
      path: describeArc(center, center, radius, startAngle, endAngle),
    }
  })
  return (
    <Svg width={radius * 2} height={radius * 2}>
      {arcs.map((arc) => (
        <Path key={arc.key} d={arc.path} fill={arc.color} opacity={0.9} />
      ))}
    </Svg>
  )
}

const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  }
}

const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
  const start = polarToCartesian(x, y, radius, endAngle)
  const end = polarToCartesian(x, y, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1
  return [`M ${x} ${y}`, `L ${start.x} ${start.y}`, `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`, "Z"].join(" ")
}

const countHiddenSets = (chunks: SetChunk[]) =>
  chunks.slice(5).reduce((total, chunk) => total + chunk.count, 0)


export default HomeScreen
