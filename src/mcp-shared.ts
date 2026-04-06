import { z } from 'zod';

export const provenanceInputSchema = {
  confidence: z.number().min(0).max(1).optional(),
  session_id: z.string().optional(),
  source_agent: z.string().optional(),
  source_skill: z.string().optional(),
  source_type: z.string().optional(),
};

export const readViewSchema = z.enum(['summary', 'full']).optional();
export const writeResponseModeSchema = z.enum(['ack', 'full']).optional();

export const iconFor = (origin: string) => [
  {
    src: `${origin}/icon.svg`,
    mimeType: 'image/svg+xml',
    sizes: ['any'],
  },
];

export function toolResult(
  data: unknown,
  options?: {
    structuredContent?: unknown;
    textData?: unknown;
  },
) {
  const structuredCandidate = options?.structuredContent ?? data;
  const structuredContent =
    structuredCandidate && typeof structuredCandidate === 'object' && !Array.isArray(structuredCandidate)
      ? (structuredCandidate as Record<string, unknown>)
      : { value: structuredCandidate };
  const textData = options?.textData ?? summarizeForToolText(data);

  return {
    content: [
      {
        type: 'text' as const,
        text: typeof textData === 'string' ? textData : JSON.stringify(textData),
      },
    ],
    structuredContent,
  };
}

export function jsonResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        text: JSON.stringify(data),
        uri,
      },
    ],
  };
}

export function firstTemplateValue(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

const PRIORITY_TEXT_KEYS = [
  'id',
  'name',
  'title',
  'status',
  'date',
  'weekStart',
  'weekEnd',
  'updatedAt',
  'createdAt',
  'itemId',
  'recipeId',
  'photoId',
  'candidateId',
  'action',
  'entityType',
  'entityId',
] as const;

function summarizeForToolText(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }

    if (depth >= 1) {
      return { count: value.length, kind: 'array' };
    }

    return {
      count: value.length,
      kind: 'array',
      preview: value.slice(0, 4).map((entry) => summarizeForToolText(entry, depth + 1, seen)),
      truncated: value.length > 4,
    };
  }

  if (typeof value !== 'object') {
    return String(value);
  }

  if (seen.has(value as object)) {
    return '[circular]';
  }

  seen.add(value as object);
  const record = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  for (const key of PRIORITY_TEXT_KEYS) {
    if (key in record && isSimpleToolTextValue(record[key])) {
      summary[key] = record[key];
    }
  }

  for (const [key, entryValue] of Object.entries(record)) {
    if (key in summary) {
      continue;
    }
    if (!isSimpleToolTextValue(entryValue)) {
      continue;
    }
    summary[key] = entryValue;
    if (Object.keys(summary).length >= 8) {
      break;
    }
  }

  const nestedKeys = Object.entries(record)
    .filter(([, entryValue]) => Array.isArray(entryValue) || (entryValue && typeof entryValue === 'object'))
    .map(([key]) => key);

  if (nestedKeys.length > 0) {
    summary.nested = nestedKeys.slice(0, 6);
    summary.hasMoreNested = nestedKeys.length > 6;
  }

  if (Object.keys(summary).length === 0 || depth >= 1) {
    summary.keyCount = Object.keys(record).length;
  }

  seen.delete(value as object);
  return summary;
}

function isSimpleToolTextValue(value: unknown): value is string | number | boolean | null {
  return value == null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}
