import React from 'react';
import { Text, View } from 'react-native';
import { useAppActions } from '../state/appContext';
import {
  Card,
  ScreenContainer,
  SectionHeading,
  ListRow,
} from '../ui/components';
import { palette, spacing, typography } from '../ui/theme';
import { asLabelText } from '../domain/types';

const MoreScreen = () => {
  const actions = useAppActions();

  return (
    <ScreenContainer>
      <View style={{ paddingHorizontal: spacing(3), paddingTop: spacing(3) }}>
        <Text style={typography.title}>More</Text>
        <Text style={[typography.body, { color: palette.mutedText }]}>
          Tools and settings
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing(2), marginTop: spacing(2) }}>
        <Card>
          <SectionHeading label={asLabelText('Importing')} />
          <ListRow
            title={asLabelText('FitNotes backup')}
            subtitle={asLabelText('Import exercises and logs')}
            showDivider={false}
            onPress={() => {
              void actions.importFitnotes();
            }}
          />
        </Card>
      </View>
    </ScreenContainer>
  );
};

export default MoreScreen;
