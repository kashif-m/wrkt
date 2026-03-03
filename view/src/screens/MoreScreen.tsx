import React, { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import {
  useAppActions,
  useAppDispatch,
  useAppState,
} from '../state/appContext';
import {
  BottomSheet,
  ListRow,
  ScreenContainer,
  SectionHeading,
} from '../ui/components';
import {
  AccentKey,
  ThemeMode,
  accentOptions,
  getContrastTextColor,
  palette,
  resolveAccentColor,
  resolveThemeModeColor,
  spacing,
  themeModeOptions,
  typography,
} from '../ui/theme';
import { addAlpha } from '../ui/color';
import { asLabelText } from '../domain/types';
import ScreenHeader from '../ui/ScreenHeader';
import {
  exportAndShareSqlite,
} from '../export/sqliteExport';

type RgbColor = { r: number; g: number; b: number };
type HsvColor = { h: number; s: number; v: number };

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const normalizeHex = (value: string): string | null => {
  const raw = value.trim();
  if (!raw) return null;
  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (!/^#[0-9A-Fa-f]{6}$/.test(withHash)) return null;
  return withHash.toUpperCase();
};

const channelToHex = (value: number): string =>
  clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0').toUpperCase();

const rgbToHex = (rgb: RgbColor): string =>
  `#${channelToHex(rgb.r)}${channelToHex(rgb.g)}${channelToHex(rgb.b)}`;

const hexToRgb = (hex: string): RgbColor | null => {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  return {
    r: parseInt(normalized.slice(1, 3), 16),
    g: parseInt(normalized.slice(3, 5), 16),
    b: parseInt(normalized.slice(5, 7), 16),
  };
};

const rgbToHsv = ({ r, g, b }: RgbColor): HsvColor => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
};

const hsvToRgb = ({ h, s, v }: HsvColor): RgbColor => {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - c;

  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hue < 60) [rn, gn, bn] = [c, x, 0];
  else if (hue < 120) [rn, gn, bn] = [x, c, 0];
  else if (hue < 180) [rn, gn, bn] = [0, c, x];
  else if (hue < 240) [rn, gn, bn] = [0, x, c];
  else if (hue < 300) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];

  return {
    r: Math.round((rn + m) * 255),
    g: Math.round((gn + m) * 255),
    b: Math.round((bn + m) * 255),
  };
};

const hueColorHex = (hue: number): string =>
  rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 }));

const SaturationValuePanel = ({
  hsv,
  onChange,
}: {
  hsv: HsvColor;
  onChange: (next: HsvColor) => void;
}) => {
  const [size, setSize] = useState({ width: 0, height: 0 });

  const updateFromTouch = (x: number, y: number) => {
    if (size.width <= 0 || size.height <= 0) return;
    const s = clamp(x / size.width, 0, 1);
    const v = clamp(1 - y / size.height, 0, 1);
    onChange({ ...hsv, s, v });
  };

  return (
    <View
      style={styles.svPanel}
      onLayout={event =>
        setSize({
          width: event.nativeEvent.layout.width,
          height: event.nativeEvent.layout.height,
        })
      }
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={event =>
        updateFromTouch(
          event.nativeEvent.locationX ?? 0,
          event.nativeEvent.locationY ?? 0,
        )
      }
      onResponderMove={event =>
        updateFromTouch(
          event.nativeEvent.locationX ?? 0,
          event.nativeEvent.locationY ?? 0,
        )
      }
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="sv-white" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="sv-black" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={hueColorHex(hsv.h)}
        />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sv-white)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sv-black)" />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.svKnob,
          {
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            borderColor: '#FFFFFF',
          },
        ]}
      />
    </View>
  );
};

const HueSlider = ({
  hue,
  onChange,
}: {
  hue: number;
  onChange: (next: number) => void;
}) => {
  const [width, setWidth] = useState(0);

  const updateFromTouch = (x: number) => {
    if (width <= 0) return;
    onChange(clamp((x / width) * 360, 0, 360));
  };

  return (
    <View
      style={styles.hueRail}
      onLayout={event => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={event =>
        updateFromTouch(event.nativeEvent.locationX ?? 0)
      }
      onResponderMove={event =>
        updateFromTouch(event.nativeEvent.locationX ?? 0)
      }
    >
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id="hue-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#FF0000" />
            <Stop offset="17%" stopColor="#FFFF00" />
            <Stop offset="33%" stopColor="#00FF00" />
            <Stop offset="50%" stopColor="#00FFFF" />
            <Stop offset="67%" stopColor="#0000FF" />
            <Stop offset="83%" stopColor="#FF00FF" />
            <Stop offset="100%" stopColor="#FF0000" />
          </LinearGradient>
        </Defs>
        <Rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="url(#hue-gradient)"
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.hueThumb,
          {
            left: `${clamp(hue / 360, 0, 1) * 100}%`,
            backgroundColor: hueColorHex(hue),
          },
        ]}
      />
    </View>
  );
};

