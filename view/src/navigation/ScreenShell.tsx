import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppState } from '../state/appContext';
import { palette } from '../ui/theme';

/**
 * Screen wrapper component with safe area handling
 */
export const ScreenShell = ({
  children,
  topInsetColor,
}: {
  children: React.ReactNode;
  topInsetColor?: string;
}) => {
  const { preferences } = useAppState();
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
