import { Share } from 'react-native';
import { ExerciseCatalogEntry } from '../exercise/catalogStorage';
import { RootState } from '../state/appState';
import { WorkoutEvent } from '../workoutFlows';

const escapeSql = (value: string): string => value.replace(/'/g, "''");

const jsonSqlLiteral = (value: unknown): string =>
  `'${escapeSql(JSON.stringify(value))}'`;

export const buildExportSqliteSql = ({
  events,
  catalog,
  custom,
  favorites,
  settings,
}: {
  events: WorkoutEvent[];
  catalog: ExerciseCatalogEntry[];
  custom: ExerciseCatalogEntry[];
  favorites: string[];
  settings: RootState['preferences'];
}) => {
  const statements: string[] = [
    'BEGIN TRANSACTION;',
    'CREATE TABLE IF NOT EXISTS wrkt_events (event_id TEXT PRIMARY KEY, payload_json TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS wrkt_catalog (slug TEXT PRIMARY KEY, payload_json TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS wrkt_custom_catalog (slug TEXT PRIMARY KEY, payload_json TEXT NOT NULL);',
    'CREATE TABLE IF NOT EXISTS wrkt_favorites (slug TEXT PRIMARY KEY);',
    'CREATE TABLE IF NOT EXISTS wrkt_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);',
    'DELETE FROM wrkt_events;',
    'DELETE FROM wrkt_catalog;',
    'DELETE FROM wrkt_custom_catalog;',
    'DELETE FROM wrkt_favorites;',
    'DELETE FROM wrkt_settings;',
  ];

  events.forEach(event => {
    const eventId = String(event.event_id);
    statements.push(
      `INSERT INTO wrkt_events (event_id, payload_json) VALUES ('${escapeSql(
        eventId,
      )}', ${jsonSqlLiteral(event)});`,
    );
  });

  catalog.forEach(entry => {
    statements.push(
      `INSERT INTO wrkt_catalog (slug, payload_json) VALUES ('${escapeSql(
        entry.slug,
      )}', ${jsonSqlLiteral(entry)});`,
    );
  });

  custom.forEach(entry => {
    statements.push(
      `INSERT INTO wrkt_custom_catalog (slug, payload_json) VALUES ('${escapeSql(
        entry.slug,
      )}', ${jsonSqlLiteral(entry)});`,
    );
  });

  favorites.forEach(slug => {
    statements.push(
      `INSERT INTO wrkt_favorites (slug) VALUES ('${escapeSql(slug)}');`,
    );
  });

  statements.push(
    `INSERT INTO wrkt_settings (key, value_json) VALUES ('preferences', ${jsonSqlLiteral(
      settings,
    )});`,
  );
  statements.push('COMMIT;');
  return statements.join('\n');
};

export const shareExportSqliteSql = async (sql: string) => {
  await Share.share({
    title: 'WRKT export',
    message: sql,
  });
};
