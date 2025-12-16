import React, { useState, useEffect } from "react"
import { ScrollView, Text } from "react-native"
import { WorkoutState, suggestNext } from "../workoutFlows"
import { Card, InputField, SectionHeading, BodyText } from "../ui/components"
import { palette, spacing } from "../ui/theme"

type Props = { state: WorkoutState }

const SuggestionsScreen = ({ state }: Props) => {
  const [planner, setPlanner] = useState("strength")
  const [suggestion, setSuggestion] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    suggestNext(state, planner).then(setSuggestion).catch(() => setSuggestion(null))
  }, [state, planner])

  const coachText =
    suggestion && suggestion["recommendations"]
      ? JSON.stringify(suggestion["recommendations"], null, 2)
      : JSON.stringify(suggestion ?? {}, null, 2)

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: spacing(2), paddingBottom: spacing(6), gap: spacing(2) }}
    >
      <Card>
        <SectionHeading label="Planner mode" />
        <BodyText style={{ color: palette.mutedText, marginBottom: spacing(1) }}>
          Try different strategists to see how the plan shifts.
        </BodyText>
        <InputField label="Planner" value={planner} onChangeText={setPlanner} placeholder="strength" />
      </Card>
      <Card>
        <SectionHeading label="Suggested focus" />
        <Text style={{ color: palette.text, fontFamily: "Menlo", fontSize: 12 }}>{coachText}</Text>
      </Card>
    </ScrollView>
  )
}

export default SuggestionsScreen
