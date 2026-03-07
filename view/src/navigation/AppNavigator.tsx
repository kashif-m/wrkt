import React from 'react';
import { NavigationContainer, useNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { enableScreens } from 'react-native-screens';

import { getActiveRouteName } from './navigationUtils';

import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import AnalyticsHub from '../screens/AnalyticsHub';
import MoreScreen from '../screens/MoreScreen';
import ExerciseBrowser from '../screens/ExerciseBrowser';
import LoggingScreen from '../screens/LoggingScreen';
import HistoryScreen from '../screens/HistoryScreen';
import ImportSummaryScreen from '../screens/ImportSummaryScreen';

type RootStackParamList = {
  home: undefined;
  calendar: undefined;
  analytics: undefined;
  more: undefined;
  browser: undefined;
  log: undefined;
  history: undefined;
  importSummary: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

enableScreens();

/**
 * Main App Navigator component
 * 
 * NOTE: This component expects to be wrapped by AppProvider by its parent.
 * Do not wrap with AppProvider here - it's provided by App.tsx
 */
export const AppNavigator: React.FC = () => {
  const navigationRef = useNavigationContainerRef();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer
          ref={navigationRef}
          onStateChange={(state) => {
            const route = getActiveRouteName(state);
            // Track screen changes for analytics
          }}
        >
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="home" component={HomeScreen} />
            <Stack.Screen name="calendar" component={CalendarScreen} />
            <Stack.Screen name="analytics" component={AnalyticsHub} />
            <Stack.Screen name="more" component={MoreScreen} />
            <Stack.Screen name="browser" component={ExerciseBrowser} />
            <Stack.Screen name="log" component={LoggingScreen} />
            <Stack.Screen name="history" component={HistoryScreen} />
            <Stack.Screen name="importSummary" component={ImportSummaryScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};
