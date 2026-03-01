import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { LabelText, unwrapLabelText } from '../../domain/types';
import {
  analyticsUi,
  palette,
  radius,
  spacing,
  typography,
} from '../../ui/theme';

type InlineOption<T extends string> = {
  key: T;
  label: LabelText;
};

export const AnalyticsInlineSelect = <T extends string>({
  title,
  options,
  selected,
  onSelect,
  onInteractionLockChange,
  justified = false,
}: {
  title: LabelText;
  options: ReadonlyArray<InlineOption<T>>;
  selected: T;
  onSelect: (key: T) => void;
  onInteractionLockChange?: (locked: boolean) => void;
  justified?: boolean;
}) => (
  <View style={{ gap: spacing(0.5) }}>
    <Text style={typography.label}>{unwrapLabelText(title).toUpperCase()}</Text>
    <View
      style={{
        backgroundColor: palette.mutedSurface,
        borderRadius: analyticsUi.selectorCardRadius,
        padding: analyticsUi.selectorRailPadding,
      }}
    >
      {justified ? (
        <View
          style={{
            flexDirection: 'row',
            gap: analyticsUi.selectorRailGap,
          }}
        >
          {options.map(option => {
            const active = option.key === selected;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => onSelect(option.key)}
                onPressIn={() => onInteractionLockChange?.(true)}
                onPressOut={() => onInteractionLockChange?.(false)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  borderRadius: radius.pill,
                  backgroundColor: active
                    ? palette.primary
                    : palette.mutedSurface,
                  minHeight: analyticsUi.controlHeight,
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingVertical: analyticsUi.controlPaddingY,
                  paddingHorizontal: analyticsUi.controlPaddingX,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: active ? palette.background : palette.mutedText,
                    fontSize: 13,
                    fontWeight: '600',
                  }}
                >
                  {unwrapLabelText(option.label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onTouchStart={() => onInteractionLockChange?.(true)}
          onTouchEnd={() => onInteractionLockChange?.(false)}
          onTouchCancel={() => onInteractionLockChange?.(false)}
          contentContainerStyle={{
            flexDirection: 'row',
            gap: analyticsUi.selectorRailGap,
          }}
        >
          {options.map(option => {
            const active = option.key === selected;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => onSelect(option.key)}
                onPressIn={() => onInteractionLockChange?.(true)}
                onPressOut={() => onInteractionLockChange?.(false)}
                accessibilityRole="button"
                accessibilityLabel={option.label}
                accessibilityState={{ selected: active }}
                style={{
                  borderRadius: radius.pill,
                  backgroundColor: active
                    ? palette.primary
                    : palette.mutedSurface,
                  minHeight: analyticsUi.controlHeight,
                  justifyContent: 'center',
                  paddingVertical: analyticsUi.controlPaddingY,
                  paddingHorizontal: analyticsUi.controlPaddingX,
                }}
              >
                <Text
                  style={{
                    color: active ? palette.background : palette.mutedText,
                    fontSize: 13,
                    fontWeight: '600',
                  }}
                >
                  {unwrapLabelText(option.label)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  </View>
);
