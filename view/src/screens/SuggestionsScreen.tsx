import React, { useState, useEffect } from "react"
import { ScrollView, View, Text, TextInput } from "react-native"
import { WorkoutState, suggestNext } from "../workoutFlows"

type Props = { state: WorkoutState }

const SuggestionsScreen = ({ state }: Props) => {
  const [planner, setPlanner] = useState("strength")
  const [suggestion, setSuggestion] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    suggestNext(state, planner).then(setSuggestion).catch(() => setSuggestion(null))
  }, [state, planner])

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text style={{ marginBottom: 12 }}>Coach suggestion</Text>
      <View style={{ marginBottom: 12 }}>
        <Text>Planner</Text>
        <TextInput
          value={planner}
          onChangeText={(text) => setPlanner(text)}
          autoCapitalize="none"
          style={{ borderColor: "#ccc", borderWidth: 1, padding: 8, borderRadius: 4 }}
        />
      </View>
      <Text>{suggestion ? JSON.stringify(suggestion, null, 2) : "Loading..."}</Text>
    </ScrollView>
  )
}

export default SuggestionsScreen
