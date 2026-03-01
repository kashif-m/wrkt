/**
 * Simple tab routes - minimal wrappers around screens
 */

import React from 'react';
import { ScreenShell } from './ScreenShell';
import HomeScreen from '../screens/HomeScreen';
import CalendarScreen from '../screens/CalendarScreen';
import MoreScreen from '../screens/MoreScreen';
import AnalyticsHub from '../screens/AnalyticsHub';

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
    <AnalyticsHub />
  </ScreenShell>
);

export const MoreRoute = () => (
  <ScreenShell>
    <MoreScreen />
  </ScreenShell>
);
