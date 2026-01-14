import React from 'react';
import { Text, View } from 'react-native';
import { useAppActions, useAppState } from '../state/appContext';
import { Card, PrimaryButton, ScreenContainer, SectionHeading } from '../ui/components';
import { palette, spacing, typography } from '../ui/theme';
import { asLabelText, asScreenKey } from '../domain/types';

const ImportSummaryScreen = () => {
  const actions = useAppActions();
  const { importSummary } = useAppState();

  if (!importSummary) {
    return (
      <ScreenContainer>
        <View style={{ paddingHorizontal: spacing(3), paddingTop: spacing(3) }}>
          <Text style={typography.title}>Import summary</Text>
          <Text style={[typography.body, { color: palette.mutedText }]}>
            No recent imports found.
          </Text>
          <PrimaryButton
            label={asLabelText('Back to more')}
            onPress={() => actions.navigate(asScreenKey('coach'))}
          />
        </View>
      </ScreenContainer>
    );
  }

  const { summary, warnings } = importSummary;

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: spacing(3), paddingTop: spacing(3) }}>
        <Text style={typography.title}>Import complete</Text>
        <Text style={[typography.body, { color: palette.mutedText }]}>
          FitNotes backup
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing(2), marginTop: spacing(2) }}>
        <Card>
          <SectionHeading label={asLabelText('Summary')} />
          <View style={{ gap: spacing(1) }}>
            <SummaryRow label="Events imported" value={summary.eventsImported} />
            <SummaryRow label="Exercises added" value={summary.exercisesAdded} />
            <SummaryRow
              label="Exercises skipped"
              value={summary.exercisesSkipped}
            />
            <SummaryRow label="Favorites added" value={summary.favoritesAdded} />
            <SummaryRow label="Warnings" value={summary.warningsCount} />
          </View>
        </Card>
      </View>

      {warnings.length > 0 ? (
        <View style={{ paddingHorizontal: spacing(2), marginTop: spacing(2) }}>
          <Card>
            <SectionHeading label={asLabelText('Warnings')} />
            <View style={{ gap: spacing(0.75) }}>
              {warnings.slice(0, 6).map((warning, index) => (
                <Text key={`${warning.kind}-${index}`} style={typography.body}>
                  {warning.message}
                </Text>
              ))}
              {warnings.length > 6 ? (
                <Text style={[typography.body, { color: palette.mutedText }]}>
                  {warnings.length - 6} more warning(s) in logs.
                </Text>
              ) : null}
            </View>
          </Card>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: spacing(2), marginTop: spacing(2) }}>
        <PrimaryButton
          label={asLabelText('Done')}
          onPress={() => actions.navigate(asScreenKey('coach'))}
        />
      </View>
    </ScreenContainer>
  );
};

const SummaryRow = ({ label, value }: { label: string; value: number }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}
  >
    <Text style={[typography.body, { color: palette.text }]}>{label}</Text>
    <Text style={[typography.body, { fontWeight: '600' }]}>
      {value.toLocaleString()}
    </Text>
  </View>
);

export default ImportSummaryScreen;
