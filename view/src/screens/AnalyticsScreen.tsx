import React, { useMemo } from "react"
import { ScrollView, View, Text } from "react-native"
import { WorkoutEvent, WorkoutState } from "../workoutFlows"
import { Card, SectionHeading, BodyText } from "../ui/components"
import { palette, spacing } from "../ui/theme"

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
    <Card style={{ gap: spacing(1) }}>
      <SectionHeading label="Volume trend" />
      {data.map(point => {
        const widthPct = `${Math.round((point.value / max) * 100)}%` as `${number}%`
        return (
          <View key={point.label}>
            <Text style={{ fontSize: 12, color: palette.mutedText }}>{point.label}</Text>
            <View style={{ backgroundColor: palette.mutedSurface, height: 12, borderRadius: 6, overflow: "hidden" }}>
              <View style={{ width: widthPct, backgroundColor: palette.primary, height: "100%" }} />
            </View>
            <BodyText style={{ fontSize: 12 }}>{Math.round(point.value)} kg·reps</BodyText>
          </View>
        )
      })}
    </Card>
  )
}

const PRTable = ({ prs }: { prs: PersonalRecord[] }) => (
  <Card>
    <SectionHeading label="Estimated PRs" />
    {prs.length === 0 ? (
      <BodyText style={{ color: palette.mutedText }}>Log sets to see personal records.</BodyText>
    ) : (
      prs.map(record => (
        <View
          key={record.exercise}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingVertical: 6,
            borderBottomWidth: 0.5,
            borderColor: palette.border,
          }}
        >
          <View>
            <BodyText style={{ fontWeight: "600" }}>{record.exercise}</BodyText>
            <Text style={{ fontSize: 12, color: palette.mutedText }}>
              {record.weight} kg × {record.reps || 1} reps
            </Text>
          </View>
          <BodyText style={{ fontWeight: "600" }}>{Math.round(record.oneRm)} kg 1RM</BodyText>
        </View>
      ))
    )}
  </Card>
)

const AnalyticsScreen = ({ state }: Props) => {
  const volumeSeries = useMemo(() => computeVolumeSeries(state.events), [state.events])
  const prs = useMemo(() => computePRs(state.events), [state.events])

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6), gap: spacing(2) }}
    >
      <VolumeChart data={volumeSeries} />
      <PRTable prs={prs} />
    </ScrollView>
  )
}

export default AnalyticsScreen
