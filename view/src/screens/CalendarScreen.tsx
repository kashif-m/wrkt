import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  ViewStyle,
} from "react-native"
import { WorkoutEvent } from "../workoutFlows"
import { ExerciseCatalogEntry, fetchMergedCatalog } from "../exercise/catalogStorage"
import { getMuscleColor } from "../ui/muscleColors"
import { roundToLocalDay } from "../timePolicy"
import { palette, radius, spacing, typography } from "../ui/theme"

type Props = {
  events: WorkoutEvent[]
  selectedDate: Date
  onSelectDate: (date: Date) => void
  onClose: () => void
}

const DAYS_IN_WEEK = 7
const TOTAL_CELLS = 42
const DAY_NAMES = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"]
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

const CalendarScreen = ({ events, selectedDate, onSelectDate, onClose }: Props) => {
  const [catalog, setCatalog] = useState<ExerciseCatalogEntry[]>([])
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate))
  const monthAnim = useRef(new Animated.Value(1)).current
  const [activePicker, setActivePicker] = useState<"month" | "year" | null>(null)

  useEffect(() => {
    fetchMergedCatalog().then(setCatalog).catch(console.warn)
  }, [])

  useEffect(() => {
    setVisibleMonth(new Date(selectedDate))
  }, [selectedDate])

  const catalogMap = useMemo(() => {
    const map = new Map<string, ExerciseCatalogEntry>()
    catalog.forEach((entry) => map.set(entry.display_name, entry))
    return map
  }, [catalog])

  const dayColorMap = useMemo(() => {
    const buckets = new Map<number, string[]>()
    events.forEach((event) => {
      const day = roundToLocalDay(event.ts)
      const exerciseName = typeof event.payload?.exercise === "string" ? event.payload.exercise : null
      const meta = exerciseName ? catalogMap.get(exerciseName) : null
      const color = getMuscleColor(meta?.primary_muscle_group)
      const colors = buckets.get(day) ?? []
      if (!colors.includes(color)) {
        colors.push(color)
        buckets.set(day, colors)
      }
    })
    return buckets
  }, [events, catalogMap])

  const legendEntries = useMemo(() => {
    const groups = new Map<string, string>()
    events.forEach((event) => {
      const exerciseName = typeof event.payload?.exercise === "string" ? event.payload.exercise : null
      const meta = exerciseName ? catalogMap.get(exerciseName) : null
      const group = meta?.primary_muscle_group
      if (group && !groups.has(group)) {
        groups.set(group, getMuscleColor(group))
      }
    })
    return Array.from(groups.entries())
      .map(([group, color]) => ({
        key: group,
        label: group.replace(/_/g, " "),
        color,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [events, catalogMap])

  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth])
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: "long" })
  const yearLabel = visibleMonth.getFullYear()
  const yearOptions = useMemo(() => {
    const base = visibleMonth.getFullYear() - 4
    return Array.from({ length: 9 }, (_, index) => base + index)
  }, [visibleMonth])

  const animateToMonth = useCallback(
    (target: Date) => {
      Animated.timing(monthAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
        setVisibleMonth(target)
        Animated.timing(monthAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start()
      })
    },
    [monthAnim],
  )

  const handleShift = useCallback(
    (delta: number) => {
      animateToMonth(shiftMonth(visibleMonth, delta))
    },
    [animateToMonth, visibleMonth],
  )

  const togglePicker = (type: "month" | "year") => {
    setActivePicker((prev) => (prev === type ? null : type))
  }

  const handleSelectMonth = (index: number) => {
    const target = new Date(visibleMonth)
    target.setMonth(index, 1)
    animateToMonth(target)
    setActivePicker(null)
  }

  const handleSelectYear = (year: number) => {
    const target = new Date(visibleMonth)
    target.setFullYear(year, target.getMonth(), 1)
    animateToMonth(target)
    setActivePicker(null)
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
          return Math.abs(gesture.dx) > Math.abs(gesture.dy) && Math.abs(gesture.dx) > 20
        },
        onPanResponderRelease: (_: GestureResponderEvent, gesture: PanResponderGestureState) => {
          if (gesture.dx > 20) {
            handleShift(-1)
          } else if (gesture.dx < -20) {
            handleShift(1)
          }
        },
      }),
    [handleShift],
  )

  return (
    <View style={{ flex: 1 }}>
      <View style={header}>
        <TouchableOpacity onPress={onClose} style={headerButton}>
          <Text style={{ color: palette.text, fontSize: 18 }}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={[typography.title, { fontSize: 20 }]}>{`${monthLabel} ${yearLabel}`}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={monthControls}>
        <TouchableOpacity onPress={() => handleShift(-1)} style={iconButton}>
          <Text style={{ color: palette.text }}>{"<"}</Text>
        </TouchableOpacity>
        <View style={{ alignItems: "center" }}>
          <TouchableOpacity onPress={() => togglePicker("month")}>
            <Text style={{ color: palette.text, fontSize: 18, fontWeight: "600" }}>{monthLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => togglePicker("year")}>
            <Text style={{ color: palette.mutedText }}>{yearLabel}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => handleShift(1)}
          style={iconButton}
        >
          <Text style={{ color: palette.text }}>{">"}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={todayButton}
        onPress={() => {
          const today = new Date()
          animateToMonth(today)
          onSelectDate(today)
        }}
      >
        <Text style={{ color: palette.text }}>Today</Text>
      </TouchableOpacity>

      {activePicker ? (
        <View style={pickerContainer}>
          <Text style={{ color: palette.mutedText, marginBottom: spacing(1) }}>
            Select {activePicker === "month" ? "month" : "year"}
          </Text>
          <View style={pickerGrid}>
            {activePicker === "month"
              ? MONTH_NAMES.map((name, index) => (
                  <TouchableOpacity
                    key={name}
                    onPress={() => handleSelectMonth(index)}
                    style={[
                      pickerOption,
                      visibleMonth.getMonth() === index && pickerOptionActive,
                    ]}
                  >
                    <Text style={{ color: palette.text }}>{name.slice(0, 3)}</Text>
                  </TouchableOpacity>
                ))
              : yearOptions.map((year) => (
                  <TouchableOpacity
                    key={year}
                    onPress={() => handleSelectYear(year)}
                    style={[
                      pickerOption,
                      visibleMonth.getFullYear() === year && pickerOptionActive,
                    ]}
                  >
                    <Text style={{ color: palette.text }}>{year}</Text>
                  </TouchableOpacity>
                ))}
          </View>
        </View>
      ) : null}

      <View style={weekdayRow}>
        {DAY_NAMES.map((label) => (
          <Text key={label} style={{ color: palette.mutedText, fontSize: 12, flex: 1, textAlign: "center" }}>
            {label}
          </Text>
        ))}
      </View>

      <Animated.View style={[grid, { opacity: monthAnim }]} {...panResponder.panHandlers}>
        {days.map((day) => {
          const dateKey = roundToLocalDay(day.getTime())
          const colors = dayColorMap.get(dateKey) ?? []
          const isCurrentMonth = day.getMonth() === visibleMonth.getMonth()
          const isSelected = roundToLocalDay(selectedDate.getTime()) === dateKey
          return (
            <TouchableOpacity
              key={day.toISOString()}
              style={[
                cell,
                !isCurrentMonth && { opacity: 0.3 },
                isSelected && { borderColor: palette.primary, borderWidth: 2 },
              ]}
              onPress={() => {
                onSelectDate(day)
                onClose()
              }}
            >
              <Text style={{ color: palette.text, fontWeight: "600" }}>{day.getDate()}</Text>
              <View style={dotRow}>
                {colors.slice(0, 3).map((color) => (
                  <View key={`${dateKey}-${color}`} style={[dot, { backgroundColor: color }]} />
                ))}
              </View>
            </TouchableOpacity>
          )
        })}
      </Animated.View>

      {legendEntries.length > 0 && (
        <View style={legendContainer}>
          {legendEntries.map((entry) => (
            <View key={entry.key} style={legendItem}>
              <View style={[dot, { backgroundColor: entry.color }]} />
              <Text style={{ color: palette.text }}>{entry.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const buildCalendarDays = (month: Date) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1)
  const offset = firstDay.getDay()
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - offset)
  const days: Date[] = []
  for (let i = 0; i < TOTAL_CELLS; i += 1) {
    days.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i))
  }
  return days
}

const shiftMonth = (date: Date, delta: number) => {
  const next = new Date(date)
  next.setMonth(next.getMonth() + delta, 1)
  return next
}

const header = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: spacing(2),
  paddingVertical: spacing(1.5),
  borderBottomWidth: 1,
  borderColor: palette.border,
}

