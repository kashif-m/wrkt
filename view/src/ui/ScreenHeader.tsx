import React from 'react';
import { StyleProp, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { palette, spacing, typography } from './theme';
import ArrowLeftIcon from '../assets/arrow-left.svg';
import { LabelText, unwrapLabelText } from '../domain/types';

type Props = {
  title: LabelText;
  subtitle?: LabelText;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  onTitlePress?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
  tintColor?: string;
  subtitleColor?: string;
};

const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  rightSlot,
  onTitlePress,
  containerStyle,
  tintColor,
  subtitleColor,
}: Props) => {
  const TitleComponent = onTitlePress ? TouchableOpacity : View;
  const resolvedTitleColor = tintColor ?? palette.text;
  const resolvedSubtitleColor = subtitleColor ?? palette.mutedText;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing(2),
          paddingVertical: spacing(1.5),
          borderBottomWidth: 1,
          borderColor: palette.border,
          gap: spacing(1),
        },
        containerStyle,
      ]}
    >
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <ArrowLeftIcon width={18} height={18} color={resolvedTitleColor} />
        </TouchableOpacity>
      ) : null}
      <TitleComponent
        onPress={onTitlePress}
        style={{
          flex: 1,
          alignItems: 'center',
          gap: subtitle ? spacing(0.25) : undefined,
        }}
        disabled={!onTitlePress}
      >
        <Text
          style={[
            typography.title,
            { fontSize: 20, color: resolvedTitleColor },
          ]}
        >
          {unwrapLabelText(title)}
        </Text>
        {subtitle ? (
          <Text style={{ color: resolvedSubtitleColor, fontSize: 12 }}>
            {unwrapLabelText(subtitle)}
          </Text>
        ) : null}
      </TitleComponent>
      {rightSlot ? (
        <View>{rightSlot}</View>
      ) : (
        <View style={{ width: onBack ? 36 : 0 }} />
      )}
    </View>
  );
};

export default ScreenHeader;
