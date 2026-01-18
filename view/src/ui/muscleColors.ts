import {
  ColorHex,
  MuscleGroup,
  asColorHex,
  asMuscleGroup,
} from '../domain/types';

const muscleColorEntries: Array<[MuscleGroup, ColorHex]> = [
  [asMuscleGroup('chest'), asColorHex('#E06AA3')], // rose
  [asMuscleGroup('back'), asColorHex('#3FA7D6')], // ocean blue
  [asMuscleGroup('legs'), asColorHex('#39B980')], // athletic green
  [asMuscleGroup('shoulders'), asColorHex('#E59A3A')], // warm amber
  [asMuscleGroup('triceps'), asColorHex('#E46C6A')], // coral
  [asMuscleGroup('biceps'), asColorHex('#8C7BEA')], // soft violet
  [asMuscleGroup('posterior_chain'), asColorHex('#2FA7A0')], // teal (chain/hinge)
  [asMuscleGroup('cardio'), asColorHex('#E2556B')], // energetic red-pink
  [asMuscleGroup('core'), asColorHex('#D6B23D')], // golden
  [asMuscleGroup('glutes'), asColorHex('#C66F9C')], // plum-rose
  [asMuscleGroup('grip'), asColorHex('#7E9AAE')], // steel/slate
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
