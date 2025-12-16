import React, { useCallback, useEffect, useMemo, useState } from "react"
import { View, Text } from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import LoggingScreen from "./screens/LoggingScreen"
import HistoryScreen from "./screens/HistoryScreen"
import AnalyticsScreen from "./screens/AnalyticsScreen"
import SuggestionsScreen from "./screens/SuggestionsScreen"
import { WorkoutState, initialState } from "./workoutFlows"
import { init, fetchEvents } from "./storage"
import { Card, LabeledText, PillButton, BodyText } from "./ui/components"
import { palette, spacing } from "./ui/theme"

const tabs = ["Log", "History", "Analytics", "Coach"] as const

type Tab = (typeof tabs)[number]

const tabLabels: Record<Tab, string> = {
  Log: "Log",
  History: "History",
  Analytics: "Analytics",
  Coach: "Coach",
}

const App = () => {
  const [state, setState] = useState<WorkoutState>(initialState)
  const [activeTab, setActiveTab] = useState<Tab>("Log")

  const refreshFromStorage = useCallback(async () => {
    const events = await fetchEvents("workout")
    setState({ events })
  }, [])

  useEffect(() => {
    init().then(() => refreshFromStorage())
  }, [refreshFromStorage])

  const summary = useMemo(() => {
    const totalSets = state.events.length
    const totalVolume = state.events.reduce((sum, event) => {
      const reps = Number(event.payload?.reps ?? 0)
      const weight = Number(event.payload?.weight ?? 0)
      return sum + reps * weight
    }, 0)
    const uniqueExercises = new Set(
      state.events.map((event) => String(event.payload?.exercise ?? "")),
    )
    return { totalSets, totalVolume, uniqueExercises: uniqueExercises.size }
  }, [state.events])

  const renderScreen = () => {
    switch (activeTab) {
      case "Log":
        return (
          <LoggingScreen
            state={state}
            onStateChange={(nextState) => setState(nextState)}
            refreshFromStorage={refreshFromStorage}
          />
        )
      case "History":
        return <HistoryScreen state={state} />
      case "Analytics":
        return <AnalyticsScreen state={state} />
      case "Coach":
        return <SuggestionsScreen state={state} />
    }
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: spacing(2), paddingTop: spacing(2), flex: 1 }}>
            <Text style={{ color: palette.mutedText, textTransform: "uppercase", fontSize: 12 }}>
              strata prototype
            </Text>
            <Text style={{ color: palette.text, fontSize: 28, fontWeight: "600", marginBottom: spacing(2) }}>
              Workout coach
            </Text>
            <Card style={{ marginBottom: spacing(2) }}>
              <BodyText style={{ color: palette.mutedText, marginBottom: spacing(1) }}>
                Auto-tracked in the last 30 days
              </BodyText>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <LabeledText label="sets" value={String(summary.totalSets)} />
                <LabeledText label="volume" value={`${Math.round(summary.totalVolume)} kg·reps`} />
                <LabeledText label="unique lifts" value={String(summary.uniqueExercises)} />
              </View>
            </Card>
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: spacing(1.5) }}>
              {tabs.map((tab) => (
                <PillButton key={tab} label={tabLabels[tab]} active={activeTab === tab} onPress={() => setActiveTab(tab)} />
              ))}
            </View>
            <View style={{ flex: 1 }}>{renderScreen()}</View>
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  )
}

export default App
