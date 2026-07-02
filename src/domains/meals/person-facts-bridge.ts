import type { MutationProvenance } from '../../auth';
import type {
  ConsentVisibility,
  PersonFactKind,
  PersonFactSource,
  PersonFactStatus,
} from '../../personal-context';
import type { MealsCalibrationResponseInput } from './onboarding-calibration';

export interface MealsPreferencePersonFactInput {
  kind: PersonFactKind;
  value: unknown;
  status: PersonFactStatus;
  source: PersonFactSource;
  visibility: ConsentVisibility;
}

export interface MealsPreferencePersonFactRejectInput {
  kind: PersonFactKind;
  value: unknown;
}

const MEALS_TIER1_VISIBILITY: ConsentVisibility = {
  domains: 'all',
  hosts: 'all',
  derived_only_across: [],
};

const MEALS_TIER1_SOURCE: PersonFactSource = {
  origin: 'user_confirmed',
  domain: 'meals',
  detail: 'meals_preference_patch',
};

export function personFactInputsFromMealsPreferencePatch(
  patch: MealsCalibrationResponseInput['preferencePatch'],
): MealsPreferencePersonFactInput[] {
  if (!patch) return [];
  return [
    ...stringArray(patch.allergies).map((label) =>
      input('allergy', { label, severity: 'avoid' }),
    ),
    ...stringArray(patch.hardAvoids).map((label) => input('hard_avoid', { label })),
    ...stringArray(patch.dietaryConstraints).map((label) => input('dietary_pattern', { label })),
    ...stringArray(patch.dislikes).map((label) => input('anti_favorite', { label, domain_hint: 'meals' })),
    ...stringArray(patch.favoriteFoods).map((label) => input('taste_pref', { label, polarity: 'like' })),
  ];
}

export function personFactRejectInputsFromMealsCalibrationSignals(
  signals: MealsCalibrationResponseInput['signals'],
): MealsPreferencePersonFactRejectInput[] {
  if (!signals) return [];
  const rejected = signals.filter((signal) => signal.status === 'rejected');
  return rejected.flatMap<MealsPreferencePersonFactRejectInput>((signal) => {
    const label = signal.value.trim();
    if (!label) return [];
    switch (signal.kind) {
      case 'allergy':
        return [{ kind: 'allergy', value: { label, severity: 'avoid' } }];
      case 'dietary_constraint':
        return [{ kind: 'dietary_pattern', value: { label } }];
      case 'disliked_food':
        return [
          { kind: 'hard_avoid', value: { label } },
          { kind: 'anti_favorite', value: { label, domain_hint: 'meals' } },
        ];
      case 'favorite_food':
        return [{ kind: 'taste_pref', value: { label, polarity: 'like' } }];
      default:
        return [];
    }
  });
}

export async function mirrorMealsTier1PersonFacts(
  input: {
    preferencePatch?: MealsCalibrationResponseInput['preferencePatch'];
    provenance: MutationProvenance;
    rejectPersonFact: (input: MealsPreferencePersonFactRejectInput, provenance: MutationProvenance) => Promise<unknown>;
    signals?: MealsCalibrationResponseInput['signals'];
    upsertPersonFact: (input: MealsPreferencePersonFactInput, provenance: MutationProvenance) => Promise<unknown>;
  },
): Promise<{ rejected: number; upserted: number }> {
  let upserted = 0;
  for (const factInput of personFactInputsFromMealsPreferencePatch(input.preferencePatch ?? null)) {
    await input.upsertPersonFact(factInput, input.provenance);
    upserted += 1;
  }

  let rejected = 0;
  for (const rejectInput of personFactRejectInputsFromMealsCalibrationSignals(input.signals ?? null)) {
    await input.rejectPersonFact(rejectInput, input.provenance);
    rejected += 1;
  }

  return { rejected, upserted };
}

function input(kind: PersonFactKind, value: unknown): MealsPreferencePersonFactInput {
  return {
    kind,
    source: MEALS_TIER1_SOURCE,
    status: 'confirmed',
    value,
    visibility: MEALS_TIER1_VISIBILITY,
  };
}

function stringArray(value: string[] | null | undefined): string[] {
  return Array.isArray(value)
    ? value.map((entry) => entry.trim()).filter((entry) => entry.length > 0)
    : [];
}
