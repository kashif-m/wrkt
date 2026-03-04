import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  ViewStyle,
  TextStyle,
  Animated,
  PanResponder,
} from 'react-native';
import {
  analyticsUi,
  cardShadowStyle,
  getActiveThemeMode,
  getContrastTextColor,
  palette,
  radius,
  spacing,
  typography,
} from './theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  variant = 'default',
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
  onCardLayout,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeightRatio?: number;
  onCardLayout?: (height: number) => void;
}) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [sheetCardHeight, setSheetCardHeight] = useState(0);
  const translateY = useRef(new Animated.Value(0)).current;
  const closingRef = useRef(false);
  const dismissDistance = useMemo(
    () =>
      Math.max(
        260,
        Math.min(height * 0.95, sheetCardHeight + insets.bottom + spacing(4)),
      ),
    [height, insets.bottom, sheetCardHeight],
  );
  const closeThreshold = useMemo(
    () => Math.max(84, dismissDistance * 0.2),
    [dismissDistance],
  );
  const backdropOpacity = translateY.interpolate({
    inputRange: [0, dismissDistance],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const closeWithSlide = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    Animated.timing(translateY, {
      toValue: dismissDistance,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      closingRef.current = false;
      onClose();
    });
  }, [dismissDistance, onClose, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: event =>
          event.nativeEvent.locationY <= 44,
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          gestureState.dy > 6 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
        onPanResponderMove: (_event, gestureState) => {
          if (gestureState.dy <= 0) return;
          translateY.setValue(Math.min(dismissDistance, gestureState.dy));
        },
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dy > closeThreshold || gestureState.vy > 1.2) {
            closeWithSlide();
            return;
          }
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
            speed: 20,
          }).start();
        },
      }),
    [closeThreshold, closeWithSlide, dismissDistance, translateY],
  );

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0);
      return;
    }

    const resolveHeight = (
      endCoordinates: { height?: number; screenY?: number } | undefined,
    ) => {
      if (!endCoordinates) return 0;
      if (typeof endCoordinates.screenY === 'number') {
        return Math.max(0, height - endCoordinates.screenY);
      }
      return Math.max(0, endCoordinates.height ?? 0);
    };

    const onShowOrFrame = (event: {
      endCoordinates?: { height?: number; screenY?: number };
    }) => {
      setKeyboardHeight(resolveHeight(event.endCoordinates));
    };
    const onHide = () => setKeyboardHeight(0);

    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, onShowOrFrame);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [height, visible]);

  useEffect(() => {
    if (!visible) return;
    translateY.setValue(dismissDistance);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 22,
    }).start();
  }, [dismissDistance, translateY, visible]);

  if (!visible) return null;
  const defaultMaxHeight = Math.max(
    240,
    (height - insets.top) * maxHeightRatio,
  );
  const keyboardSafeHeight = Math.max(
    220,
    height - insets.top - keyboardHeight - spacing(2),
  );
  const maxHeight =
    keyboardHeight > 0
      ? Math.min(defaultMaxHeight, keyboardSafeHeight)
      : defaultMaxHeight;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={closeWithSlide}
      statusBarTranslucent
    >
      <View style={sheetOverlay}>
        <Animated.View
          pointerEvents="none"
          style={[
            sheetBackdrop,
            {
              opacity: backdropOpacity,
              backgroundColor:
                getActiveThemeMode() === 'light'
                  ? 'rgba(31, 41, 55, 0.2)'
                  : 'rgba(10, 12, 18, 0.6)',
            },
          ]}
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={closeWithSlide} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.bottom}
          style={sheetKeyboardWrap}
        >
          <Animated.View
            style={{
              transform: [{ translateY }],
            }}
            {...panResponder.panHandlers}
          >
            <Pressable
              onPress={() => undefined}
              onLayout={event => {
                const measuredHeight = event.nativeEvent.layout.height;
                setSheetCardHeight(measuredHeight);
                onCardLayout?.(measuredHeight);
              }}
              style={[
                {
                  backgroundColor: palette.surface,
                  borderTopLeftRadius: radius.card,
                  borderTopRightRadius: radius.card,
                  padding: spacing(2),
                },
                {
                  maxHeight,
                  paddingBottom: spacing(1.5) + insets.bottom,
                },
              ]}
            >
              <View style={sheetHandleWrap}>
                <View
                  style={[sheetHandle, { backgroundColor: palette.primary }]}
                />
              </View>
              {children}
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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

const sheetOverlay = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  left: 0,
  bottom: 0,
  justifyContent: 'flex-end' as const,
};

const sheetBackdrop = {
  ...StyleSheet.absoluteFillObject,
};

const sheetKeyboardWrap = {
  flex: 1,
  justifyContent: 'flex-end' as const,
};

const sheetHandleWrap = {
  alignItems: 'center' as const,
  marginTop: -spacing(0.5),
  marginBottom: spacing(1),
};

const sheetHandle = {
  width: 40,
  height: 4,
  borderRadius: 999,
};
