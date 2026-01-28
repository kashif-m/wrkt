/**
 * ScreenShell - Layout wrapper with safe area insets
 */

import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette } from '../ui/theme';

type ScreenShellProps = {
  children: React.ReactNode;
  topInsetColor?: string;
};

export const ScreenShell = ({ children, topInsetColor }: ScreenShellProps) => {
  const insets = useSafeAreaInsets();
  const insetColor = topInsetColor ?? palette.background;

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
      <View style={{ height: insets.top, backgroundColor: insetColor }} />
      <View style={{ flex: 1, backgroundColor: palette.background }}>
        {children}
      </View>
    </View>
  );
};
