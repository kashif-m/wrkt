/**
 * Simple tab routes - minimal wrappers around screens
 */

import React from 'react';
import { View } from 'react-native';
import { ScreenShell } from './ScreenShell';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import MoreScreen from '../screens/MoreScreen';
import ScreenHeader from '../ui/ScreenHeader';
import { asLabelText } from '../domain/types';

export const HomeRoute = () => (
  <ScreenShell>
    <HomeScreen />
  </ScreenShell>
);

export const CalendarRoute = () => (
  <ScreenShell>
    <CalendarScreen />
  </ScreenShell>
);

export const AnalyticsRoute = () => (
  <ScreenShell>
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={asLabelText('Trends')}
        subtitle={asLabelText('Charts & records')}
      />
      <AnalyticsScreen />
    </View>
  </ScreenShell>
);

export const MoreRoute = () => (
  <ScreenShell>
    <MoreScreen />
  </ScreenShell>
);
