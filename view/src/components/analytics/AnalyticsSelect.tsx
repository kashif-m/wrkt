import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetModal,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import {
  Keyboard,
  ListRenderItemInfo,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ListRow } from '../../ui/components';
import {
  analyticsUi,
  getActiveThemeMode,
  palette,
  radius,
  spacing,
  typography,
} from '../../ui/theme';
import { LabelText, asLabelText, unwrapLabelText } from '../../domain/types';
import { useNavigation } from '@react-navigation/native';
import { exerciseSearchScore } from '../../exercise/search';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type AnalyticsSelectOption<T extends string> = {
  key: T;
  label: LabelText;
  subtitle?: LabelText;
};

export const AnalyticsSelect = <T extends string>({
  title,
  options,
  selected,
  onSelect,
  searchable = false,
  searchPlaceholder,
}: {
  title: LabelText;
  options: ReadonlyArray<AnalyticsSelectOption<T>>;
  selected: T;
  onSelect: (key: T) => void;
  searchable?: boolean;
  searchPlaceholder?: LabelText;
}) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const modalRef = useRef<BottomSheetModal>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const snapPoints = useMemo(() => ['64%', '90%'], []);
  const selectedOption = useMemo(
    () => options.find(option => option.key === selected),
    [options, selected],
  );
  const filteredOptions = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    return options
      .map(option => {
        const label = unwrapLabelText(option.label);
        const subtitle = option.subtitle
          ? unwrapLabelText(option.subtitle)
          : '';
        const score = exerciseSearchScore(query, label, subtitle);
        return { option, score };
      })
      .filter(entry => entry.score !== null)
      .sort((a, b) => {
        if (a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);
        return unwrapLabelText(a.option.label).localeCompare(
          unwrapLabelText(b.option.label),
        );
      })
      .map(entry => entry.option);
  }, [options, query, searchable]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => {
    if (open) {
      modalRef.current?.present();
      return;
    }
    modalRef.current?.dismiss();
  }, [open]);

  useEffect(() => {
    if (!open) {
      setKeyboardVisible(false);
      setKeyboardInset(0);
      return;
    }
    const showEvent =
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent =
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, event => {
      setKeyboardVisible(true);
      if (Platform.OS === 'android') {
        setKeyboardInset(Math.max(0, event.endCoordinates?.height ?? 0));
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const unsubscribe = navigation.addListener('beforeRemove', event => {
      event.preventDefault();
      setOpen(false);
    });
    return unsubscribe;
  }, [navigation, open]);

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

  const renderRow = ({
    item,
    index,
  }: ListRenderItemInfo<AnalyticsSelectOption<T>>) => (
    <View
      style={{
        paddingHorizontal: spacing(0.25),
      }}
    >
      <ListRow
        title={item.label}
        subtitle={item.subtitle}
        value={item.key === selected ? asLabelText('Selected') : undefined}
        showDivider={index < filteredOptions.length - 1}
        minHeight={44}
        accessibilityLabel={unwrapLabelText(item.label)}
        accessibilityState={{ selected: item.key === selected }}
        onPress={() => {
          Keyboard.dismiss();
          onSelect(item.key);
          setOpen(false);
        }}
      />
    </View>
  );

  return (
    <>
      <View style={{ gap: spacing(0.5) }}>
        <Text style={typography.label}>
          {unwrapLabelText(title).toUpperCase()}
        </Text>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={title}
          style={{
            minHeight: analyticsUi.controlHeight,
            justifyContent: 'center',
            paddingVertical: analyticsUi.controlPaddingY,
            paddingHorizontal: analyticsUi.controlPaddingX,
            borderRadius: radius.pill,
            backgroundColor: palette.mutedSurface,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{ color: palette.text, fontWeight: '600', fontSize: 13 }}
            >
              {unwrapLabelText(selectedOption?.label ?? asLabelText('Select'))}
            </Text>
            <Text
              style={{
                color: palette.mutedText,
                fontSize: 13,
                marginLeft: spacing(1),
              }}
            >
              ▾
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      <BottomSheetModal
        ref={modalRef}
        index={1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        onDismiss={() => setOpen(false)}
        enablePanDownToClose
        enableHandlePanningGesture
        enableContentPanningGesture={false}
        keyboardBehavior={Platform.OS === 'ios' ? 'interactive' : 'extend'}
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
        <BottomSheetFlatList<AnalyticsSelectOption<T>>
          data={filteredOptions}
          keyExtractor={(item: AnalyticsSelectOption<T>) => item.key}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingBottom:
              insets.bottom +
              (Platform.OS === 'android'
                ? keyboardInset + spacing(2)
                : keyboardVisible
                ? spacing(1.5)
                : spacing(3)),
            paddingHorizontal: spacing(2),
          }}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          bounces
          alwaysBounceVertical
          overScrollMode="always"
          showsVerticalScrollIndicator
          stickyHeaderIndices={[0]}
          ListHeaderComponent={
            <View
              style={{
                gap: spacing(0.75),
                paddingTop: spacing(1),
                paddingBottom: spacing(0.75),
                backgroundColor: palette.surface,
              }}
            >
              <Text style={typography.section}>{unwrapLabelText(title)}</Text>
              {searchable ? (
                <BottomSheetTextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={
                    searchPlaceholder
                      ? unwrapLabelText(searchPlaceholder)
                      : 'Search'
                  }
                  placeholderTextColor={palette.mutedText}
                  style={{
                    borderWidth: 0,
                    borderRadius: radius.pill,
                    minHeight: analyticsUi.controlHeight,
                    paddingVertical: analyticsUi.controlPaddingY,
                    paddingHorizontal: analyticsUi.controlPaddingX,
                    color: palette.text,
                    backgroundColor: palette.mutedSurface,
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <Text style={[typography.label, { padding: spacing(1) }]}>
              No matches
            </Text>
          }
          renderItem={renderRow}
        />
      </BottomSheetModal>
    </>
  );
};
