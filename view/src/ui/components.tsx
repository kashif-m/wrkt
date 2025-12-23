import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { palette, radius, spacing, typography } from './theme';
import {
  ColorHex,
  ColorValue,
  DisplayLabel,
  LabelText,
  NumericInput,
  PlaceholderText,
  ToastText,
  ToastTone,
  asColorValue,
  asToastTone,
  unwrapToastTone,
  unwrapColorHex,
  unwrapColorValue,
  unwrapLabelText,
  unwrapPlaceholderText,
  unwrapToastText,
} from '../domain/types';

export const ScreenContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => (
  <View style={{ flex: 1, backgroundColor: palette.background }}>
    {children}
  </View>
);

export const Card = ({
  children,
  style = {},
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) => (
  <View
    style={[
      {
        backgroundColor: palette.surface,
        padding: spacing(2),
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: palette.border,
      },
      style,
    ]}
  >
    {children}
  </View>
);

export const SectionHeading = ({ label }: { label: LabelText }) => (
  <Text style={[typography.section, { marginBottom: spacing(1) }]}>
    {unwrapLabelText(label)}
  </Text>
);

export const BodyText = ({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) => <Text style={[typography.body, style]}>{children}</Text>;

export const LabeledText = ({
  label,
  value,
}: {
  label: LabelText;
  value: LabelText;
}) => (
  <View>
    <Text style={typography.label}>{unwrapLabelText(label).toUpperCase()}</Text>
    <Text style={[typography.body, { fontWeight: '600' }]}>
      {unwrapLabelText(value)}
    </Text>
  </View>
);

export const ListRow = ({
  title,
  subtitle,
  value,
  onPress,
  showDivider = true,
}: {
  title: LabelText;
  subtitle?: LabelText;
  value?: LabelText;
  onPress?: () => void;
  showDivider?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing(1),
      borderBottomWidth: showDivider ? 1 : 0,
      borderColor: palette.border,
    }}
  >
    <View style={{ flex: 1, marginRight: spacing(1) }}>
      <Text style={{ color: palette.text, fontWeight: '600' }}>
        {unwrapLabelText(title)}
      </Text>
      {subtitle ? (
        <Text style={{ color: palette.mutedText, fontSize: 12 }}>
          {unwrapLabelText(subtitle)}
        </Text>
      ) : null}
    </View>
    {value ? (
      <Text style={{ color: palette.mutedText, fontSize: 12 }}>
        {unwrapLabelText(value)}
      </Text>
    ) : null}
  </TouchableOpacity>
);

export const EmptyState = ({
  title,
  subtitle,
  actionLabel,
  onPress,
}: {
  title: LabelText;
  subtitle?: LabelText;
  actionLabel?: LabelText;
  onPress?: () => void;
}) => (
  <View style={{ alignItems: 'center', gap: spacing(0.5) }}>
    <Text style={{ color: palette.text, fontWeight: '700', fontSize: 16 }}>
      {unwrapLabelText(title)}
    </Text>
    {subtitle ? (
      <Text style={{ color: palette.mutedText, fontSize: 13 }}>
        {unwrapLabelText(subtitle)}
      </Text>
    ) : null}
    {actionLabel && onPress ? (
      <TouchableOpacity onPress={onPress} style={{ marginTop: spacing(0.5) }}>
        <Text style={{ color: palette.primary, fontWeight: '600' }}>
          {unwrapLabelText(actionLabel)}
        </Text>
      </TouchableOpacity>
    ) : null}
  </View>
);

export const ToastBanner = ({
  text,
  tone,
}: {
  text: ToastText;
  tone?: ToastTone;
}) => {
  const toneColors = {
    success: palette.success,
    info: palette.primary,
    danger: palette.danger,
  } as const;
  const toneKey = unwrapToastTone(tone ?? asToastTone('info'));
  const color = toneColors[toneKey] as unknown as ColorHex;
  return (
    <View
      style={{
        padding: spacing(1),
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: unwrapColorHex(color),
        backgroundColor: unwrapColorValue(addAlpha(color, 0.18)),
        marginBottom: spacing(1),
      }}
    >
      <Text style={{ color: palette.text, fontWeight: '600' }}>
        {unwrapToastText(text)}
      </Text>
    </View>
  );
};

export const BottomSheet = ({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!visible) return null;
  return (
    <TouchableWithoutFeedback onPress={onClose}>
      <View style={sheetOverlay}>
        <TouchableWithoutFeedback>
          <View style={sheetCard}>{children}</View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  );
};

export const PillButton = ({
  label,
  active = false,
  onPress,
}: {
  label: LabelText;
  active?: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      paddingVertical: 10,
      paddingHorizontal: spacing(2),
      borderRadius: radius.pill,
      backgroundColor: active ? palette.primary : palette.mutedSurface,
      marginRight: spacing(1),
      marginBottom: spacing(1),
    }}
  >
    <Text
      style={{ color: active ? '#0f172a' : palette.text, fontWeight: '600' }}
    >
      {unwrapLabelText(label)}
    </Text>
  </TouchableOpacity>
);

export const PrimaryButton = ({
  label,
  onPress,
  disabled = false,
}: {
  label: LabelText;
  onPress: () => void;
  disabled?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={{
      backgroundColor: disabled ? palette.mutedSurface : palette.primary,
      paddingVertical: spacing(1.5),
      borderRadius: radius.card,
      alignItems: 'center',
      marginTop: spacing(1),
    }}
  >
    <Text
      style={{
        color: disabled ? palette.mutedText : '#0f172a',
        fontWeight: '600',
      }}
    >
      {unwrapLabelText(label)}
    </Text>
  </TouchableOpacity>
);

export const InputField = ({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType = 'default',
}: {
  label: LabelText;
  value: NumericInput;
  placeholder?: PlaceholderText;
  onChangeText: (text: NumericInput) => void;
  keyboardType?: 'default' | 'numeric';
}) => (
  <View style={{ marginBottom: spacing(1.5) }}>
    <Text style={typography.label}>{unwrapLabelText(label).toUpperCase()}</Text>
    <TextInput
      value={value}
      onChangeText={text => onChangeText(text as NumericInput)}
      placeholder={placeholder ? unwrapPlaceholderText(placeholder) : undefined}
      placeholderTextColor={palette.mutedText}
      keyboardType={keyboardType}
      style={{
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: radius.card,
        paddingVertical: 10,
        paddingHorizontal: spacing(1.5),
        color: palette.text,
        backgroundColor: palette.mutedSurface,
        marginTop: 4,
      }}
    />
  </View>
);

export const Divider = () => (
  <View
    style={{
      height: 1,
      backgroundColor: palette.border,
      marginVertical: spacing(2),
    }}
  />
);

const sheetOverlay = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  left: 0,
  bottom: 0,
  backgroundColor: 'rgba(10, 12, 18, 0.6)',
  justifyContent: 'flex-end' as const,
};

const sheetCard = {
  backgroundColor: palette.surface,
  borderTopLeftRadius: radius.card,
  borderTopRightRadius: radius.card,
  padding: spacing(2),
};

const addAlpha = (hex: ColorHex, alpha: number): ColorValue => {
  const sanitized = unwrapColorHex(hex).replace('#', '');
  if (sanitized.length !== 6) return asColorValue(unwrapColorHex(hex));
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})` as ColorValue;
};
