import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { SkiaTrendChart, TrendPoint } from './SkiaTrendChart';
import { palette, spacing, typography } from '../../ui/theme';
import { AnalyticsRangeKey } from './analyticsRanges';

export const AnalyticsChartModal = ({
  visible,
  title,
  onClose,
  data,
  unit,
  rangeKey,
  countLabel,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  data: TrendPoint[];
  unit?: string;
  rangeKey?: AnalyticsRangeKey;
  countLabel?: string;
}) => (
  <Modal
    visible={visible}
    transparent
    animationType="fade"
    onRequestClose={onClose}
  >
    <Pressable
      style={{
        flex: 1,
        backgroundColor: 'rgba(10, 12, 18, 0.75)',
        padding: spacing(2),
        justifyContent: 'center',
      }}
      onPress={onClose}
    >
      <Pressable
        onPress={event => {
          event.stopPropagation();
        }}
        style={{
          backgroundColor: palette.surface,
          borderRadius: 16,
          padding: spacing(2),
          gap: spacing(1.5),
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Text style={typography.section}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: palette.primary, fontWeight: '600' }}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 320 }}>
          <SkiaTrendChart
            data={data}
            height={320}
            unit={unit}
            showTooltip
            rangeKey={rangeKey}
            countLabel={countLabel}
          />
        </View>
      </Pressable>
    </Pressable>
  </Modal>
);
