import { ColorHex, MuscleGroup, asColorHex, asMuscleGroup } from '../domain/types';

const muscleColorEntries: Array<[MuscleGroup, ColorHex]> = [
  [asMuscleGroup('chest'), asColorHex('#f472b6')],
  [asMuscleGroup('back'), asColorHex('#22d3ee')],
  [asMuscleGroup('legs'), asColorHex('#34d399')],
  [asMuscleGroup('shoulders'), asColorHex('#f97316')],
  [asMuscleGroup('triceps'), asColorHex('#fb7185')],
  [asMuscleGroup('biceps'), asColorHex('#a78bfa')],
  [asMuscleGroup('posterior_chain'), asColorHex('#38bdf8')],
  [asMuscleGroup('cardio'), asColorHex('#2dd4bf')],
  [asMuscleGroup('core'), asColorHex('#fbbf24')],
  [asMuscleGroup('glutes'), asColorHex('#f472b6')],
  [asMuscleGroup('grip'), asColorHex('#67e8f9')],
];

export const muscleColorMap: Record<MuscleGroup, ColorHex> =
  muscleColorEntries.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {} as Record<MuscleGroup, ColorHex>);

export const getMuscleColor = (
  group?: MuscleGroup | null,
  fallback: ColorHex = asColorHex('#60a5fa'),
) => {
  if (!group) return fallback;
  return muscleColorMap[group] ?? fallback;
};
