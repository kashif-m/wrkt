import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import HomeOutlineIcon from '../assets/home-outline.svg';
import HomeFilledIcon from '../assets/home-filled.svg';
import CalendarIcon from '../assets/calendar.svg';
import ChartIcon from '../assets/chart.svg';
import SettingsIcon from '../assets/settings.svg';
import PlusIcon from '../assets/plus.svg';
import { getContrastTextColor, palette, spacing, ThemeMode } from '../ui/theme';
import { LabelText, NavKey, asLabelText, asNavKey } from '../domain/types';

type Props = {
  current: NavKey;
  onSelect: (key: NavKey) => void;
  themeMode: ThemeMode;
};

const BottomNav = ({ current, onSelect, themeMode }: Props) => {
  type IconPair = { outline: React.FC<SvgProps>; filled?: React.FC<SvgProps> };
  const items: Array<{ key: NavKey; label: LabelText; icon: IconPair }> = [
    {
      key: asNavKey('home'),
      label: asLabelText('Home'),
      icon: { outline: HomeOutlineIcon, filled: HomeFilledIcon },
    },
    {
      key: asNavKey('calendar'),
      label: asLabelText('Calendar'),
      icon: { outline: CalendarIcon },
    },
    {
      key: asNavKey('analytics'),
      label: asLabelText('Trends'),
      icon: { outline: ChartIcon },
    },
    {
      key: asNavKey('more'),
      label: asLabelText('More'),
      icon: { outline: SettingsIcon },
    },
  ];

  return (
    <View
      style={[
        navShell,
        {
          paddingTop: spacing(1),
          backgroundColor: palette.background,
        },
      ]}
    >
      <View style={[navBar, { backgroundColor: palette.background }]}>
        <View
          style={[
            navRow,
            {
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        >
          {items.map(item => {
            const active = item.key === current;
            const Icon =
              active && item.icon.filled ? item.icon.filled : item.icon.outline;
            const color = active ? palette.primary : palette.mutedText;
            const iconSize =
              item.key === asNavKey('analytics') && active ? 26 : 24;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => onSelect(item.key)}
                style={navItem}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
              >
                <Icon width={iconSize} height={iconSize} color={color} />
                <Text
                  style={[
                    navLabel,
                    { color, fontWeight: active ? '600' : '500' },
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          onPress={() => onSelect(asNavKey('browser'))}
          style={[
            fabButton,
            {
              backgroundColor: palette.primary,
              borderColor:
                themeMode === 'light' ? 'transparent' : palette.primaryMuted,
              shadowOpacity: themeMode === 'light' ? 0 : 0.6,
              elevation: themeMode === 'light' ? 0 : 4,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={asLabelText('Start workout')}
        >
          <PlusIcon
            width={28}
            height={28}
            color={getContrastTextColor(palette.primary)}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const navShell = {
  paddingHorizontal: spacing(2),
};

const navBar = {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  paddingHorizontal: spacing(1),
  backgroundColor: palette.background,
};

const navRow = {
  paddingVertical: spacing(1.05),
  paddingHorizontal: spacing(1.5),
  borderRadius: 30,
  borderWidth: 1,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  flex: 1,
  marginRight: spacing(1.5),
  minHeight: 62,
};

const navItem = {
  flex: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  minHeight: 44,
  gap: spacing(0.25),
};

const navLabel = {
  fontSize: 11.5,
};

const fabButton = {
  // top: -15,
  width: 64,
  height: 64,
  borderRadius: 38,
  borderWidth: 1,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  shadowColor: '#0b1222',
  shadowOpacity: 0.6,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 10 },
};

export default BottomNav;
