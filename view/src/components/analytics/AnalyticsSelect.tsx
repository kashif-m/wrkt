import React, { useMemo, useState, useEffect } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomSheet, ListRow } from '../../ui/components';
import {
  analyticsUi,
  palette,
  radius,
  spacing,
  typography,
} from '../../ui/theme';
import { LabelText, asLabelText, unwrapLabelText } from '../../domain/types';
import { useNavigation } from '@react-navigation/native';
import { exerciseSearchScore } from '../../exercise/search';

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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sheetHeight, setSheetHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
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
    if (!open) return;
    const unsubscribe = navigation.addListener('beforeRemove', event => {
      event.preventDefault();
      setOpen(false);
    });
    return unsubscribe;
  }, [navigation, open]);

  const listMaxHeight = useMemo(() => {
    if (sheetHeight <= 0 || headerHeight <= 0) return null;
    return Math.max(180, sheetHeight - headerHeight - spacing(0.5));
  }, [headerHeight, sheetHeight]);

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
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        onCardLayout={setSheetHeight}
      >
        <View style={{ gap: spacing(1), minHeight: 0 }}>
          <View
            onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}
            style={{ gap: spacing(0.75) }}
          >
            <Text style={typography.section}>{unwrapLabelText(title)}</Text>
            {searchable ? (
              <TextInput
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
          <FlatList
            data={filteredOptions}
            keyExtractor={item => item.key}
            style={{
              maxHeight: listMaxHeight ?? 320,
              minHeight: filteredOptions.length > 6 ? 160 : undefined,
              marginTop: spacing(0.25),
            }}
            contentContainerStyle={{
              paddingBottom: spacing(3),
              paddingHorizontal: 0,
            }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            showsVerticalScrollIndicator
            ListFooterComponent={<View style={{ height: spacing(3) }} />}
            ListEmptyComponent={
              <Text style={[typography.label, { padding: spacing(1) }]}>
                No matches
              </Text>
            }
            renderItem={renderRow}
          />
        </View>
      </BottomSheet>
    </>
  );
};
