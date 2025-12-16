import React from "react"
import { View, Text, TextInput, TouchableOpacity, ViewStyle, TextStyle } from "react-native"
import { palette, radius, spacing, typography } from "./theme"

export const ScreenContainer = ({ children }: { children: React.ReactNode }) => (
  <View style={{ flex: 1, backgroundColor: palette.background }}>{children}</View>
)

export const Card = ({
  children,
  style = {},
}: {
  children: React.ReactNode
  style?: ViewStyle | ViewStyle[]
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
)

export const SectionHeading = ({ label }: { label: string }) => (
  <Text style={[typography.section, { marginBottom: spacing(1) }]}>{label}</Text>
)

export const BodyText = ({ children, style }: { children: React.ReactNode; style?: TextStyle }) => (
  <Text style={[typography.body, style]}>{children}</Text>
)

export const LabeledText = ({ label, value }: { label: string; value: string }) => (
  <View>
    <Text style={typography.label}>{label.toUpperCase()}</Text>
    <Text style={[typography.body, { fontWeight: "600" }]}>{value}</Text>
  </View>
)

export const PillButton = ({
  label,
  active = false,
  onPress,
}: {
  label: string
  active?: boolean
  onPress: () => void
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
    <Text style={{ color: active ? "#0f172a" : palette.text, fontWeight: "600" }}>{label}</Text>
  </TouchableOpacity>
)

export const PrimaryButton = ({
  label,
  onPress,
  disabled = false,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
}) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    style={{
      backgroundColor: disabled ? palette.mutedSurface : palette.primary,
      paddingVertical: spacing(1.5),
      borderRadius: radius.card,
      alignItems: "center",
      marginTop: spacing(1),
    }}
  >
    <Text style={{ color: disabled ? palette.mutedText : "#0f172a", fontWeight: "600" }}>{label}</Text>
  </TouchableOpacity>
)

export const InputField = ({
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType = "default",
}: {
  label: string
  value: string
  placeholder?: string
  onChangeText: (text: string) => void
  keyboardType?: "default" | "numeric"
}) => (
  <View style={{ marginBottom: spacing(1.5) }}>
    <Text style={typography.label}>{label.toUpperCase()}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
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
)

export const Divider = () => (
  <View style={{ height: 1, backgroundColor: palette.border, marginVertical: spacing(2) }} />
)
