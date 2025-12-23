import React, { useCallback, useEffect, useState } from "react"
import { View } from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import ExerciseBrowser from "./screens/ExerciseBrowser"
import LoggingScreen, { SessionTab } from "./screens/LoggingScreen"
import HistoryScreen from "./screens/HistoryScreen"
import AnalyticsScreen from "./screens/AnalyticsScreen"
import SuggestionsScreen from "./screens/SuggestionsScreen"
import HomeScreen from "./screens/HomeScreen"
import CalendarScreen from "./screens/CalendarScreen"
import { WorkoutState, initialState } from "./workoutFlows"
import { init, fetchEvents } from "./storage"
import { palette } from "./ui/theme"
import BottomNav, { NavKey } from "./navigation/BottomNav"
import ScreenHeader from "./ui/ScreenHeader"

type ScreenState =
  | { key: "home" }
  | { key: "browser" }
  | { key: "log"; exerciseName?: string; initialTab: SessionTab; logDate?: Date }
  | { key: "history" }
  | { key: "analytics" }
  | { key: "coach" }
  | { key: "calendar" }

const App = () => {
  const [state, setState] = useState<WorkoutState>(initialState)
  const [screen, setScreen] = useState<ScreenState>({ key: "home" })
  const [selectedDate, setSelectedDate] = useState(() => new Date())

  const refreshFromStorage = useCallback(async () => {
    const events = await fetchEvents()
    setState({ events })
  }, [])

  useEffect(() => {
    init().then(() => refreshFromStorage())
  }, [refreshFromStorage])

  const shiftDate = (deltaDays: number) => {
    setSelectedDate((prev) => new Date(prev.getTime() + deltaDays * 24 * 60 * 60 * 1000))
  }

  const handleOpenCalendar = () => setScreen({ key: "calendar" })

  const goHome = () => setScreen({ key: "home" })

  const renderScreen = () => {
    switch (screen.key) {
      case "home":
        return (
          <HomeScreen
            events={state.events}
            selectedDate={selectedDate}
            onSelectPreviousDay={() => shiftDate(-1)}
            onSelectNextDay={() => shiftDate(1)}
            onOpenCalendar={handleOpenCalendar}
            onJumpToToday={() => setSelectedDate(new Date())}
            onStartExercise={() => setScreen({ key: "browser" })}
            onSelectExerciseFromList={(exerciseName) => {
              console.log("Home: exercise selected from list", exerciseName)
              setScreen({ key: "log", exerciseName, initialTab: "Track", logDate: selectedDate })
            }}
          />
        )
      case "browser":
        return (
          <ExerciseBrowser
            onSelectExercise={(entry) =>
              setScreen({
                key: "log",
                exerciseName: entry.display_name,
                initialTab: "Track",
                logDate: selectedDate,
              })
            }
            onClose={goHome}
          />
        )
      case "log":
        console.log("Navigating to logging screen", screen.exerciseName)
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader
              title={screen.exerciseName ?? "Log workout"}
              subtitle="Track · History · Trends"
              onBack={goHome}
            />
            <LoggingScreen
              state={state}
              onStateChange={(nextState) => setState(nextState)}
              refreshFromStorage={refreshFromStorage}
              prefillExerciseName={screen.exerciseName}
              initialTab={screen.initialTab}
              logDate={screen.logDate}
            />
          </View>
        )
      case "history":
        return <HistoryScreen state={state} />
      case "analytics":
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader title="Trends" subtitle="Charts & records" />
            <AnalyticsScreen state={state} />
          </View>
        )
      case "coach":
        return (
          <View style={{ flex: 1 }}>
            <ScreenHeader title="Coach" subtitle="Suggestions" />
            <SuggestionsScreen state={state} />
          </View>
        )
      case "calendar":
        return (
          <CalendarScreen
            events={state.events}
            selectedDate={selectedDate}
            onSelectDate={(date) => setSelectedDate(date)}
            onClose={goHome}
          />
        )
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <View style={{ flex: 1 }}>{renderScreen()}</View>
        <BottomNav
          current={
            screen.key === "calendar" ||
            screen.key === "browser" ||
            screen.key === "analytics" ||
            screen.key === "coach"
              ? (screen.key as NavKey)
              : "home"
          }
          onSelect={(key) => {
            if (key === "home") {
              setScreen({ key: "home" })
            } else if (key === "calendar") {
              setScreen({ key: "calendar" })
            } else if (key === "browser") {
              setScreen({ key: "browser" })
            } else if (key === "analytics") {
              setScreen({ key: "analytics" })
            } else if (key === "coach") {
              setScreen({ key: "coach" })
            }
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

export default App
