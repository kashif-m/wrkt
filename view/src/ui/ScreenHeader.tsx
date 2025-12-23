import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { palette, spacing, typography } from './theme';
import ArrowLeftIcon from '../assets/arrow-left.svg';
import { LabelText, unwrapLabelText } from '../domain/types';

type Props = {
  title: LabelText;
  subtitle?: LabelText;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  onTitlePress?: () => void;
};

const ScreenHeader = ({
  title,
  subtitle,
  onBack,
  rightSlot,
  onTitlePress,
}: Props) => {
  const TitleComponent = onTitlePress ? TouchableOpacity : View;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: spacing(2),
        paddingVertical: spacing(1.5),
        borderBottomWidth: 1,
        borderColor: palette.border,
        gap: spacing(1),
      }}
    >
      {onBack ? (
        <TouchableOpacity
          onPress={onBack}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: palette.border,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.surface,
          }}
        >
          <ArrowLeftIcon width={18} height={18} color={palette.text} />
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
        <Text style={[typography.title, { fontSize: 20 }]}>
          {unwrapLabelText(title)}
        </Text>
        {subtitle ? (
          <Text style={{ color: palette.mutedText, fontSize: 12 }}>
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
