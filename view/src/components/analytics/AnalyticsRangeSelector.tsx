import React, { useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { analyticsUi, palette, radius } from '../../ui/theme';
import { AnalyticsRangeKey, analyticsRangeOptions } from './analyticsRanges';

export const AnalyticsRangeSelector = ({
  selected,
  onSelect,
  options,
  justified = true,
  onInteractionLockChange,
}: {
  selected: AnalyticsRangeKey;
  onSelect: (range: AnalyticsRangeKey) => void;
  options?: ReadonlyArray<AnalyticsRangeKey>;
  justified?: boolean;
  onInteractionLockChange?: (locked: boolean) => void;
}) => {
  const renderedOptions = useMemo(
    () =>
      analyticsRangeOptions.filter(option =>
        options ? options.includes(option.key) : true,
      ),
    [options],
  );

  return (
    <View
      style={{
        backgroundColor: palette.mutedSurface,
        borderRadius: radius.pill,
        padding: analyticsUi.selectorRailPadding,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: analyticsUi.selectorRailGap,
          width: '100%',
        }}
      >
        {renderedOptions.map(option => {
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
                flexGrow: justified ? 1 : 0,
                flexShrink: 1,
                flexBasis: justified ? 0 : undefined,
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: analyticsUi.controlHeight,
                paddingVertical: analyticsUi.controlPaddingY,
                paddingHorizontal: analyticsUi.controlPaddingX,
                borderRadius: radius.pill,
                backgroundColor: active
                  ? palette.primary
                  : palette.mutedSurface,
              }}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: active ? palette.background : palette.mutedText,
                }}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};
