import React, { useState, useEffect, useMemo } from "react"
import { ScrollView, Text, TouchableOpacity, View } from "react-native"
import { WorkoutState, suggestNext, PlanSuggestion, PlannerKind } from "../workoutFlows"
import { Card, SectionHeading, BodyText } from "../ui/components"
import { palette, spacing, radius } from "../ui/theme"

type Props = { state: WorkoutState }

const plannerOptions: { key: PlannerKind; label: string; copy: string }[] = [
  { key: "strength", label: "Strength", copy: "Focus on load and estimated 1RM jumps." },
  { key: "hypertrophy", label: "Hypertrophy", copy: "Prioritize extra sets or reps for volume." },
  { key: "conditioning", label: "Conditioning", copy: "Increase work duration or total distance." },
]

const SuggestionsScreen = ({ state }: Props) => {
  const [planner, setPlanner] = useState<PlannerKind>("strength")
  const [suggestions, setSuggestions] = useState<PlanSuggestion[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    suggestNext(state, planner)
      .then((items) => {
        if (!cancelled) {
          setSuggestions(items)
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [state.events, planner])

  const activePlanner = useMemo(() => plannerOptions.find((option) => option.key === planner), [planner])

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6), gap: spacing(2) }}
    >
      <Card>
        <SectionHeading label="Planner focus" />
        <BodyText style={{ color: palette.mutedText, marginBottom: spacing(1) }}>
          Pick which coaching style should drive the next recommendations.
        </BodyText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing(1) }}>
          {plannerOptions.map((option) => {
            const active = option.key === planner
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => setPlanner(option.key)}
                style={[
                  {
                    paddingVertical: spacing(0.75),
                    paddingHorizontal: spacing(1.5),
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: palette.border,
                    backgroundColor: active ? palette.primary : palette.mutedSurface,
                  },
                ]}
              >
                <Text style={{ color: active ? "#0f172a" : palette.text, fontWeight: "600" }}>{option.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        {activePlanner ? (
          <BodyText style={{ color: palette.mutedText, marginTop: spacing(1) }}>{activePlanner.copy}</BodyText>
        ) : null}
      </Card>

      <Card>
        <SectionHeading label="Next session suggestions" />
        {loading ? (
          <BodyText style={{ color: palette.mutedText }}>Crunching the last few sessions…</BodyText>
        ) : suggestions.length === 0 ? (
          <BodyText style={{ color: palette.mutedText }}>
            Log a recent set for this focus to unlock coaching tips.
          </BodyText>
        ) : (
          suggestions.map((suggestion) => <SuggestionCard key={suggestion.title} suggestion={suggestion} />)
        )}
      </Card>
    </ScrollView>
  )
}

const SuggestionCard = ({ suggestion }: { suggestion: PlanSuggestion }) => {
  const deltaEntries = Object.entries(suggestion.delta ?? {})
    .filter(([, value]) => typeof value === "number")
    .map(([metric, value]) => ({
      metric,
      value,
    }))

  return (
    <View
      style={{
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: palette.border,
        padding: spacing(1.5),
        marginTop: spacing(1),
      }}
    >
      <Text style={{ color: palette.text, fontWeight: "700", marginBottom: spacing(0.5) }}>{suggestion.title}</Text>
      <BodyText style={{ color: palette.mutedText }}>{suggestion.explanation}</BodyText>
      {deltaEntries.length > 0 && (
        <View style={{ marginTop: spacing(1), gap: spacing(0.5) }}>
          {deltaEntries.map((entry) => (
            <View key={entry.metric} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: palette.mutedText }}>{formatMetric(entry.metric)}</Text>
              <Text style={{ color: palette.success, fontWeight: "600" }}>{formatDeltaValue(entry.value)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const formatMetric = (metric: string) =>
  metric
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ")

const formatDeltaValue = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`

export default SuggestionsScreen
