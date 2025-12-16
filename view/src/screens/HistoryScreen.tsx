import React from "react"
import { ScrollView, View, Text } from "react-native"
import { WorkoutState } from "../workoutFlows"

type Props = { state: WorkoutState }

const HistoryScreen = ({ state }: Props) => (
  <ScrollView contentContainerStyle={{ padding: 16 }}>
    <View>
      <Text style={{ marginBottom: 12 }}>Workout history</Text>
      {state.events.map((event, idx) => (
        <View
          key={`${idx}-${String((event as any).event_id ?? idx)}`}
          style={{ marginBottom: 8 }}
        >
          <Text>{JSON.stringify(event, null, 2)}</Text>
        </View>
      ))}
    </View>
  </ScrollView>
)

export default HistoryScreen
