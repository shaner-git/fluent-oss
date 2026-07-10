import {
  FLUENT_PUBLIC_CONTRACT_VERSION,
  FLUENT_PUBLIC_PROFILE_POLICY,
  FLUENT_PUBLIC_RENDER_ADAPTERS,
  FLUENT_PUBLIC_RESOURCE_URIS,
  FLUENT_PUBLIC_TOOL_NAMES,
  FLUENT_PUBLIC_WRITE_TOOL_NAMES,
} from './public-profile';

// Internal names are retained for the read/write implementation modules while
// the public product and generated artifacts use the unversioned Fluent name.
export const FLUENT_VNEXT_CONTRACT_VERSION = FLUENT_PUBLIC_CONTRACT_VERSION;

export type FluentVNextDomain = 'shared' | 'meals' | 'style' | 'wellbeing' | 'finance';
export type FluentVNextConceptKind = 'read' | 'write' | 'render';
export type FluentVNextConceptPhase = 'discovery' | 'phase1_read' | 'phase2_write' | 'adapter';
export type FluentVNextHostProfileId = 'public_app' | 'assistant_product' | 'operator_private';

export interface FluentVNextConcept {
  name: (typeof FLUENT_PUBLIC_TOOL_NAMES)[number];
  kind: FluentVNextConceptKind;
  phase: FluentVNextConceptPhase;
  domains: readonly FluentVNextDomain[];
  coreRequired: boolean;
  typedDomainSchemas: boolean;
  publicSafe: boolean;
  replacesToolFamilies: readonly string[];
  notes: readonly string[];
}

export interface FluentVNextHostProfile {
  id: FluentVNextHostProfileId;
  title: string;
  role: string;
  conceptNames: readonly string[];
  surfacePolicy: string;
  excludes: readonly string[];
}

export interface FluentVNextGeneratedHostProfile {
  id: FluentVNextHostProfileId;
  title: string;
  contractVersion: string;
  implementedConceptNames: readonly string[];
  omittedConceptNames: readonly string[];
  tools: readonly string[];
  resources: readonly string[];
  writeTools: readonly string[];
  renderAdapters: readonly string[];
  policy: string;
}

const WRITE_TOOLS = new Set<string>(FLUENT_PUBLIC_WRITE_TOOL_NAMES);
const RENDER_TOOLS = new Set<string>(FLUENT_PUBLIC_RENDER_ADAPTERS);

function conceptKind(name: string): FluentVNextConceptKind {
  if (WRITE_TOOLS.has(name)) return 'write';
  if (RENDER_TOOLS.has(name)) return 'render';
  return 'read';
}

function conceptDomains(name: string): readonly FluentVNextDomain[] {
  if (name.includes('recipe') || name.includes('meal_plan') || name.includes('grocery')) return ['meals'];
  if (name.includes('style')) return ['style'];
  if (name.includes('budget') || name === 'fluent_get_purchase_context') return ['meals', 'style'];
  if (name === 'fluent_get_media_bundle') return ['meals', 'style'];
  if (name === 'fluent_list_items' || name === 'fluent_get_item' || name === 'fluent_list_evidence' || name === 'fluent_archive_item') {
    return ['meals', 'style'];
  }
  return ['shared', 'meals', 'style'];
}

export const FLUENT_VNEXT_CONCEPTS = FLUENT_PUBLIC_TOOL_NAMES.map((name): FluentVNextConcept => {
  const kind = conceptKind(name);
  return {
    name,
    kind,
    phase: kind === 'render' ? 'adapter' : kind === 'write' ? 'phase2_write' : name.includes('capabilities') || name.includes('account_status') ? 'discovery' : 'phase1_read',
    domains: conceptDomains(name),
    coreRequired: kind !== 'render',
    typedDomainSchemas: !name.includes('capabilities') && !name.includes('account_status'),
    publicSafe: true,
    replacesToolFamilies: [],
    notes: ['Current Fluent 2.0 public contract surface.'],
  };
});

const READ_LAYER_CONCEPT_NAMES = FLUENT_VNEXT_CONCEPTS
  .filter((concept) => concept.kind === 'read' && concept.phase !== 'discovery')
  .map((concept) => concept.name);
