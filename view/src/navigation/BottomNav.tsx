import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import HomeOutlineIcon from '../assets/home-outline.svg';
import HomeFilledIcon from '../assets/home-filled.svg';
import CalendarIcon from '../assets/calendar.svg';
import DumbbellIcon from '../assets/dumbbell.svg';
import ChartIcon from '../assets/chart.svg';
import SettingsIcon from '../assets/settings.svg';
import { palette, spacing } from '../ui/theme';

export type NavKey = 'home' | 'calendar' | 'browser' | 'analytics' | 'coach';

type Props = {
  current: NavKey;
  onSelect: (key: NavKey) => void;
};

const BottomNav = ({ current, onSelect }: Props) => {
  type IconPair = { outline: React.FC<SvgProps>; filled?: React.FC<SvgProps> };
  const items: Array<{ key: NavKey; label: string; icon: IconPair }> = [
    {
      key: 'home',
      label: 'Home',
      icon: { outline: HomeOutlineIcon, filled: HomeFilledIcon },
    },
    { key: 'calendar', label: 'Calendar', icon: { outline: CalendarIcon } },
    { key: 'browser', label: 'Browse', icon: { outline: DumbbellIcon } },
    { key: 'analytics', label: 'Trends', icon: { outline: ChartIcon } },
    { key: 'coach', label: 'More', icon: { outline: SettingsIcon } },
  ];

  return (
    <View
      style={{
        flexDirection: 'row',
        borderTopWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
      }}
    >
      {items.map(item => {
        const active = item.key === current;
        const Icon =
          active && item.icon.filled ? item.icon.filled : item.icon.outline;
        const color = active ? palette.primary : palette.mutedText;
        return (
          <TouchableOpacity
            key={item.key}
            onPress={() => onSelect(item.key)}
            style={{
              flex: 1,
              paddingVertical: spacing(1.2),
              alignItems: 'center',
            }}
          >
            <Icon width={24} height={24} color={color} />
            <Text
              style={{
                color,
                fontWeight: active ? '700' : '500',
                fontSize: 12,
                marginTop: spacing(0.25),
              }}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export default BottomNav;