const headerButton = {
  width: 36,
  height: 36,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: "center" as const,
  justifyContent: "center" as const,
}

const monthControls = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: spacing(4),
  paddingVertical: spacing(1.5),
}

const iconButton = {
  width: 36,
  height: 36,
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: palette.mutedSurface,
}

const weekdayRow = {
  flexDirection: "row" as const,
  paddingHorizontal: spacing(2),
  paddingBottom: spacing(1),
}

const grid = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  paddingHorizontal: spacing(1),
}

const cell: ViewStyle = {
  width: `${100 / DAYS_IN_WEEK}%`,
  paddingVertical: spacing(2),
  alignItems: "center",
  borderWidth: 1,
  borderColor: palette.border,
}

const dotRow = {
  flexDirection: "row" as const,
  gap: 4,
  marginTop: spacing(1),
}

const dot = {
  width: 6,
  height: 6,
  borderRadius: 999,
}

const legendContainer = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: spacing(1),
  padding: spacing(2),
  justifyContent: "center" as const,
}

const legendItem = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: spacing(0.5),
}

const todayButton = {
  alignSelf: "center" as const,
  paddingHorizontal: spacing(2.5),
  paddingVertical: spacing(0.75),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
  marginBottom: spacing(1),
}

const pickerContainer = {
  paddingHorizontal: spacing(2),
  paddingBottom: spacing(1.5),
}

const pickerGrid = {
  flexDirection: "row" as const,
  flexWrap: "wrap" as const,
  gap: spacing(1),
  justifyContent: "center" as const,
}

const pickerOption = {
  paddingVertical: spacing(0.75),
  paddingHorizontal: spacing(1.25),
  borderRadius: radius.card,
  borderWidth: 1,
  borderColor: palette.border,
}

const pickerOptionActive = {
  backgroundColor: palette.primary,
  borderColor: palette.primary,
}

export default CalendarScreen