const MoreScreen = () => {
  const state = useAppState();
  const dispatch = useAppDispatch();
  const actions = useAppActions();
  const [dataSheetOpen, setDataSheetOpen] = useState(false);
  const [importSheetOpen, setImportSheetOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [customPickerOpen, setCustomPickerOpen] = useState(false);

  const accentLabel = useMemo(
    () =>
      accentOptions.find(option => option.key === state.preferences.themeAccent)
        ?.label ?? 'Blue',
    [state.preferences.themeAccent],
  );
  const themeModeLabel = useMemo(
    () =>
      themeModeOptions.find(
        option => option.key === state.preferences.themeMode,
      )?.label ?? 'Dark',
    [state.preferences.themeMode],
  );

  const presetAccentOptions = useMemo(
    () => accentOptions.filter(option => option.key !== 'custom'),
    [],
  );
  const themeModeDisplayLabels: Record<ThemeMode, string> = {
    dark: 'Dark',
    light: 'Light',
    midnight_black: 'Midnight',
    charcoal_black: 'Charcoal',
    burgundy: 'Burgundy',
    forest_night: 'Forest',
    slate_blue: 'Slate Blue',
    sepia_dark: 'Sepia',
  };

  const selectedAccentColor = resolveAccentColor(
    state.preferences.themeAccent,
    state.preferences.customAccentHex,
  );

  const [pickerHsv, setPickerHsv] = useState<HsvColor>(() => {
    const seed =
      hexToRgb(state.preferences.customAccentHex ?? selectedAccentColor) ??
      hexToRgb('#5FA8FF')!;
    return rgbToHsv(seed);
  });
  const [customAccentInput, setCustomAccentInput] = useState(
    rgbToHex(hsvToRgb(pickerHsv)),
  );
  const pickerHex = rgbToHex(hsvToRgb(pickerHsv));

  const openCustomColorModal = () => {
    const seedHex = normalizeHex(
      state.preferences.customAccentHex ?? selectedAccentColor,
    );
    const seedRgb = hexToRgb(seedHex ?? '#5FA8FF')!;
    const seedHsv = rgbToHsv(seedRgb);
    setPickerHsv(seedHsv);
    setCustomAccentInput(rgbToHex(seedRgb));
    setCustomPickerOpen(true);
  };
  const closeThemeModal = () => {
    if (customPickerOpen) {
      setCustomPickerOpen(false);
      return;
    }
    setThemeModalOpen(false);
  };

  const handleExport = async () => {
    try {
      await exportAndShareSqlite({
        events: state.events,
        catalog: state.catalog,
        preferences: state.preferences,
      });
      setDataSheetOpen(false);
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Could not export data',
      );
    }
  };

  return (
    <ScreenContainer>
      <View style={{ flex: 1 }}>
        <ScreenHeader
          title={asLabelText('More')}
          subtitle={asLabelText('Tools and settings')}
        />
        <ScrollView
          contentContainerStyle={styles.pageContent}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.surfaceSection,
              {
                backgroundColor: palette.surface,
              },
            ]}
          >
            <SectionHeading label={asLabelText('Data')} />
            <ListRow
              title={asLabelText('Manage data')}
              subtitle={asLabelText('Import or export your logs')}
              showDivider={false}
              onPress={() => setDataSheetOpen(true)}
            />
          </View>

          <View
            style={[
              styles.surfaceSection,
              {
                backgroundColor: palette.surface,
              },
            ]}
          >
            <SectionHeading label={asLabelText('Theme')} />
            <ListRow
              title={asLabelText('Appearance')}
              subtitle={asLabelText(`${themeModeLabel} • ${accentLabel}`)}
              value={asLabelText('Change')}
              showDivider={false}
              onPress={() => setThemeModalOpen(true)}
            />
          </View>
        </ScrollView>

        <BottomSheet
          visible={dataSheetOpen}
          onClose={() => setDataSheetOpen(false)}
        >
          <View>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>
              Data
            </Text>
            <ListRow
              title={asLabelText('Import')}
              subtitle={asLabelText('Bring workouts from another app')}
              onPress={() => {
                setDataSheetOpen(false);
                setImportSheetOpen(true);
              }}
            />
            <ListRow
              title={asLabelText('Export')}
              subtitle={asLabelText('Share SQL snapshot')}
              showDivider={false}
              onPress={() => {
                void handleExport();
              }}
            />
          </View>
        </BottomSheet>

        <BottomSheet
          visible={importSheetOpen}
          onClose={() => setImportSheetOpen(false)}
        >
          <View>
            <Text style={[styles.sheetTitle, { color: palette.text }]}>
              Import from
            </Text>
            <ListRow
              title={asLabelText('FitNotes')}
              subtitle={asLabelText('Import exercises and logs')}
              showDivider={false}
              onPress={() => {
                setImportSheetOpen(false);
                void actions.importFitnotes();
              }}
            />
          </View>
        </BottomSheet>

        <Modal
          visible={themeModalOpen}
          transparent
          animationType="fade"
          onRequestClose={closeThemeModal}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeThemeModal}>
            <Pressable
              style={[
                styles.modalCard,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
              onPress={() => undefined}
            >
              {customPickerOpen ? (
                <>
                  <View style={styles.customPickerHeader}>
                    <TouchableOpacity
                      onPress={() => setCustomPickerOpen(false)}
                      style={styles.backChevronButton}
                    >
                      <Text style={{ color: palette.mutedText, fontSize: 18 }}>
                        ‹
                      </Text>
                    </TouchableOpacity>
                    <Text style={[styles.modalTitle, { color: palette.text }]}>
                      Custom color
                    </Text>
                    <View
                      style={[
                        styles.customPreview,
                        {
                          backgroundColor: pickerHex,
                          borderColor: addAlpha(pickerHex, 0.45),
                        },
                      ]}
                    />
                  </View>

                  <SaturationValuePanel
                    hsv={pickerHsv}
                    onChange={next => {
                      setPickerHsv(next);
                      setCustomAccentInput(rgbToHex(hsvToRgb(next)));
                    }}
                  />
                  <Text
                    style={[styles.sectionLabel, { color: palette.mutedText }]}
                  >
                    Hue
                  </Text>
                  <HueSlider
                    hue={pickerHsv.h}
                    onChange={nextHue => {
                      const next = { ...pickerHsv, h: nextHue };
                      setPickerHsv(next);
                      setCustomAccentInput(rgbToHex(hsvToRgb(next)));
                    }}
                  />
                  <Text
                    style={[styles.sectionLabel, { color: palette.mutedText }]}
                  >
                    Hex
                  </Text>
                  <TextInput
                    value={customAccentInput}
                    onChangeText={value => {
                      setCustomAccentInput(value);
                      const parsed = hexToRgb(value);
                      if (parsed) {
                        setPickerHsv(rgbToHsv(parsed));
                      }
                    }}
                    placeholder="#7A5AF8"
                    placeholderTextColor={palette.mutedText}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[
                      styles.customInput,
                      {
                        borderColor: palette.border,
                        color: palette.text,
                        backgroundColor: palette.mutedSurface,
                      },
                    ]}
                  />
                  <View style={styles.customActionRow}>
                    <TouchableOpacity
                      onPress={() => setCustomPickerOpen(false)}
                      style={[
                        styles.customActionButton,
                        {
                          backgroundColor: palette.mutedSurface,
                          borderColor: palette.border,
                        },
                      ]}
                    >
                      <Text style={{ color: palette.text, fontWeight: '600' }}>
                        Back
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const normalized = normalizeHex(customAccentInput);
                        if (!normalized) {
                          Alert.alert(
                            'Invalid color',
                            'Enter a valid hex color like #7A5AF8.',
                          );
                          return;
                        }
                        dispatch({
                          type: 'preferences/customAccent',
                          color: normalized,
                        });
                        dispatch({
                          type: 'preferences/themeAccent',
                          accent: 'custom',
                        });
                        setCustomPickerOpen(false);
                      }}
                      style={[
                        styles.customActionButton,
                        {
                          backgroundColor: palette.primary,
                          borderColor: palette.primary,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color: getContrastTextColor(palette.primary),
                          fontWeight: '700',
                        }}
                      >
                        Apply
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <ScrollView
                  contentContainerStyle={styles.modalScroll}
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.modalHeader}>
                    <Text style={[styles.modalTitle, { color: palette.text }]}>
                      Theme
                    </Text>
                    <View style={styles.accentPreviewRow}>
                      <View
                        style={[
                          styles.accentPreviewDot,
                          { backgroundColor: selectedAccentColor },
                        ]}
                      />
                      <Text
                        style={[
                          styles.accentPreviewLabel,
                          { color: palette.mutedText },
                        ]}
                      >
                        {accentLabel}
                      </Text>
                    </View>
                  </View>

                  <Text
                    style={[styles.sectionLabel, { color: palette.mutedText }]}
                  >
                    Mode
                  </Text>
                  <View style={styles.modeGrid}>
                    {themeModeOptions.map(option => {
                      const active = option.key === state.preferences.themeMode;
                      return (
                        <TouchableOpacity
                          key={option.key}
                          style={styles.modeCell}
                          onPress={() => {
                            dispatch({
                              type: 'preferences/themeMode',
                              mode: option.key,
                            });
                          }}
                        >
                          <View style={styles.optionStack}>
                            <View
                              style={[
                                styles.optionDot,
                                {
                                  backgroundColor: resolveThemeModeColor(
                                    option.key,
                                  ),
                                  borderColor: palette.border,
                                },
                              ]}
                            />
                            <Text
                              numberOfLines={2}
                              style={[
                                styles.optionLabel,
                                {
                                  color: active
                                    ? palette.text
                                    : palette.mutedText,
                                },
                              ]}
                            >
                              {themeModeDisplayLabels[option.key]}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.modeSelectedBar,
                              active
                                ? {
                                    backgroundColor: palette.primary,
                                    opacity: 1,
                                  }
                                : { opacity: 0 },
                            ]}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <Text
                    style={[styles.sectionLabel, { color: palette.mutedText }]}
                  >
                    Accent
                  </Text>
                  <View style={styles.accentGrid}>
                    {presetAccentOptions.map(option => {
                      const color = resolveAccentColor(option.key, null);
                      const active =
                        option.key === state.preferences.themeAccent;
                      return (
                        <TouchableOpacity
                          key={option.key}
                          style={styles.accentCell}
                          onPress={() => {
                            dispatch({
                              type: 'preferences/themeAccent',
                              accent: option.key as AccentKey,
                            });
                          }}
                        >
                          <View style={styles.optionStack}>
                            <View
                              style={[
                                styles.optionDot,
                                {
                                  backgroundColor: color,
                                  borderColor: addAlpha(color, 0.45),
                                },
                              ]}
                            />
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.optionLabel,
                                {
                                  color: active
                                    ? palette.text
                                    : palette.mutedText,
                                },
                              ]}
                            >
                              {option.label}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.accentSelectedBar,
                              active
                                ? {
                                    backgroundColor: palette.primary,
                                    opacity: 1,
                                  }
                                : { opacity: 0 },
                            ]}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TouchableOpacity
                    onPress={openCustomColorModal}
                    style={[
                      styles.customButton,
                      {
                        backgroundColor: palette.mutedSurface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <View style={styles.customButtonLeft}>
                      <View
                        style={[
                          styles.optionDot,
                          {
                            backgroundColor: state.preferences.customAccentHex
                              ? resolveAccentColor(
                                  'custom',
                                  state.preferences.customAccentHex,
                                )
                              : pickerHex,
                            borderColor: palette.border,
                          },
                        ]}
                      />
                      <Text style={{ color: palette.text, fontWeight: '600' }}>
                        Custom color
                      </Text>
                    </View>
                    <Text style={{ color: palette.mutedText, fontSize: 16 }}>
                      ›
                    </Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  pageContent: {
    paddingHorizontal: spacing(2),
    paddingTop: spacing(3),
    paddingBottom: spacing(4),
    gap: spacing(2),
  },
  surfaceSection: {
    borderRadius: 18,
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(1.5),
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sheetTitle: {
    ...typography.section,
    marginBottom: spacing(1),
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.52)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(4),
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    maxHeight: '92%',
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2),
    gap: spacing(1),
  },
  modalScroll: {
    gap: spacing(1.25),
  },
  modalHeader: {
    gap: spacing(0.5),
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  accentPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.5),
  },
  accentPreviewDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  accentPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginTop: spacing(0.5),
  },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  modeCell: {
    width: '25%',
    paddingHorizontal: 4,
    marginBottom: 12,
    alignItems: 'stretch',
    justifyContent: 'center',
    gap: 5,
  },
  optionStack: {
    minHeight: 42,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  optionDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
  },
  optionLabel: {
    fontSize: 11.5,
    lineHeight: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modeSelectedBar: {
    alignSelf: 'center',
    width: 30,
    height: 2,
    borderRadius: 2,
  },
  accentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
  },
  accentCell: {
    width: '25%',
    paddingHorizontal: 4,
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  accentSelectedBar: {
    alignSelf: 'center',
    width: 30,
    height: 2,
    borderRadius: 2,
  },
  customButton: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: spacing(1.25),
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  customButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(0.75),
  },
  customPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backChevronButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customPreview: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
  },
  svPanel: {
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    marginTop: spacing(0.5),
  },
  svKnob: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    marginLeft: -12,
    marginTop: -12,
  },
  hueRail: {
    height: 18,
    borderRadius: 999,
    overflow: 'visible',
    marginTop: spacing(0.25),
  },
  hueThumb: {
    position: 'absolute',
    top: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -12,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  customInput: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: spacing(1),
  },
  customActionRow: {
    flexDirection: 'row',
    gap: spacing(1),
    marginTop: spacing(0.5),
  },
  customActionButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default MoreScreen;
