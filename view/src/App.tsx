import React, { useCallback, useEffect, useState } from "react"
import { View, Text, Button } from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import LoggingScreen from "./screens/LoggingScreen"
import HistoryScreen from "./screens/HistoryScreen"
import AnalyticsScreen from "./screens/AnalyticsScreen"
import SuggestionsScreen from "./screens/SuggestionsScreen"
import { WorkoutState, initialState } from "./workoutFlows"
import { init, fetchEvents } from "./storage"

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
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 18, marginBottom: 12 }}>Workout coach prototype</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
            {tabs.map((tab) => (
              <Button
                key={tab}
                title={tabLabels[tab]}
                onPress={() => setActiveTab(tab)}
                disabled={activeTab === tab}
              />
            ))}
          </View>
          {renderScreen()}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

export default App
