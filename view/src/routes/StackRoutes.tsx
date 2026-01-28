/**
 * Stack routes - for modal/pushed screens
 */

import React from 'react';
import { ScreenShell } from './ScreenShell';
import ExerciseBrowser from '../screens/ExerciseBrowser';
import HistoryScreen from '../screens/HistoryScreen';
import ImportSummaryScreen from '../screens/ImportSummaryScreen';

export const BrowserRoute = () => (
  <ScreenShell>
    <ExerciseBrowser />
  </ScreenShell>
);

export const HistoryRoute = () => (
  <ScreenShell>
    <HistoryScreen />
  </ScreenShell>
);

export const ImportSummaryRoute = () => (
  <ScreenShell>
    <ImportSummaryScreen />
  </ScreenShell>
);
