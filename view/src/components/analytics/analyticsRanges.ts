import { DisplayLabel, asDisplayLabel } from '../../domain/types';

export type AnalyticsRangeKey = '1w' | '2w' | '1m' | '3m' | '6m' | '1y' | 'all';

export type AnalyticsRangeOption = {
  key: AnalyticsRangeKey;
  label: DisplayLabel;
  days: number | null;
  longLabel: DisplayLabel;
};

export const analyticsRangeOptions: ReadonlyArray<AnalyticsRangeOption> = [
  {
    key: '1w',
    label: asDisplayLabel('1w'),
    days: 7,
    longLabel: asDisplayLabel('Last week'),
  },
  {
    key: '2w',
    label: asDisplayLabel('2w'),
    days: 14,
    longLabel: asDisplayLabel('Last 2 weeks'),
  },
  {
    key: '1m',
    label: asDisplayLabel('1m'),
    days: 30,
    longLabel: asDisplayLabel('Last 1 month'),
  },
  {
    key: '3m',
    label: asDisplayLabel('3m'),
    days: 90,
    longLabel: asDisplayLabel('Last 3 months'),
  },
  {
    key: '6m',
    label: asDisplayLabel('6m'),
    days: 180,
    longLabel: asDisplayLabel('Last 6 months'),
  },
  {
    key: '1y',
    label: asDisplayLabel('1y'),
    days: 365,
    longLabel: asDisplayLabel('Last year'),
  },
  {
    key: 'all',
    label: asDisplayLabel('All'),
    days: null,
    longLabel: asDisplayLabel('All time'),
  },
];

export const getRangeOption = (key: AnalyticsRangeKey): AnalyticsRangeOption =>
  analyticsRangeOptions.find(option => option.key === key) ??
  analyticsRangeOptions[0];
