import React, { useMemo } from "react"
import { ScrollView, View, Text } from "react-native"
import { WorkoutEvent, WorkoutState } from "../workoutFlows"

type Props = { state: WorkoutState }

type VolumePoint = { label: string; value: number }
type PersonalRecord = { exercise: string; weight: number; reps: number; oneRm: number }

const asDate = (ts: number) => new Date(ts * 1000)

const formatWeekLabel = (ts: number) => {
  const date = asDate(ts)
  const weekStart = new Date(date)
  const weekday = weekStart.getUTCDay()
  const diff = weekStart.getUTCDate() - weekday
  weekStart.setUTCDate(diff)
  weekStart.setUTCHours(0, 0, 0, 0)
  return weekStart.toISOString().slice(0, 10)
}

const computeVolumeSeries = (events: WorkoutEvent[]): VolumePoint[] => {
  const totals = new Map<string, number>()
  events.forEach(event => {
    const reps = Number(event.payload?.reps ?? 0)
    const weight = Number(event.payload?.weight ?? 0)
    const volume = reps * weight
    const label = formatWeekLabel(event.ts)
    totals.set(label, (totals.get(label) ?? 0) + volume)
  })
  const points = Array.from(totals.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-6)
    .map(([label, value]) => ({ label, value }))
  return points
}

const estimateOneRm = (weight: number, reps: number) => weight * (1 + reps / 30)

const computePRs = (events: WorkoutEvent[]): PersonalRecord[] => {
  const best = new Map<string, PersonalRecord>()
  events.forEach(event => {
    const exercise = String(event.payload?.exercise ?? "Unknown")
    const reps = Number(event.payload?.reps ?? 0)
    const weight = Number(event.payload?.weight ?? 0)
    if (!weight) return
    const oneRm = estimateOneRm(weight, reps || 1)
    const current = best.get(exercise)
    if (!current || oneRm > current.oneRm) {
      best.set(exercise, { exercise, weight, reps, oneRm })
    }
  })
  return Array.from(best.values()).sort((a, b) => b.oneRm - a.oneRm)
}

const VolumeChart = ({ data }: { data: VolumePoint[] }) => {
  const max = data.reduce((m, p) => Math.max(m, p.value), 0) || 1
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontWeight: "600" }}>Volume trend (kg·reps)</Text>
      {data.map(point => {
        const widthPct = `${Math.round((point.value / max) * 100)}%`
        return (
          <View key={point.label}>
            <Text style={{ fontSize: 12, color: "#666" }}>{point.label}</Text>
            <View style={{ backgroundColor: "#eee", height: 12, borderRadius: 6, overflow: "hidden" }}>
              <View style={{ width: widthPct, backgroundColor: "#3b82f6", height: "100%" }} />
            </View>
            <Text style={{ fontSize: 12, color: "#444" }}>{Math.round(point.value)} kg·reps</Text>
          </View>
        )
      })}
    </View>
  )
}

const PRTable = ({ prs }: { prs: PersonalRecord[] }) => (
  <View style={{ marginTop: 24 }}>
    <Text style={{ fontWeight: "600", marginBottom: 8 }}>Estimated 1RM / PR</Text>
    {prs.length === 0 ? (
      <Text style={{ color: "#666" }}>Log sets to see personal records.</Text>
    ) : (
      prs.map(record => (
        <View
          key={record.exercise}
          style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 0.5, borderColor: "#ddd" }}
        >
          <View>
            <Text style={{ fontWeight: "500" }}>{record.exercise}</Text>
            <Text style={{ fontSize: 12, color: "#666" }}>
              {record.weight} kg × {record.reps || 1} reps
            </Text>
          </View>
          <Text style={{ fontWeight: "600" }}>{Math.round(record.oneRm)} kg 1RM</Text>
        </View>
      ))
    )}
  </View>
)

const AnalyticsScreen = ({ state }: Props) => {
  const volumeSeries = useMemo(() => computeVolumeSeries(state.events), [state.events])
  const prs = useMemo(() => computePRs(state.events), [state.events])

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 24 }}>
      <VolumeChart data={volumeSeries} />
      <PRTable prs={prs} />
    </ScrollView>
  )
}

export default AnalyticsScreen
