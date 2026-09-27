import { z } from 'zod';

// References are evidence, never fetch instructions. Exclude credentials and private receipt URLs.
const publicUrl = z.string().max(2048).url().refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
    && url.hostname.includes('.') && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname)
    && !url.hostname.endsWith('.local') && !url.hostname.endsWith('.internal');
}, 'Use a public HTTPS product URL without credentials, query parameters or fragments.');
const text = z.string().trim().min(1).max(1000);
const fact = z.object({ value: text, source_id: z.string().min(1).max(40) }).strict();
export const productReferenceSchema = z.object({
  status: z.enum(['candidate', 'confirmed', 'rejected']),
  match_basis: z.enum(['user_confirmed', 'exact_product_code', 'receipt', 'unverified']),
  product_url: publicUrl,
  brand: text,
  name: text,
  product_code: z.string().trim().min(1).max(100).optional(),
  sources: z.array(z.object({
    id: z.string().min(1).max(40),
    kind: z.enum(['brand', 'retailer', 'receipt', 'garment_label']),
    url: publicUrl.optional(),
    observed_at: z.string().datetime({ offset: true }),
  }).strict()).min(1).max(8),
  facts: z.object({ colour: fact.optional(), composition: fact.optional(), care: fact.optional(), construction: fact.optional(), made_in: fact.optional() }).strict(),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'confirmed' && value.match_basis === 'unverified') ctx.addIssue({ code: 'custom', message: 'Confirm the product match before applying its facts.' });
  if (value.status === 'confirmed' && ['exact_product_code','receipt'].includes(value.match_basis) && !value.product_code) ctx.addIssue({ code: 'custom', message: 'Supply the product code established by the match evidence.' });
  const ids = new Set(value.sources.map(source => source.id));
  if (ids.size !== value.sources.length) ctx.addIssue({ code: 'custom', message: 'Source IDs must be unique.' });
  for (const entry of Object.values(value.facts)) if (entry && !ids.has(entry.source_id)) ctx.addIssue({ code: 'custom', message: 'Every fact must reference a supplied source.' });
  if (!value.sources.some(source => source.url === value.product_url)) ctx.addIssue({ code: 'custom', message: 'Include the product listing in sources.' });
});
export const productEnrichmentSchema = z.object({
  expected_revision: z.number().int().nonnegative(),
  operation_id: z.string().uuid(),
  reference: productReferenceSchema,
}).strict();
export type ProductReference = z.infer<typeof productReferenceSchema>;
export type ProductEnrichment = z.infer<typeof productEnrichmentSchema>;
export type ProductReferenceState = { revision: number; reference: ProductReference | null };
