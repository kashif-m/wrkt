import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ViewStyle,
  TextStyle,
} from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  cardShadowStyle,
  getActiveThemeMode,
  getContrastTextColor,
  palette,
  radius,
  spacing,
  typography,
} from './theme';
import {
  ColorHex,
  LabelText,
  NumericInput,
  PlaceholderText,
  ToastText,
  ToastTone,
  asColorValue,
  asToastTone,
  unwrapToastTone,
  unwrapColorHex,
  unwrapLabelText,
  unwrapPlaceholderText,
  unwrapToastText,
} from '../domain/types';
import { addAlpha } from './color';

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
  variant: _variant = 'default',
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  variant?: 'default' | 'analytics';
}) => (
  <View
    style={[
      {
        backgroundColor: palette.surface,
        padding: spacing(2),
        borderRadius: radius.card,
        borderWidth: 0,
        borderColor: palette.border,
        ...cardShadowStyle,
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
  minHeight,
  accessibilityLabel,
  accessibilityState,
}: {
  title: LabelText;
  subtitle?: LabelText;
  value?: LabelText;
  onPress?: () => void;
  showDivider?: boolean;
  minHeight?: number;
  accessibilityLabel?: string;
  accessibilityState?: { selected?: boolean };
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={accessibilityLabel}
    accessibilityState={accessibilityState}
    style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: spacing(1),
      minHeight,
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
        backgroundColor: asColorValue(addAlpha(unwrapColorHex(color), 0.18)),
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
  maxHeightRatio = 0.72,
  expandedHeightRatio,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightRatio?: number;
  expandedHeightRatio?: number;
}) => {
  const insets = useSafeAreaInsets();
  const modalRef = useRef<BottomSheetModal>(null);
  const openedRef = useRef(false);
  const snapPoint = `${Math.round(Math.min(Math.max(maxHeightRatio, 0.35), 0.95) * 100)}%`;
  const expandedSnapPoint =
    typeof expandedHeightRatio === 'number'
      ? `${Math.round(Math.min(Math.max(expandedHeightRatio, 0.35), 0.98) * 100)}%`
      : null;
  const snapPoints = useMemo(
    () =>
      expandedSnapPoint ? [snapPoint, expandedSnapPoint] : [snapPoint],
    [expandedSnapPoint, snapPoint],
  );
  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={getActiveThemeMode() === 'light' ? 0.2 : 0.6}
      />
    ),
    [],
  );

  useEffect(() => {
    if (!visible) {
      if (openedRef.current) {
        modalRef.current?.dismiss();
      }
      return;
    }
    if (!openedRef.current) {
      openedRef.current = true;
      modalRef.current?.present();
    }
  }, [visible]);

  return (
    <BottomSheetModal
      ref={modalRef}
      index={0}
      snapPoints={snapPoints}
      enableDynamicSizing
      onDismiss={() => {
        openedRef.current = false;
        onClose();
      }}
      enablePanDownToClose
      enableHandlePanningGesture
      keyboardBehavior="interactive"
      keyboardBlurBehavior="none"
      android_keyboardInputMode="adjustResize"
      topInset={insets.top + spacing(1)}
      bottomInset={0}
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{
        backgroundColor: palette.primary,
        width: 40,
        height: 4,
      }}
      backgroundStyle={{
        backgroundColor: palette.surface,
        borderTopLeftRadius: radius.card,
        borderTopRightRadius: radius.card,
      }}
    >
      <BottomSheetView
        style={{
          paddingHorizontal: spacing(2),
          paddingTop: spacing(1),
          paddingBottom: spacing(2) + insets.bottom,
        }}
      >
        {children}
      </BottomSheetView>
    </BottomSheetModal>
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
      style={{
        color: active ? getContrastTextColor(palette.primary) : palette.text,
        fontWeight: '600',
      }}
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
        color: disabled
          ? palette.mutedText
          : getContrastTextColor(palette.primary),
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
