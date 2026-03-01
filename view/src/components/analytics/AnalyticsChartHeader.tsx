import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { BodyText } from '../../ui/components';
import { palette } from '../../ui/theme';

export const AnalyticsChartHeader = ({
  subtitle,
  onExpand,
}: {
  subtitle: string;
  onExpand?: () => void;
}) => (
  <View
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    }}
  >
    <BodyText style={{ color: palette.mutedText }}>{subtitle}</BodyText>
    {onExpand ? (
      <TouchableOpacity onPress={onExpand}>
        <Text
          style={{ color: palette.primary, fontSize: 12, fontWeight: '600' }}
        >
          Expand
        </Text>
      </TouchableOpacity>
    ) : null}
  </View>
);
