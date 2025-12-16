import React, { useCallback, useEffect, useState } from "react"
import { Alert, Text, TouchableOpacity, View } from "react-native"
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context"
import ExerciseBrowser from "./screens/ExerciseBrowser"
import LoggingScreen from "./screens/LoggingScreen"
import HistoryScreen from "./screens/HistoryScreen"
import AnalyticsScreen from "./screens/AnalyticsScreen"
import SuggestionsScreen from "./screens/SuggestionsScreen"
import HomeScreen from "./screens/HomeScreen"
import { WorkoutState, initialState } from "./workoutFlows"
import { init, fetchEvents } from "./storage"
import { palette, spacing, radius } from "./ui/theme"

type ScreenState =
  | { key: "home" }
  | { key: "browser" }
  | { key: "log"; exerciseName?: string }
  | { key: "history" }
  | { key: "analytics" }
  | { key: "coach" }

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

  const handleOpenCalendar = () => {
    Alert.alert("Calendar", "Calendar view coming soon.")
  }

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
            onStartExercise={() => setScreen({ key: "browser" })}
            onSelectExerciseFromList={(exerciseName) => {
              console.log("Home: exercise selected from list", exerciseName)
              setScreen({ key: "log", exerciseName })
            }}
          />
        )
      case "browser":
        return (
          <ExerciseBrowser
            onSelectExercise={(entry) => setScreen({ key: "log", exerciseName: entry.display_name })}
            onClose={goHome}
          />
        )
      case "log":
        console.log("Navigating to logging screen", screen.exerciseName)
        return (
          <View style={{ flex: 1 }}>
            <ShellHeader title={screen.exerciseName ?? "Log Workout"} onBack={goHome} />
            <LoggingScreen
              state={state}
              onStateChange={(nextState) => setState(nextState)}
              refreshFromStorage={refreshFromStorage}
              prefillExerciseName={screen.exerciseName}
            />
          </View>
        )
      case "history":
        return <HistoryScreen state={state} />
      case "analytics":
        return <AnalyticsScreen state={state} />
      case "coach":
        return <SuggestionsScreen state={state} />
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <View style={{ flex: 1 }}>{renderScreen()}</View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

export default App

const ShellHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <View
    style={{
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: spacing(2),
      paddingVertical: spacing(1.5),
      borderBottomWidth: 1,
      borderColor: palette.border,
      gap: spacing(1),
    }}
  >
    <TouchableOpacity
      onPress={onBack}
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: palette.border,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: palette.surface,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 18 }}>{"<"}</Text>
    </TouchableOpacity>
    <Text style={{ color: palette.text, fontSize: 18, fontWeight: "600" }}>{title}</Text>
  </View>
)
