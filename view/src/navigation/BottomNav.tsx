import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import HomeOutlineIcon from '../assets/home-outline.svg';
import HomeFilledIcon from '../assets/home-filled.svg';
import CalendarIcon from '../assets/calendar.svg';
import DumbbellIcon from '../assets/dumbbell.svg';
import ChartIcon from '../assets/chart.svg';
import SettingsIcon from '../assets/settings.svg';
import PlusIcon from '../assets/plus.svg';
import { palette, spacing } from '../ui/theme';
import { LabelText, NavKey, asLabelText, asNavKey } from '../domain/types';

type Props = {
  current: NavKey;
  onSelect: (key: NavKey) => void;
};

const BottomNav = ({ current, onSelect }: Props) => {
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
        },
      ]}
    >
      <View style={navBar}>
        <View style={navRow}>
          {items.map(item => {
            const active = item.key === current;
            const Icon =
              active && item.icon.filled ? item.icon.filled : item.icon.outline;
            const color = active ? palette.primary : palette.mutedText;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => onSelect(item.key)}
                style={navItem}
              >
                <Icon width={24} height={24} color={color} />
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
          style={fabButton}
        >
          <PlusIcon width={28} height={28} color="#0f172a" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const navShell = {
  paddingHorizontal: spacing(2),
  backgroundColor: palette.background,
};

const navBar = {
  flexDirection: 'row' as const,
  justifyContent: 'space-between' as const,
  alignItems: 'center' as const,
  paddingHorizontal: spacing(1.5),
  backgroundColor: palette.background,
};

const navRow = {
  borderColor: palette.border,
  paddingVertical: spacing(1.05),
  paddingHorizontal: spacing(1.5),
  backgroundColor: palette.surface,
  borderRadius: 30,
  borderWidth: 1,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  width: '75%' as const,
  alignSelf: 'center' as const,
};

const navItem = {
  flex: 1,
  alignItems: 'center' as const,
  gap: spacing(0.25),
};

const navLabel = {
  fontSize: 10.5,
};

const fabButton = {
  // top: -15,
  width: 64,
  height: 64,
  borderRadius: 38,
  backgroundColor: palette.primary,
  borderWidth: 1,
  borderColor: palette.primaryMuted,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  shadowColor: '#0b1222',
  shadowOpacity: 0.6,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 10 },
};

export default BottomNav;