const WRITE_LAYER_CONCEPT_NAMES = [...FLUENT_PUBLIC_WRITE_TOOL_NAMES];
const IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES = [...FLUENT_PUBLIC_TOOL_NAMES];

export const FLUENT_VNEXT_HOST_PROFILES = [
  {
    id: 'public_app',
    title: 'Public App',
    role: 'Current Fluent product contract for assistant-native hosts.',
    conceptNames: IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES,
    surfacePolicy: FLUENT_PUBLIC_PROFILE_POLICY,
    excludes: ['operator diagnostics', 'external execution', 'Health and Wellbeing', 'raw financial data'],
  },
  {
    id: 'assistant_product',
    title: 'Assistant Product',
    role: 'Current Fluent product contract for Claude, Codex, OpenClaw, and generic MCP clients.',
    conceptNames: IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES,
    surfacePolicy: FLUENT_PUBLIC_PROFILE_POLICY,
    excludes: ['operator diagnostics', 'external execution', 'Health and Wellbeing', 'raw financial data'],
  },
  {
    id: 'operator_private',
    title: 'Operator Private',
    role: 'Metadata view of the same contract for deterministic operator verification; no separate runtime route exists.',
    conceptNames: IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES,
    surfacePolicy: FLUENT_PUBLIC_PROFILE_POLICY,
    excludes: ['separate public endpoint', 'additional runtime tools'],
  },
] as const satisfies readonly FluentVNextHostProfile[];

export function fluentVNextContractRegistry() {
  return {
    version: FLUENT_PUBLIC_CONTRACT_VERSION,
    concepts: FLUENT_VNEXT_CONCEPTS,
    hostProfiles: FLUENT_VNEXT_HOST_PROFILES,
    readLayerConceptNames: READ_LAYER_CONCEPT_NAMES,
    writeLayerConceptNames: WRITE_LAYER_CONCEPT_NAMES,
    implementedAssistantProductConceptNames: IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES,
  };
}

export function fluentVNextConcept(name: string): FluentVNextConcept | undefined {
  return FLUENT_VNEXT_CONCEPTS.find((concept) => concept.name === name);
}

export function fluentVNextHostProfile(id: FluentVNextHostProfileId): FluentVNextHostProfile {
  const profile = FLUENT_VNEXT_HOST_PROFILES.find((entry) => entry.id === id);
  if (!profile) throw new Error(`Unknown Fluent host profile: ${id}`);
  return profile;
}

export function fluentVNextConceptsForHostProfile(id: FluentVNextHostProfileId): FluentVNextConcept[] {
  const profile = fluentVNextHostProfile(id);
  return profile.conceptNames.map((name) => fluentVNextConcept(name)).filter(Boolean) as FluentVNextConcept[];
}

export function fluentVNextReadLayerConceptNames(): readonly string[] {
  return READ_LAYER_CONCEPT_NAMES;
}

export function fluentVNextWriteLayerConceptNames(): readonly string[] {
  return WRITE_LAYER_CONCEPT_NAMES;
}

export function fluentVNextImplementedAssistantProductConceptNames(): readonly string[] {
  return IMPLEMENTED_ASSISTANT_PRODUCT_CONCEPT_NAMES;
}

export function fluentVNextGeneratedHostProfile(id: FluentVNextHostProfileId): FluentVNextGeneratedHostProfile {
  const profile = fluentVNextHostProfile(id);
  return {
    id,
    title: profile.title,
    contractVersion: FLUENT_PUBLIC_CONTRACT_VERSION,
    implementedConceptNames: [...FLUENT_PUBLIC_TOOL_NAMES],
    omittedConceptNames: [],
    tools: [...FLUENT_PUBLIC_TOOL_NAMES],
    resources: [...FLUENT_PUBLIC_RESOURCE_URIS],
    writeTools: [...FLUENT_PUBLIC_WRITE_TOOL_NAMES],
    renderAdapters: [...FLUENT_PUBLIC_RENDER_ADAPTERS],
    policy: profile.surfacePolicy,
  };
}
