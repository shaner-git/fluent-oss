import type {
  StylePurchaseAnalysis,
  StylePurchaseCandidate,
  StylePurchaseComparisonRelation,
  StylePurchaseStylistJudgment,
  StylePurchaseStylistJudgmentDecisionBasis,
  StylePurchaseStylistJudgmentVerdict,
  StylePurchaseStylistJudgmentWardrobeImpact,
} from './types';

export const STYLE_PURCHASE_ANALYSIS_LEGACY_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v2.html';
export const STYLE_PURCHASE_ANALYSIS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v3.html';
export const STYLE_PURCHASE_ANALYSIS_CACHED_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v4.html';
export const STYLE_PURCHASE_ANALYSIS_IMAGE_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v5.html';
export const STYLE_PURCHASE_ANALYSIS_HUMAN_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v6.html';
export const STYLE_PURCHASE_ANALYSIS_COMBINED_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v7.html';
export const STYLE_PURCHASE_ANALYSIS_BRIDGE_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v9.html';
export const STYLE_PURCHASE_ANALYSIS_ACTIONS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v10.html';
export const STYLE_PURCHASE_ANALYSIS_FRAMED_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v11.html';
export const STYLE_PURCHASE_ANALYSIS_COMPARISON_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v12.html';
export const STYLE_PURCHASE_ANALYSIS_EDITORIAL_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v13.html';
export const STYLE_PURCHASE_ANALYSIS_TITLE_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v14.html';
export const STYLE_PURCHASE_ANALYSIS_PHOTO_READ_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v15.html';
export const STYLE_PURCHASE_ANALYSIS_DECISION_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v16.html';
export const STYLE_PURCHASE_ANALYSIS_SECONDARY_ACTION_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v17.html';
export const STYLE_PURCHASE_ANALYSIS_HYDRATION_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v18.html';
export const STYLE_PURCHASE_ANALYSIS_NATIVE_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v19.html';
export const STYLE_PURCHASE_ANALYSIS_MCP_APPS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v20.html';
export const STYLE_PURCHASE_ANALYSIS_JUDGMENT_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v21.html';
export const STYLE_PURCHASE_ANALYSIS_TEMPLATE_VERSION = 'v22';
export const STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v22.html';

export type PurchaseVerdict = 'recommend' | 'skip' | 'consider' | 'wait';
export type PurchaseConfidence = 'low' | 'medium' | 'high';
export type PurchaseFindingTone =
  | 'overlap'
  | 'fit'
  | 'price'
  | 'care'
  | 'versatility'
  | 'timing'
  | 'quality'
  | 'neutral';
export type PurchaseGapNeed = 'high' | 'med' | 'low';

export interface PurchaseAnalysisActionViewModel {
  id: 'log_purchase';
  label: string;
  variant: 'primary' | 'secondary';
  toolName: string;
  args: Record<string, unknown>;
}

export interface PurchaseAnalysisWidgetActionViewModel {
  id: PurchaseAnalysisActionViewModel['id'];
  label: string;
  variant: PurchaseAnalysisActionViewModel['variant'];
}

export interface PurchaseAnalysisItemViewModel {
  name: string;
  brand: string | null;
  priceDisplay: string | null;
  priceCad: number | null;
  descriptor: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  productUrl: string | null;
  category: string | null;
  colorway: string | null;
}

export interface PurchaseAnalysisFindingViewModel {
  id: string;
  tag: string;
  tone: PurchaseFindingTone;
  body: string;
  bodySecondary: string | null;
  metricValue: string | null;
  metricLabel: string | null;
}

export interface PurchaseAnalysisAlternativeViewModel {
  label: string;
  title: string;
  body: string;
  priceDisplay: string | null;
  productUrl: string | null;
}

export interface PurchaseAnalysisClosetContextViewModel {
  calibrationLabel: string | null;
  calibrationNotes: string[];
  closetEvidenceBasis: StylePurchaseAnalysis['calibration']['purchaseAnalysisReadiness']['basis'];
  closetItemsChecked: number | null;
  totalActiveEvidenceItems: number | null;
  wearHistoryMonths: number | null;
  similarItemsOwned: number | null;
}

export interface PurchaseAnalysisVisualGroundingViewModel {
  candidateImageCount: number;
  candidateVisualGrounding: 'none' | 'image_reference_only' | 'host_visual_inspection';
  label: string;
  note: string;
  tone: 'neutral' | 'warn';
}

export interface PurchaseAnalysisOverlapViewModel {
  name: string;
  note: string | null;
  pct: number;
}

export interface PurchaseAnalysisGapViewModel {
  lane: string;
  need: PurchaseGapNeed;
  note: string | null;
}

export type PurchaseAnalysisShoppingVerdict = 'buy' | 'skip' | 'consider' | 'wait';
export type PurchaseAnalysisShoppingComparatorRole = 'direct_comparator' | 'adjacent_reference';

export interface PurchaseAnalysisShoppingComparatorViewModel {
  itemId: string;
  canonicalItemId: string;
  name: string;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  colorFamily: string | null;
  descriptor: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  hasImage: boolean;
  comparatorRole: PurchaseAnalysisShoppingComparatorRole;
  relation: StylePurchaseComparisonRelation;
  relationLabel: string;
  roleLabel: string;
  overlapScore: number;
  confidence: PurchaseConfidence;
  summary: string;
  reasons: string[];
}

export interface PurchaseAnalysisShoppingRejectedComparatorViewModel {
  itemId: string;
  name: string;
  rejectedBecause: string;
  reasons: string[];
}

export interface PurchaseAnalysisShoppingEvidenceViewModel {
  used: string[];
  missing: string[];
}

export type PurchaseAnalysisJudgmentSource = 'host_stylist_judgment' | 'computed_fallback';

export interface PurchaseAnalysisStylistJudgmentViewModel {
  caveats: string[];
  decisionBasis: StylePurchaseStylistJudgmentDecisionBasis | null;
  headline: string | null;
  pairingOpportunities: string[];
  rationale: string | null;
  referencedComparatorIds: string[];
  verdict: StylePurchaseStylistJudgmentVerdict;
  wardrobeImpact: StylePurchaseStylistJudgmentWardrobeImpact | null;
  whatItAdds: string | null;
  whereItOverlaps: string | null;
}

export interface PurchaseAnalysisShoppingAnswerViewModel {
  verdict: PurchaseAnalysisShoppingVerdict;
  verdictReason: string;
  closestComparators: PurchaseAnalysisShoppingComparatorViewModel[];
  directComparators: PurchaseAnalysisShoppingComparatorViewModel[];
  adjacentReferences: PurchaseAnalysisShoppingComparatorViewModel[];
  rejectedComparators: PurchaseAnalysisShoppingRejectedComparatorViewModel[];
  evidence: PurchaseAnalysisShoppingEvidenceViewModel;
  whatWouldChangeVerdict: string[];
}

export interface PurchaseAnalysisViewModel {
  id: string;
  item: PurchaseAnalysisItemViewModel;
  verdict: PurchaseVerdict;
  verdictHeadline: string;
  verdictEmphasis: string | null;
  confidence: PurchaseConfidence;
  confidenceLabel: string;
  confidencePercent: number | null;
  analysisSummary: string;
  findings: PurchaseAnalysisFindingViewModel[];
  overlap: PurchaseAnalysisOverlapViewModel[];
  gaps: PurchaseAnalysisGapViewModel[];
  reasons: string[];
  alternatives: PurchaseAnalysisAlternativeViewModel[];
  context: PurchaseAnalysisClosetContextViewModel;
  visualGrounding: PurchaseAnalysisVisualGroundingViewModel;
  judgmentSource: PurchaseAnalysisJudgmentSource;
  shoppingAnswer: PurchaseAnalysisShoppingAnswerViewModel;
  stylistJudgment: PurchaseAnalysisStylistJudgmentViewModel | null;
  generatedAt: string | null;
  actions: PurchaseAnalysisActionViewModel[];
}

export interface PurchaseAnalysisWidgetViewModel extends Omit<PurchaseAnalysisViewModel, 'actions'> {
  actions: PurchaseAnalysisWidgetActionViewModel[];
}

export interface PurchaseAnalysisImageHints {
  candidateImageUrl?: string | null;
  comparatorImageUrlsByItemId?: Record<string, string | null | undefined> | null;
}

export function buildPurchaseAnalysisViewModel(
  analysis: StylePurchaseAnalysis,
  options?: {
    actionToolName?: string;
    comparatorItemIdMode?: 'canonical' | 'handles';
    imageHints?: PurchaseAnalysisImageHints;
    stylistJudgment?: StylePurchaseStylistJudgment | null;
  },
): PurchaseAnalysisViewModel {
  const rawStylistJudgment = buildStylistJudgmentViewModel(analysis, options?.stylistJudgment ?? null);
  const suppressWardrobeFitCopy = analysis.calibration.purchaseAnalysisReadiness.readinessLevel === 'not_ready';
  const stylistJudgment = suppressWardrobeFitCopy ? null : rawStylistJudgment;
  const judgmentSource: PurchaseAnalysisJudgmentSource = stylistJudgment ? 'host_stylist_judgment' : 'computed_fallback';
  const rawVerdict = stylistJudgment ? mapStylistJudgmentVerdictToPurchaseVerdict(stylistJudgment.verdict) : deriveVerdict(analysis);
  const verdict = capPurchaseVerdictForCalibration(rawVerdict, analysis);
  const confidencePercent = capConfidencePercentForCalibration(deriveConfidencePercent(analysis), analysis);
  const confidence = confidencePercent >= 76 ? 'high' : confidencePercent >= 56 ? 'medium' : 'low';
  const item = buildItemViewModel(analysis.candidate, options?.imageHints);
  const visualGrounding = buildVisualGroundingViewModel(analysis);
  const overlap = suppressWardrobeFitCopy ? [] : buildOverlapViewModel(analysis);
  const reasons = [
    ...calibrationReasonNotes(analysis, rawVerdict, verdict),
    ...(suppressWardrobeFitCopy
      ? buildCandidateOnlyReasons(analysis, verdict)
      : stylistJudgment
        ? buildReasonsFromStylistJudgment(stylistJudgment)
        : buildReasons(analysis, verdict)),
  ];
  const findings = suppressWardrobeFitCopy ? buildCandidateOnlyFindings(analysis) : buildFindings(analysis);
  const gaps = suppressWardrobeFitCopy ? [] : buildGapViewModel(analysis);
  const actions = item.name && verdict === 'recommend'
    ? [
        {
          id: 'log_purchase' as const,
          label: 'Add to closet',
          variant: 'primary' as const,
          toolName: options?.actionToolName ?? 'style_apply_purchase_analysis_action',
          args: {
            action_id: 'log_purchase',
            candidate: analysis.candidate,
          },
        },
      ]
    : [];

  return {
    actions,
    alternatives: [],
    analysisSummary:
      cleanPurchasePresentationCopy(
        suppressWardrobeFitCopy ? buildCandidateOnlySummary(analysis, verdict) : stylistJudgment?.rationale ?? buildSummary(analysis, verdict),
      ) ?? '',
    confidence,
    confidenceLabel: `Confidence · ${titleCase(confidence)}`,
    confidencePercent,
    context: {
      calibrationLabel: analysis.calibration.purchaseAnalysisReadiness.label,
      calibrationNotes: analysis.calibration.purchaseAnalysisReadiness.notes,
      closetEvidenceBasis: analysis.calibration.purchaseAnalysisReadiness.basis,
      closetItemsChecked: Object.keys(analysis.itemsById).length,
      similarItemsOwned:
        analysis.contextBuckets.exactComparatorItems.length +
        analysis.contextBuckets.typedRoleItems.length +
        analysis.contextBuckets.sameCategoryItems.length,
      totalActiveEvidenceItems: analysis.calibration.activeItemCount,
      wearHistoryMonths: null,
    },
    findings,
    gaps,
    generatedAt: null,
    id: buildAnalysisId(analysis),
    item,
    judgmentSource,
    overlap,
    reasons: cleanPurchasePresentationCopyArray(reasons),
    shoppingAnswer: buildShoppingAnswerViewModel(
      analysis,
      verdict,
      options?.imageHints,
      options?.comparatorItemIdMode ?? 'canonical',
      stylistJudgment,
      suppressWardrobeFitCopy,
    ),
    stylistJudgment,
    verdict,
    verdictEmphasis: null,
    verdictHeadline:
      cleanPurchasePresentationCopy(
        stylistJudgment?.headline
          ? stylistJudgment.headline
          : suppressWardrobeFitCopy
            ? buildCandidateOnlyHeadline(verdict)
            : addVisualGroundingToHeadline(analysis, buildVerdictHeadline(analysis, verdict)),
      ) ?? '',
    visualGrounding,
  };
}

export function buildPurchaseAnalysisStructuredContent(viewModel: PurchaseAnalysisViewModel) {
  const widget = buildPurchaseAnalysisWidgetViewModel(viewModel);
  return {
    analysisId: widget.id,
    analysisSummary: widget.analysisSummary,
    confidence: widget.confidence,
    experience: 'purchase_analysis_widget',
    findingCount: widget.findings.length,
    gapCount: widget.gaps.length,
    judgmentSource: widget.judgmentSource,
    overlapCount: widget.overlap.length,
    purchaseAnalysis: widget,
    recommendationTrust: widget.context,
    shoppingAnswer: widget.shoppingAnswer,
    stylistJudgment: widget.stylistJudgment,
    title: widget.item.name,
    verdict: widget.verdict,
    visualGrounding: widget.visualGrounding,
  };
}

export function buildPurchaseAnalysisMetadata(viewModel: PurchaseAnalysisViewModel) {
  return {
    actionInvocations: viewModel.actions,
    analysisId: viewModel.id,
    experience: 'purchase_analysis_widget',
    purchaseAnalysis: buildPurchaseAnalysisWidgetViewModel(viewModel),
    judgmentSource: viewModel.judgmentSource,
    shoppingAnswer: viewModel.shoppingAnswer,
    stylistJudgment: viewModel.stylistJudgment,
    title: viewModel.item.name,
    verdict: viewModel.verdict,
    visualGrounding: viewModel.visualGrounding,
    version: STYLE_PURCHASE_ANALYSIS_TEMPLATE_VERSION,
  };
}

function buildStylistJudgmentViewModel(
  analysis: StylePurchaseAnalysis,
  judgment: StylePurchaseStylistJudgment | null,
): PurchaseAnalysisStylistJudgmentViewModel | null {
  if (!judgment) return null;
  const knownComparatorIds = new Set([
    ...Object.keys(analysis.itemsById),
    ...analysis.comparatorReasoning.topComparisons.map((entry) => entry.itemId),
    ...analysis.comparatorReasoning.rejectedComparisons.map((entry) => entry.itemId),
  ]);
  const referencedComparatorIds = uniqueStrings(
    judgment.referencedComparatorIds.filter((itemId) => knownComparatorIds.has(itemId)),
  ).slice(0, 6);
  return {
    caveats: uniqueStrings(judgment.caveats.map(cleanStylistJudgmentCopy).filter(isPresentString)).slice(0, 4),
    decisionBasis: judgment.decisionBasis,
    headline: cleanStylistJudgmentCopy(judgment.headline),
    pairingOpportunities: uniqueStrings(
      judgment.pairingOpportunities.map(cleanStylistJudgmentCopy).filter(isPresentString),
    ).slice(0, 4),
    rationale: cleanStylistJudgmentCopy(judgment.rationale),
    referencedComparatorIds,
    verdict: judgment.verdict,
    wardrobeImpact: judgment.wardrobeImpact,
    whatItAdds: cleanStylistJudgmentCopy(judgment.whatItAdds),
    whereItOverlaps: cleanStylistJudgmentCopy(judgment.whereItOverlaps),
  };
}

function cleanStylistJudgmentCopy(value: string | null): string | null {
  return cleanPurchasePresentationCopy(value);
}

function cleanPurchasePresentationCopy(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value
    .replace(/\byes\s+if\b/gi, 'stronger case when')
    .replace(/\bno\s+if\b/gi, 'weaker case when')
    .replace(/\bnearby lane\b/gi, 'adjacent style context')
    .replace(/\bsame role\b/gi, 'same wardrobe job')
    .replace(/\bcloset already covers this lane\b/gi, 'closet already covers this job')
    .replace(/\blane\b/gi, 'area')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (/^adds variety\.?$/i.test(cleaned)) return null;
  return cleaned;
}

function cleanPurchasePresentationCopyArray(values: string[]): string[] {
  return values.map(cleanPurchasePresentationCopy).filter(isPresentString);
}

function isPresentString(value: string | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function mapStylistJudgmentVerdictToPurchaseVerdict(verdict: StylePurchaseStylistJudgmentVerdict): PurchaseVerdict {
  if (verdict === 'buy') return 'recommend';
  if (verdict === 'skip') return 'skip';
  if (verdict === 'consider') return 'consider';
  return 'wait';
}

function capPurchaseVerdictForCalibration(verdict: PurchaseVerdict, analysis: StylePurchaseAnalysis): PurchaseVerdict {
  const basis = analysis.calibration.purchaseAnalysisReadiness.basis;
  if (verdict !== 'recommend') {
    return verdict;
  }
  if (basis === 'no_closet' || basis === 'thin_closet' || basis === 'imported_unconfirmed') {
    return 'consider';
  }
  return verdict;
}

function capConfidencePercentForCalibration(percent: number, analysis: StylePurchaseAnalysis): number {
  const basis = analysis.calibration.purchaseAnalysisReadiness.basis;
  if (basis === 'no_closet') return Math.min(percent, 45);
  if (basis === 'thin_closet') return Math.min(percent, 55);
  if (basis === 'imported_unconfirmed' || basis === 'closet_inferred') return Math.min(percent, 68);
  return percent;
}

function calibrationReasonNotes(
  analysis: StylePurchaseAnalysis,
  rawVerdict: PurchaseVerdict,
  finalVerdict: PurchaseVerdict,
): string[] {
  const notes: string[] = [];
  const readiness = analysis.calibration.purchaseAnalysisReadiness;
  if (readiness.basis === 'no_closet') {
    notes.push('I can judge the item itself, but I do not know your wardrobe yet.');
  } else if (readiness.basis === 'thin_closet') {
    notes.push('This is based on early closet signal, not a fully learned wardrobe.');
  } else if (readiness.basis === 'imported_unconfirmed') {
    notes.push('Your imported closet suggests this, but those items have not been confirmed as active taste yet.');
  } else if (readiness.basis === 'closet_inferred') {
    notes.push('Your closet suggests this pattern; you have not confirmed it as a preference yet.');
  }
  if (rawVerdict === 'recommend' && finalVerdict !== 'recommend') {
    notes.push('I am keeping this as a consider rather than a buy because the Style calibration is not strong enough for a confident wardrobe-fit claim.');
  }
  return notes;
}

function buildReasonsFromStylistJudgment(judgment: PurchaseAnalysisStylistJudgmentViewModel): string[] {
  return uniqueStrings([
    judgment.rationale,
    ...judgment.caveats,
    ...judgment.pairingOpportunities,
  ].filter(isPresentString)).slice(0, 4);
}

function buildCandidateOnlyHeadline(verdict: PurchaseVerdict): string {
  if (verdict === 'skip') return 'Candidate-focused skip; Style needs more closet evidence.';
  if (verdict === 'consider') return 'Candidate-focused consider; Style needs more closet evidence.';
  if (verdict === 'recommend') return 'Candidate-focused buy signal; Style needs more closet evidence.';
  return 'Candidate-focused wait; Style needs more closet evidence.';
}

function buildCandidateOnlySummary(analysis: StylePurchaseAnalysis, verdict: PurchaseVerdict): string {
  if (analysis.evidenceQuality.candidateVisualGrounding !== 'host_visual_inspection') {
    return 'I can only judge the item cautiously until a usable candidate image is inspected and Style has stronger closet evidence.';
  }
  if (verdict === 'skip') {
    return 'The item itself does not make a strong enough case, and Style does not have enough closet evidence for a wardrobe-fit claim.';
  }
  if (verdict === 'consider' || verdict === 'recommend') {
    return 'The item itself has some promise, but Style does not have enough closet evidence for a confident wardrobe-fit claim.';
  }
  return 'The item needs more evidence before a real recommendation, and Style does not have enough closet evidence for a wardrobe-fit claim.';
}

function buildCandidateOnlyReasons(analysis: StylePurchaseAnalysis, verdict: PurchaseVerdict): string[] {
  const reasons: string[] = [];
  if (analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection') {
    reasons.push('The candidate image has been inspected, so this read can discuss the item itself.');
  } else if (analysis.evidenceQuality.candidateVisualGrounding === 'image_reference_only') {
    reasons.push('The candidate image reference exists, but its pixels still need inspection before a final visual call.');
  } else {
    reasons.push('No usable candidate image has been inspected yet.');
  }
  if (verdict === 'skip') {
    reasons.push('The current evidence does not support a strong buy call on the item itself.');
  } else {
    reasons.push('Style needs starter or confirmed closet evidence before it can judge how this fits the wardrobe.');
  }
  return cleanPurchasePresentationCopyArray(reasons);
}

export function getPurchaseAnalysisWidgetHtml(): string {
  return `
<div id="purchase-analysis-root"></div>
<style>
  :root {
    color-scheme: light;
    --pa-surface: #ffffff;
    --pa-surface-alt: #f7f7f8;
    --pa-border: rgba(0, 0, 0, 0.08);
    --pa-border-strong: rgba(0, 0, 0, 0.14);
    --pa-ink: #0d0d0d;
    --pa-ink-soft: #3c3c43;
    --pa-muted: #6e6e73;
    --pa-style: #7c2d3e;
    --pa-good-bg: #ecfdf5;
    --pa-good-ink: #065f46;
    --pa-good-bar: #10b981;
    --pa-warn-bg: #fff7e6;
    --pa-warn-ink: #78400a;
    --pa-warn-bar: #d97706;
    --pa-danger-bg: #fef2f2;
    --pa-danger-ink: #991b1b;
    --pa-danger-bar: #dc2626;
    --pa-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    --pa-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 16px rgba(0, 0, 0, 0.04);
  }

  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--pa-sans); color: var(--pa-ink); background: transparent; }
  button { font: inherit; }

  .pa-card {
    border: 1px solid var(--pa-border);
    border-radius: 16px;
    background: var(--pa-surface);
    overflow: hidden;
    box-shadow: var(--pa-shadow);
  }
  .pa-card-inner { padding: 20px 22px; }
  .pa-head {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 16px;
    margin-bottom: 16px;
  }
  .pa-thumb {
    width: 100px; height: 120px;
    border-radius: 10px;
    border: 1px solid var(--pa-border);
    background: linear-gradient(135deg, #3b4a6b, #1f2a44);
    display: grid; place-items: center;
    overflow: hidden;
  }
  .pa-thumb img {
    width: calc(100% - 16px);
    height: calc(100% - 16px);
    object-fit: contain;
    object-position: center;
    display: block;
    border-radius: 7px;
    background: #fff;
  }
  .pa-thumb-glyph { color: rgba(255, 255, 255, 0.75); }
  .pa-thumb[data-image-error="true"]::after {
    content: "Photo unavailable";
    color: rgba(255, 255, 255, 0.82);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    padding: 10px;
  }
  .pa-head-body { min-width: 0; }
  .pa-eyebrow {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--pa-muted); margin-bottom: 4px;
  }
  .pa-title {
    margin: 0; font-size: 20px; line-height: 1.25; font-weight: 600;
    letter-spacing: -0.01em; color: var(--pa-ink);
  }
  .pa-descriptor { font-size: 14px; line-height: 1.45; color: var(--pa-ink-soft); margin-top: 6px; }
  .pa-price { font-size: 14px; color: var(--pa-ink); margin-top: 6px; font-weight: 600; }
  .pa-verdict {
    padding: 14px 16px; border-radius: 10px; display: grid;
    grid-template-columns: auto 1fr auto; gap: 14px; align-items: center; margin-bottom: 18px;
  }
  .pa-verdict[data-verdict="recommend"] { background: var(--pa-good-bg); }
  .pa-verdict[data-verdict="skip"] { background: var(--pa-danger-bg); }
  .pa-verdict[data-verdict="consider"] { background: var(--pa-warn-bg); }
  .pa-verdict[data-verdict="wait"] { background: var(--pa-surface-alt); }
  .pa-verdict-badge {
    width: 44px; height: 44px; border-radius: 10px; color: #fff;
    display: grid; place-items: center; font-size: 20px; font-weight: 700;
  }
  .pa-verdict[data-verdict="recommend"] .pa-verdict-badge { background: var(--pa-good-bar); }
  .pa-verdict[data-verdict="skip"] .pa-verdict-badge { background: var(--pa-danger-bar); }
  .pa-verdict[data-verdict="consider"] .pa-verdict-badge { background: var(--pa-warn-bar); }
  .pa-verdict[data-verdict="wait"] .pa-verdict-badge { background: var(--pa-muted); }
  .pa-verdict-eyebrow {
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
  }
  .pa-verdict-headline { font-size: 15px; color: var(--pa-ink); font-weight: 600; margin-top: 2px; }
  .pa-verdict-meta { text-align: right; }
  .pa-verdict-meta-label {
    font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; color: var(--pa-muted);
  }
  .pa-verdict-meta-value { font-size: 14px; color: var(--pa-ink); font-weight: 600; font-variant-numeric: tabular-nums; }
  .pa-section { margin-bottom: 18px; }
  .pa-section-title { font-size: 15px; font-weight: 600; color: var(--pa-ink); margin: 0 0 10px; }
  .pa-overlap-row {
    display: grid; grid-template-columns: minmax(140px, 200px) 1fr; gap: 14px;
    align-items: center; padding: 10px 0; border-top: 1px solid var(--pa-border);
  }
  .pa-overlap-row:first-of-type { border-top: 0; }
  .pa-overlap-name { font-size: 14px; color: var(--pa-ink); font-weight: 500; }
  .pa-overlap-note { font-size: 12px; color: var(--pa-muted); margin-top: 1px; }
  .pa-overlap-bar-wrap { display: flex; align-items: center; gap: 10px; }
  .pa-overlap-bar { flex: 1; max-width: 140px; height: 4px; border-radius: 999px; background: var(--pa-surface-alt); overflow: hidden; }
  .pa-overlap-bar-fill { height: 100%; background: var(--pa-style); border-radius: 999px; }
  .pa-overlap-pct { font-size: 12px; color: var(--pa-muted); font-weight: 500; min-width: 34px; text-align: right; }
  .pa-reason { display: grid; grid-template-columns: 18px 1fr; gap: 8px; padding: 4px 0; font-size: 14px; color: var(--pa-ink-soft); line-height: 1.5; }
  .pa-reason-num { color: var(--pa-muted); font-weight: 600; }
  .pa-findings { display: grid; gap: 8px; }
  .pa-finding {
    display: grid; grid-template-columns: 90px minmax(0, 1fr) auto; gap: 14px;
    align-items: start; padding: 12px 14px; border-radius: 10px;
    background: var(--pa-surface-alt); border: 1px solid var(--pa-border);
  }
  .pa-finding-tag {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--pa-style); padding-top: 2px;
  }
  .pa-finding-body { font-size: 14px; line-height: 1.5; color: var(--pa-ink); }
  .pa-finding-body-secondary { font-size: 12px; color: var(--pa-muted); margin-top: 4px; }
  .pa-finding-metric { text-align: right; min-width: 80px; }
  .pa-finding-metric-num { font-size: 22px; line-height: 1; font-weight: 600; color: var(--pa-ink); }
  .pa-finding-metric-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--pa-muted); margin-top: 2px; }
  .pa-gap-block { padding: 14px 16px; background: var(--pa-surface-alt); border-radius: 10px; margin-bottom: 16px; }
  .pa-gap-title { font-size: 15px; font-weight: 600; color: var(--pa-ink); margin: 0 0 8px; }
  .pa-gap-row {
    display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: center;
    padding: 6px 0; border-top: 1px solid var(--pa-border);
  }
  .pa-gap-row:first-of-type { border-top: 0; }
  .pa-gap-pill {
    padding: 2px 8px; border-radius: 999px; font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em;
  }
  .pa-gap-pill[data-need="high"] { background: var(--pa-danger-bg); color: var(--pa-danger-ink); }
  .pa-gap-pill[data-need="med"] { background: var(--pa-warn-bg); color: var(--pa-warn-ink); }
  .pa-gap-pill[data-need="low"] { background: var(--pa-surface); color: var(--pa-muted); border: 1px solid var(--pa-border); }
  .pa-gap-lane { font-size: 14px; color: var(--pa-ink); font-weight: 500; }
  .pa-gap-note { font-size: 12px; color: var(--pa-muted); margin-left: 8px; }
  .pa-summary { font-size: 14px; line-height: 1.5; color: var(--pa-ink-soft); max-width: 62ch; margin: 0 0 14px; }
  .pa-stylist-read {
    border: 1px solid var(--pa-border);
    border-radius: 12px;
    padding: 14px 16px;
    margin: 0 0 16px;
    background: var(--pa-surface);
  }
  .pa-stylist-kicker {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--pa-style);
    margin-bottom: 5px;
  }
  .pa-stylist-copy {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--pa-ink-soft);
  }
  .pa-compare-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
    gap: 10px;
  }
  .pa-compare-card {
    min-width: 0;
    border: 1px solid var(--pa-border);
    border-radius: 12px;
    background: var(--pa-surface-alt);
    padding: 10px;
  }
  .pa-compare-thumb {
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 9px;
    border: 1px solid var(--pa-border);
    background: linear-gradient(135deg, #f5f2ef, #e7e3df);
    display: grid;
    place-items: center;
    overflow: hidden;
    margin-bottom: 9px;
  }
  .pa-compare-thumb img {
    width: calc(100% - 18px);
    height: calc(100% - 18px);
    object-fit: contain;
    object-position: center;
    display: block;
    border-radius: 7px;
    background: #fff;
  }
  .pa-compare-glyph { color: var(--pa-muted); font-size: 12px; font-weight: 600; text-align: center; padding: 8px; }
  .pa-compare-thumb[data-image-error="true"]::after {
    content: "Photo unavailable";
    color: var(--pa-muted);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
    padding: 8px;
  }
  .pa-compare-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--pa-muted);
    margin-bottom: 4px;
  }
  .pa-compare-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.35;
    color: var(--pa-ink);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .pa-compare-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 8px;
  }
  .pa-chip {
    border: 1px solid var(--pa-border);
    border-radius: 999px;
    background: var(--pa-surface);
    color: var(--pa-muted);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    padding: 5px 7px;
  }
  .pa-compare-note {
    color: var(--pa-ink-soft);
    font-size: 12px;
    line-height: 1.4;
    margin-top: 8px;
  }
  .pa-compare-score {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--pa-border);
  }
  .pa-compare-score-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .pa-compare-score-label {
    color: var(--pa-muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .pa-compare-score-value {
    color: var(--pa-ink);
    font-size: 12px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .pa-compare-score-bar {
    height: 4px;
    border-radius: 999px;
    background: var(--pa-border);
    overflow: hidden;
  }
  .pa-compare-score-fill {
    height: 100%;
    border-radius: inherit;
    background: var(--pa-style);
  }
  .pa-grounding {
    display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px;
    padding: 11px 13px; border-radius: 10px; margin: -4px 0 16px;
    border: 1px solid var(--pa-border); background: var(--pa-surface-alt);
  }
  .pa-grounding[data-tone="warn"] { background: var(--pa-warn-bg); color: var(--pa-warn-ink); border-color: rgba(217, 119, 6, 0.22); }
  .pa-grounding-icon {
    width: 24px; height: 24px; border-radius: 8px; display: grid; place-items: center;
    font-size: 13px; font-weight: 700; background: rgba(0, 0, 0, 0.08); color: currentColor;
  }
  .pa-grounding-title {
    font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px;
  }
  .pa-grounding-note { font-size: 13px; line-height: 1.4; }
  .pa-context {
    display: flex; flex-wrap: wrap; gap: 6px 18px; padding: 10px 0;
    border-top: 1px solid var(--pa-border); font-size: 11px; font-weight: 500;
    text-transform: uppercase; letter-spacing: 0.04em; color: var(--pa-muted);
  }
  .pa-footer {
    display: flex; justify-content: flex-end; gap: 8px; padding-top: 14px; border-top: 1px solid var(--pa-border);
  }
  .pa-btn {
    cursor: pointer; border: 1px solid var(--pa-border); border-radius: 10px;
    min-height: 44px; min-width: 44px; padding: 10px 16px; background: var(--pa-surface); color: var(--pa-ink);
    font-size: 14px; font-weight: 500; display: inline-flex; align-items: center; gap: 6px;
  }
  .pa-btn[data-variant="primary"] { background: var(--pa-style); color: #fff; border-color: var(--pa-style); }
  .pa-btn[disabled] { opacity: 0.55; cursor: default; }
  .pa-error, .pa-success {
    margin: 12px 0 0; border-radius: 10px; padding: 10px 14px; font-size: 13px; line-height: 1.45;
  }
  .pa-error { background: var(--pa-danger-bg); color: var(--pa-danger-ink); }
  .pa-success { background: var(--pa-good-bg); color: var(--pa-good-ink); }
  .pa-fallback {
    border-radius: 16px; padding: 18px 20px; border: 1px solid var(--pa-border);
    background: var(--pa-surface); font-size: 14px; color: var(--pa-ink-soft); line-height: 1.5;
  }
  .pa-editorial {
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(26, 23, 18, 0.08);
  }
  .pa-editorial .pa-card-inner { padding: 18px 20px 16px; }
  .pa-editorial-head {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
    padding-bottom: 18px;
    border-bottom: 1px solid var(--pa-border);
  }
  .pa-editorial .pa-thumb {
    width: 112px;
    height: 140px;
    border-radius: 9px;
    background: #f2eee8;
    border-color: rgba(0, 0, 0, 0.1);
  }
  .pa-editorial .pa-thumb img {
    width: 100%;
    height: 100%;
    border-radius: 8px;
    object-fit: cover;
    background: #f2eee8;
  }
  .pa-editorial-kicker {
    color: var(--pa-muted);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1;
    margin: 7px 0 7px;
    text-transform: uppercase;
  }
  .pa-editorial-title {
    color: var(--pa-ink);
    font-size: 22px;
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.16;
    margin: 0;
  }
  .pa-editorial-meta {
    color: var(--pa-muted);
    font-size: 13px;
    line-height: 1.45;
    margin-top: 5px;
  }
  .pa-editorial-verdict {
    align-items: center;
    display: inline-flex;
    gap: 6px;
    margin-top: 12px;
    border: 1px solid rgba(124, 45, 62, 0.18);
    border-radius: 999px;
    background: rgba(124, 45, 62, 0.06);
    color: var(--pa-style);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.07em;
    line-height: 1;
    padding: 7px 10px;
    text-transform: uppercase;
  }
  .pa-editorial-verdict::before {
    content: "";
    width: 5px;
    height: 5px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.55;
  }
  .pa-editorial-headline {
    color: var(--pa-ink-soft);
    font-size: 15px;
    line-height: 1.45;
    margin: 12px 0 0;
    max-width: 52ch;
  }
  .pa-editorial-section {
    padding-top: 16px;
  }
  .pa-editorial-label-row {
    align-items: baseline;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .pa-editorial-label {
    color: var(--pa-muted);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .pa-editorial-source {
    color: var(--pa-muted);
    font-size: 11px;
  }
  .pa-take-copy {
    color: var(--pa-ink-soft);
    font-size: 14px;
    line-height: 1.55;
    margin: 0;
    max-width: 68ch;
  }
  .pa-editorial-closet {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 9px;
  }
  .pa-editorial-closet-card {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--pa-border);
    border-radius: 8px;
    background: #fff;
  }
  .pa-editorial-closet-image {
    background: #eee9e1;
    height: 132px;
    overflow: hidden;
  }
  .pa-editorial-closet-image img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
  .pa-editorial-closet-fallback {
    align-items: center;
    color: var(--pa-muted);
    display: flex;
    font-size: 12px;
    font-weight: 650;
    height: 100%;
    justify-content: center;
    padding: 10px;
    text-align: center;
  }
  .pa-editorial-closet-body { padding: 10px 10px 11px; }
  .pa-editorial-closet-name {
    color: var(--pa-ink);
    font-size: 13px;
    font-weight: 650;
    line-height: 1.25;
    margin-bottom: 5px;
  }
  .pa-editorial-closet-badge {
    color: var(--pa-style);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1.2;
    margin-bottom: 5px;
    text-transform: uppercase;
  }
  .pa-editorial-closet-note {
    color: var(--pa-muted);
    display: -webkit-box;
    font-size: 11px;
    line-height: 1.35;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .pa-editorial-insights {
    border-top: 1px solid var(--pa-border);
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 16px;
    padding-top: 14px;
  }
  .pa-editorial-insight-title {
    color: var(--pa-muted);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin-bottom: 6px;
    text-transform: uppercase;
  }
  .pa-editorial-insight-copy {
    color: var(--pa-ink-soft);
    font-size: 13px;
    line-height: 1.45;
  }
  .pa-editorial-photo-read {
    background: var(--pa-surface-alt);
    border: 1px solid var(--pa-border);
    border-radius: 10px;
    color: var(--pa-ink-soft);
    font-size: 13px;
    line-height: 1.45;
    margin-top: 14px;
    padding: 11px 13px;
  }
  .pa-editorial-photo-read[data-tone="warn"] {
    background: var(--pa-warn-bg);
    border-color: rgba(217, 119, 6, 0.22);
    color: var(--pa-warn-ink);
  }
  .pa-editorial-photo-read strong {
    color: var(--pa-ink);
    display: block;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin-bottom: 5px;
    text-transform: uppercase;
  }
  .pa-editorial-decision {
    background: var(--pa-surface-alt);
    border-radius: 9px;
    color: var(--pa-ink-soft);
    font-size: 12px;
    line-height: 1.45;
    margin-top: 14px;
    padding: 11px 13px;
  }
  .pa-editorial-decision-row + .pa-editorial-decision-row { margin-top: 4px; }
  .pa-editorial-decision strong {
    color: var(--pa-ink);
    font-weight: 750;
  }
  .pa-editorial-change-mind {
    border-top: 1px solid rgba(17, 24, 39, 0.08);
    margin-top: 10px;
    padding-top: 10px;
  }
  .pa-editorial-change-mind p {
    margin: 0;
  }
  .pa-editorial-change-mind p + p {
    margin-top: 6px;
  }
  .pa-editorial-footer {
    align-items: center;
    border-top: 1px solid var(--pa-border);
    display: flex;
    gap: 12px;
    justify-content: space-between;
    margin-top: 16px;
    padding-top: 13px;
  }
  .pa-editorial-context {
    color: var(--pa-muted);
    font-size: 11px;
    line-height: 1.4;
  }
  @media (max-width: 620px) {
    .pa-editorial-head { grid-template-columns: 92px minmax(0, 1fr); gap: 13px; }
    .pa-editorial .pa-thumb { width: 92px; height: 116px; }
    .pa-editorial-title { font-size: 19px; }
    .pa-editorial-closet { grid-template-columns: 1fr; }
    .pa-editorial-insights { grid-template-columns: 1fr; }
    .pa-editorial-footer { align-items: stretch; flex-direction: column; }
    .pa-head { grid-template-columns: 1fr; }
    .pa-thumb { max-width: 140px; }
    .pa-verdict { grid-template-columns: auto 1fr; }
    .pa-verdict-meta { grid-column: 1 / -1; text-align: left; padding-top: 4px; border-top: 1px solid var(--pa-border); }
    .pa-overlap-row, .pa-finding { grid-template-columns: 1fr; }
    .pa-finding-metric { text-align: left; display: flex; gap: 10px; align-items: baseline; }
  }
</style>
<script>
  (function () {
    var root = document.getElementById('purchase-analysis-root');
    var hydrationTimer = null;
    var hydrationAttempts = 0;
    var MAX_HYDRATION_ATTEMPTS = 20;
    var pendingActionId = null;
    var successMessage = '';
    var errorMessage = '';
    var completedActionIds = {};
    var bridgeRpcId = 0;
    var bridgeReady = null;
    var bridgePending = Object.create(null);
    var bridgeInitialized = false;
    var hostHydratedViewModel = null;
    var localWidgetState = null;

    function getOpenAI() {
      if (!window.openai) {
        window.openai = {};
      }
      return window.openai;
    }
    function getSummary() {
      return getOpenAI().toolOutput || getOpenAI().structuredContent || null;
    }
    function getMetadata() { return getOpenAI().toolResponseMetadata || null; }
    function notifyHeight() {
      var height = document.body.scrollHeight;
      getOpenAI().notifyIntrinsicHeight && getOpenAI().notifyIntrinsicHeight(height);
      if (bridgeInitialized) {
        bridgeNotify('ui/notifications/size-changed', {
          height: height,
          width: document.documentElement.scrollWidth || document.body.scrollWidth || 0,
        });
      }
    }
    function escapeHtml(value) {
      return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function displayLabel(value) {
      return String(value == null ? '' : value)
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, function (letter) { return letter.toUpperCase(); });
    }
    function toArray(value) { return Array.isArray(value) ? value : []; }
    function getBridgeTarget() {
      if (window.parent && window.parent !== window) return window.parent;
      try {
        if (window.top && window.top !== window) return window.top;
      } catch (error) {}
      return null;
    }

    function isBridgeSource(source) {
      return source === getBridgeTarget();
    }

    window.addEventListener('message', function (event) {
      if (!isBridgeSource(event.source)) return;
      var message = event.data;
      if (!message || message.jsonrpc !== '2.0') return;
      if (message.method === 'ui/initialize' && message.id != null) {
        if (message.params) hydrateFromCandidate(message.params);
        bridgeInitialized = true;
        event.source.postMessage({
          jsonrpc: '2.0',
          id: message.id,
          result: { appCapabilities: {}, protocolVersion: '2026-01-26' },
        }, '*');
        bridgeNotify('ui/notifications/initialized', {});
        render();
        return;
      }
      if (
        message.method === 'ui/notifications/tool-result'
        || message.method === 'ui/notifications/tool-input'
        || message.method === 'ui/notifications/tool-input-partial'
      ) {
        if (hydrateFromCandidate(message)) render();
        return;
      }
      if (typeof message.id !== 'number') return;
      var pending = bridgePending[message.id];
      if (!pending) return;
      delete bridgePending[message.id];
      window.clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(message.error);
        return;
      }
      pending.resolve(message.result);
    }, { passive: true });

    function bridgeRequest(method, params, timeoutMs) {
      return new Promise(function (resolve, reject) {
        var target = getBridgeTarget();
        if (!target) {
          reject(new Error('MCP Apps bridge is not available.'));
          return;
        }
        var id = ++bridgeRpcId;
        bridgePending[id] = {
          resolve: resolve,
          reject: reject,
          timer: window.setTimeout(function () {
            delete bridgePending[id];
            reject(new Error('MCP Apps bridge request timed out.'));
          }, timeoutMs || 12000),
        };
        var message = { jsonrpc: '2.0', id: id, method: method, params: params };
        target.postMessage(message, '*');
      });
    }

    function bridgeNotify(method, params) {
      if (method !== 'ui/notifications/initialized' && !bridgeInitialized) return;
      var target = getBridgeTarget();
      if (!target) return;
      target.postMessage({ jsonrpc: '2.0', method: method, params: params || {} }, '*');
    }

    function callToolViaBridge(name, args) {
      return bridgeRequest('tools/call', { name: name, arguments: args || {} }, 20000);
    }

    function getCallTool() {
      var openai = getOpenAI();
      var compatibilityCall = typeof openai.callTool === 'function' ? openai.callTool.bind(openai) : null;
      return compatibilityCall || (getBridgeTarget() ? callToolViaBridge : null);
    }
    function normalize(value) {
      if (!value || typeof value !== 'object') return null;
      if (!value.item && !value.verdict) return null;
      var item = value.item || {};
      return {
        actions: toArray(value.actions).map(function (a) { return { id: a.id, label: a.label, variant: a.variant || 'primary' }; }),
        alternatives: toArray(value.alternatives),
        analysisSummary: typeof value.analysisSummary === 'string' ? value.analysisSummary : '',
        confidence: typeof value.confidence === 'string' ? value.confidence : 'medium',
        confidenceLabel: typeof value.confidenceLabel === 'string' ? value.confidenceLabel : 'Confidence · Medium',
        confidencePercent: typeof value.confidencePercent === 'number' ? value.confidencePercent : null,
        context: value.context && typeof value.context === 'object' ? value.context : {
          calibrationLabel: null, calibrationNotes: [], closetEvidenceBasis: 'no_closet',
          closetItemsChecked: null, totalActiveEvidenceItems: null, wearHistoryMonths: null, similarItemsOwned: null,
        },
        findings: toArray(value.findings),
        overlap: toArray(value.overlap),
        gaps: toArray(value.gaps),
        judgmentSource: typeof value.judgmentSource === 'string' ? value.judgmentSource : 'computed_fallback',
        reasons: toArray(value.reasons).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
        shoppingAnswer: normalizeShoppingAnswer(value.shoppingAnswer),
        stylistJudgment: normalizeStylistJudgment(value.stylistJudgment),
        visualGrounding: normalizeVisualGrounding(value.visualGrounding),
        generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : null,
        id: typeof value.id === 'string' ? value.id : '',
        item: {
          brand: typeof item.brand === 'string' ? item.brand : null,
          category: typeof item.category === 'string' ? item.category : null,
          colorway: typeof item.colorway === 'string' ? item.colorway : null,
          descriptor: typeof item.descriptor === 'string' ? item.descriptor : null,
          imageAlt: typeof item.imageAlt === 'string' ? item.imageAlt : null,
          imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : null,
          name: typeof item.name === 'string' ? item.name : '',
          priceCad: typeof item.priceCad === 'number' ? item.priceCad : null,
          priceDisplay: typeof item.priceDisplay === 'string' ? item.priceDisplay : null,
          productUrl: typeof item.productUrl === 'string' ? item.productUrl : null,
          subcategory: typeof item.subcategory === 'string' ? item.subcategory : null,
        },
        verdict: typeof value.verdict === 'string' ? value.verdict : 'consider',
        verdictEmphasis: typeof value.verdictEmphasis === 'string' ? value.verdictEmphasis : null,
        verdictHeadline: typeof value.verdictHeadline === 'string' ? value.verdictHeadline : 'Consider',
      };
    }
    function normalizeStylistJudgment(value) {
      if (!value || typeof value !== 'object') return null;
      if (typeof value.verdict !== 'string') return null;
      return {
        caveats: toArray(value.caveats).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
        decisionBasis: typeof value.decisionBasis === 'string' ? value.decisionBasis : null,
        headline: typeof value.headline === 'string' ? value.headline : null,
        pairingOpportunities: toArray(value.pairingOpportunities).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
        rationale: typeof value.rationale === 'string' ? value.rationale : null,
        referencedComparatorIds: toArray(value.referencedComparatorIds).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
        verdict: value.verdict,
        wardrobeImpact: typeof value.wardrobeImpact === 'string' ? value.wardrobeImpact : null,
        whatItAdds: typeof value.whatItAdds === 'string' ? value.whatItAdds : null,
        whereItOverlaps: typeof value.whereItOverlaps === 'string' ? value.whereItOverlaps : null,
      };
    }
    function normalizeShoppingAnswer(value) {
      if (!value || typeof value !== 'object') {
        return {
          closestComparators: [],
          evidence: { used: [], missing: [] },
          verdictReason: '',
          whatWouldChangeVerdict: [],
        };
      }
      return {
        closestComparators: toArray(value.closestComparators).map(normalizeComparator).filter(Boolean),
        evidence: value.evidence && typeof value.evidence === 'object'
          ? {
              used: toArray(value.evidence.used).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
              missing: toArray(value.evidence.missing).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
            }
          : { used: [], missing: [] },
        verdictReason: typeof value.verdictReason === 'string' ? value.verdictReason : '',
        whatWouldChangeVerdict: toArray(value.whatWouldChangeVerdict).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
      };
    }
    function normalizeComparator(value) {
      if (!value || typeof value !== 'object') return null;
      return {
        brand: typeof value.brand === 'string' ? value.brand : null,
        category: typeof value.category === 'string' ? value.category : null,
        colorFamily: typeof value.colorFamily === 'string' ? value.colorFamily : null,
        descriptor: typeof value.descriptor === 'string' ? value.descriptor : null,
        hasImage: Boolean(value.hasImage),
        imageAlt: typeof value.imageAlt === 'string' ? value.imageAlt : null,
        imageUrl: typeof value.imageUrl === 'string' ? value.imageUrl : null,
        canonicalItemId: typeof value.canonicalItemId === 'string' ? value.canonicalItemId : null,
        itemId: typeof value.itemId === 'string' ? value.itemId : '',
        name: typeof value.name === 'string' ? value.name : 'Saved closet item',
        overlapScore: typeof value.overlapScore === 'number' ? value.overlapScore : 0,
        reasons: toArray(value.reasons).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
        relation: typeof value.relation === 'string' ? value.relation : '',
        relationLabel: typeof value.relationLabel === 'string' ? value.relationLabel : 'Closest match',
        comparatorRole: typeof value.comparatorRole === 'string' ? value.comparatorRole : 'direct_comparator',
        roleLabel: typeof value.roleLabel === 'string' ? value.roleLabel : 'Your closet',
        summary: typeof value.summary === 'string' ? value.summary : '',
        subcategory: typeof value.subcategory === 'string' ? value.subcategory : null,
      };
    }
    function normalizeVisualGrounding(value) {
      if (!value || typeof value !== 'object') return null;
      return {
        candidateImageCount: typeof value.candidateImageCount === 'number' ? value.candidateImageCount : 0,
        candidateVisualGrounding: typeof value.candidateVisualGrounding === 'string' ? value.candidateVisualGrounding : 'none',
        label: typeof value.label === 'string' ? value.label : 'Visual evidence',
        note: typeof value.note === 'string' ? value.note : '',
        tone: value.tone === 'warn' ? 'warn' : 'neutral',
      };
    }
    function extract(candidate) {
      if (!candidate || typeof candidate !== 'object') return null;
      if (candidate.purchaseAnalysis) {
        var direct = normalize(candidate.purchaseAnalysis);
        if (direct) return direct;
      }
      if (candidate.experience === 'purchase_analysis_widget') {
        var nested = normalize(candidate);
        if (nested) return nested;
      }
      var keys = ['structuredContent', 'output', 'result', 'data', 'value', 'params'];
      for (var i = 0; i < keys.length; i += 1) {
        if (candidate[keys[i]]) {
          var sub = extract(candidate[keys[i]]);
          if (sub) return sub;
        }
      }
      return null;
    }
    function extractMetadata(candidate) {
      if (!candidate || typeof candidate !== 'object') return null;
      if (candidate._meta && typeof candidate._meta === 'object') return candidate._meta;
      if (candidate.toolResponseMetadata && typeof candidate.toolResponseMetadata === 'object') return candidate.toolResponseMetadata;
      var keys = ['result', 'structuredContent', 'output', 'data', 'value', 'params'];
      for (var i = 0; i < keys.length; i += 1) {
        if (candidate[keys[i]]) {
          var sub = extractMetadata(candidate[keys[i]]);
          if (sub) return sub;
        }
      }
      return null;
    }
    function hydrateFromCandidate(candidate) {
      var next = extract(candidate);
      if (!next) return false;
      hostHydratedViewModel = next;
      var openai = getOpenAI();
      if (openai && typeof openai === 'object') {
        var metadata = extractMetadata(candidate);
        openai.toolResponseMetadata = metadata ? Object.assign({}, metadata, { purchaseAnalysis: next }) : { purchaseAnalysis: next };
        openai.toolOutput = { purchaseAnalysis: next };
      }
      return true;
    }
    function getViewModel() {
      var openai = getOpenAI();
      return extract(getMetadata())
        || extract(getSummary())
        || extract(openai.toolOutput)
        || extract(openai.structuredContent)
        || extract(openai.params)
        || extract(openai.requestParams)
        || extract(openai.modalParams)
        || hostHydratedViewModel;
    }
    function setWidgetState(next) {
      var openai = getOpenAI();
      if (openai && typeof openai.setWidgetState === 'function') {
        openai.setWidgetState(next);
      } else {
        localWidgetState = next;
      }
    }
    function getActionInvocations() {
      var metadata = getMetadata();
      if (!metadata || typeof metadata !== 'object') return [];
      return toArray(metadata.actionInvocations);
    }
    function scheduleHydrationCheck() {
      if (hydrationTimer || hydrationAttempts >= MAX_HYDRATION_ATTEMPTS) return;
      hydrationTimer = window.setTimeout(function () {
        hydrationTimer = null;
        hydrationAttempts += 1;
        render();
      }, hydrationAttempts < 4 ? 140 : 280);
    }
    function renderThumb(item) {
      if (item.imageUrl) return '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.imageAlt || item.name) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.setAttribute(\\'data-image-error\\',\\'true\\'); this.remove();" />';
      return '<svg class="pa-thumb-glyph" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>';
    }
    function renderCompareThumb(imageUrl, alt, fallback) {
      if (imageUrl) return '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(alt || '') + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.setAttribute(\\'data-image-error\\',\\'true\\'); this.remove();" />';
      return '<div class="pa-compare-glyph">' + escapeHtml(fallback || 'No image') + '</div>';
    }
    function renderVerdictGlyph(verdict) {
      if (verdict === 'recommend') return '↑';
      if (verdict === 'skip') return '↓';
      if (verdict === 'consider') return '?';
      return '…';
    }
    function renderVerdictLabel(verdict) {
      if (verdict === 'recommend') return 'Buy';
      if (verdict === 'skip') return 'Skip';
      if (verdict === 'consider') return 'Lean skip';
      return 'Wait';
    }
    function renderVisualGrounding(grounding) {
      if (!grounding || !grounding.note) return '';
      return '<section class="pa-grounding" data-tone="' + escapeHtml(grounding.tone || 'neutral') + '"><div class="pa-grounding-icon">!</div><div><div class="pa-grounding-title">' + escapeHtml(grounding.label || 'Visual evidence') + '</div><div class="pa-grounding-note">' + escapeHtml(grounding.note) + '</div></div></section>';
    }
    function renderStylistRead(vm) {
      var read = (vm.shoppingAnswer && vm.shoppingAnswer.verdictReason) || vm.analysisSummary || vm.verdictHeadline;
      if (!read) return '';
      return '<section class="pa-stylist-read"><div class="pa-stylist-kicker">Stylist&#39;s read</div><p class="pa-stylist-copy">' + escapeHtml(read) + '</p></section>';
    }
    function renderComparisonStrip(vm) {
      var comparators = vm.shoppingAnswer ? toArray(vm.shoppingAnswer.closestComparators).slice(0, 3) : [];
      if (!comparators.length) return '';
      var cards = [];
      comparators.forEach(function (item) {
        var meta = [item.relationLabel, item.colorFamily, item.descriptor].filter(Boolean).slice(0, 3);
        cards.push('<article class="pa-compare-card"><div class="pa-compare-thumb">' + renderCompareThumb(item.imageUrl, item.imageAlt || item.name, item.hasImage ? 'Photo on file' : 'No photo yet') + '</div><div class="pa-compare-label">' + escapeHtml(item.roleLabel || 'Your closet') + '</div><div class="pa-compare-name">' + escapeHtml(item.name) + '</div><div class="pa-compare-meta">' + meta.map(function (entry) { return '<span class="pa-chip">' + escapeHtml(displayLabel(entry)) + '</span>'; }).join('') + '</div>' + renderCompareScore(item) + '</article>');
      });
      return '<section class="pa-section"><h3 class="pa-section-title">Closest closet comparison</h3><div class="pa-compare-grid">' + cards.join('') + '</div></section>';
    }
    function renderCompareScore(item) {
      if (!item || typeof item.overlapScore !== 'number') return '';
      var rawScore = item.overlapScore <= 1 ? item.overlapScore * 100 : item.overlapScore;
      var pct = Math.max(0, Math.min(100, Math.round(rawScore)));
      return '<div class="pa-compare-score"><div class="pa-compare-score-head"><span class="pa-compare-score-label">How close</span><span class="pa-compare-score-value">' + pct + '%</span></div><div class="pa-compare-score-bar"><div class="pa-compare-score-fill" style="width:' + pct + '%"></div></div></div>';
    }
    function renderReasons(reasons, verdict) {
      if (!reasons.length) return '';
      var rows = reasons.map(function (r, i) {
        return '<div class="pa-reason"><span class="pa-reason-num">' + (i + 1) + '.</span><span>' + escapeHtml(r) + '</span></div>';
      }).join('');
      return '<section class="pa-section"><h3 class="pa-section-title">' + escapeHtml(reasonSectionTitle(verdict)) + '</h3>' + rows + '</section>';
    }
    function reasonSectionTitle(verdict) {
      if (verdict === 'recommend') return 'Why I’d buy it';
      if (verdict === 'skip') return 'Why I’d skip it';
      if (verdict === 'wait') return 'Why I’d wait';
      return 'Why I’m not fully sold';
    }
    function renderFindings(findings) {
      if (!findings.length) return '';
      var rows = findings.map(function (f) {
        var metric = (f.metricValue || f.metricLabel)
          ? '<div class="pa-finding-metric">' + (f.metricValue ? '<div class="pa-finding-metric-num">' + escapeHtml(f.metricValue) + '</div>' : '') + (f.metricLabel ? '<div class="pa-finding-metric-label">' + escapeHtml(f.metricLabel) + '</div>' : '') + '</div>'
          : '';
        return '<div class="pa-finding" data-tone="' + escapeHtml(f.tone || 'neutral') + '"><div class="pa-finding-tag">' + escapeHtml(f.tag || 'Detail') + '</div><div><div class="pa-finding-body">' + escapeHtml(f.body || '') + '</div>' + (f.bodySecondary ? '<div class="pa-finding-body-secondary">' + escapeHtml(f.bodySecondary) + '</div>' : '') + '</div>' + metric + '</div>';
      }).join('');
      return '<section class="pa-section"><h3 class="pa-section-title">What I am weighing</h3><div class="pa-findings">' + rows + '</div></section>';
    }
    function renderGaps(gaps) {
      if (!gaps.length) return '';
      var rows = gaps.map(function (g) {
        return '<div class="pa-gap-row"><span class="pa-gap-pill" data-need="' + escapeHtml(g.need) + '">' + escapeHtml(g.need) + '</span><div><span class="pa-gap-lane">' + escapeHtml(g.lane) + '</span>' + (g.note ? '<span class="pa-gap-note">' + escapeHtml(g.note) + '</span>' : '') + '</div></div>';
      }).join('');
      return '<div class="pa-gap-block"><h3 class="pa-gap-title">What would make this a stronger buy</h3>' + rows + '</div>';
    }
    function renderContext(context) {
      var parts = [];
      if (context.calibrationLabel) parts.push(context.calibrationLabel);
      if (typeof context.closetItemsChecked === 'number' && typeof context.totalActiveEvidenceItems === 'number') {
        parts.push(context.closetItemsChecked + ' relevant pieces checked from ' + context.totalActiveEvidenceItems + ' active evidence items');
      } else if (typeof context.closetItemsChecked === 'number') parts.push(context.closetItemsChecked + ' closet items checked');
      if (typeof context.similarItemsOwned === 'number') parts.push(context.similarItemsOwned + ' similar owned');
      if (!parts.length) return '';
      return '<div class="pa-context">' + parts.map(function (p) { return '<span>' + escapeHtml(p) + '</span>'; }).join('') + '</div>';
    }
    function renderActions(actions) {
      if (!actions.length) return '';
      var btns = actions.slice(0, 1).map(function (a) {
        var variant = a.variant || 'primary';
        var disabled = pendingActionId || completedActionIds[a.id] ? 'disabled' : '';
        var label = completedActionIds[a.id] ? 'Added' : (a.id === pendingActionId ? 'Saving...' : a.label);
        var busy = a.id === pendingActionId ? ' aria-busy="true"' : '';
        return '<button class="pa-btn" data-variant="' + variant + '" data-action="' + escapeHtml(a.id) + '" ' + disabled + busy + '>' + escapeHtml(label) + '</button>';
      }).join('');
      return '<div class="pa-footer">' + btns + '</div>';
    }
    function productMeta(item) {
      var parts = [];
      if (item.descriptor) parts.push(item.descriptor);
      if (item.priceDisplay) parts.push(item.priceDisplay);
      return parts.join(' · ');
    }
    function getJudgment(vm) {
      return vm && vm.stylistJudgment ? vm.stylistJudgment : null;
    }
    function judgmentVerdictLabel(verdict) {
      if (verdict === 'buy') return 'Buy';
      if (verdict === 'skip') return 'Skip';
      if (verdict === 'consider') return 'Lean skip';
      return 'Wait';
    }
    function isTeeText(value) {
      return /\\b(tee|t-shirt|shirt)\\b/i.test(String(value || ''));
    }
    function isJerseyText(value) {
      return /\\b(jersey|basketball jersey|nba jersey|hardwood classics)\\b/i.test(String(value || ''));
    }
    function isTeePurchase(vm) {
      return isTeeText(vm.item.name) || isTeeText(vm.item.descriptor) || isTeeText(vm.item.subcategory);
    }
    function getComparators(vm) {
      if (!vm.shoppingAnswer) return [];
      var candidateCategory = String(vm.item.category || '').toUpperCase();
      var candidateSubcategory = String(vm.item.subcategory || '').toUpperCase();
      var candidateIsTee = isTeePurchase(vm);
      var candidateIsJersey = isJerseyText(vm.item.name) || isJerseyText(vm.item.descriptor) || isJerseyText(vm.item.subcategory);
      var comparators = toArray(vm.shoppingAnswer.closestComparators);
      var judgment = getJudgment(vm);
      var referenced = judgment ? toArray(judgment.referencedComparatorIds) : [];
      if (referenced.length) {
        var referencedSet = {};
        referenced.forEach(function (id) { referencedSet[String(id)] = true; });
        var referencedComparators = comparators.filter(function (item) {
          return referencedSet[String(item.canonicalItemId || item.itemId)];
        });
        if (referencedComparators.length) comparators = referencedComparators;
      }
      var sameRole = comparators.filter(function (item) {
        var itemCategory = String(item.category || '').toUpperCase();
        var itemSubcategory = String(item.subcategory || '').toUpperCase();
        if (candidateCategory && itemCategory && candidateCategory !== itemCategory) return false;
        var itemIsJersey = isJerseyText(item.name) || isJerseyText(item.descriptor) || isJerseyText(item.subcategory);
        if (candidateIsTee && itemIsJersey) return false;
        if (candidateIsJersey && !itemIsJersey) return false;
        if (candidateIsTee) {
          return isTeeText(item.name) || isTeeText(item.descriptor) || isTeeText(item.subcategory);
        }
        if (candidateSubcategory && itemSubcategory && candidateSubcategory !== itemSubcategory) {
          return false;
        }
        return true;
      });
      if (candidateIsTee || candidateIsJersey) {
        return sameRole.slice(0, 3);
      }
      return (sameRole.length ? sameRole : comparators).slice(0, 3);
    }
    function editorialComparatorBadge(item) {
      var relation = String(item.relationLabel || '').toLowerCase();
      if (/very close|duplicate/.test(relation)) return 'Already close';
      if (/replacement/.test(relation)) return 'Could replace';
      if (/upgrade/.test(relation)) return 'Upgrade candidate';
      if (/different/.test(relation)) return 'Useful contrast';
      if (isJerseyText(item.name) || isJerseyText(item.descriptor) || isJerseyText(item.subcategory)) return 'Style context';
      if (isTeeText(item.name) || isTeeText(item.descriptor) || isTeeText(item.subcategory)) return 'Tee comparison';
      return 'Useful reference';
    }
    function editorialComparatorNote(item) {
      var name = String(item.name || '').toLowerCase();
      if (isJerseyText(item.name) || isJerseyText(item.descriptor) || isJerseyText(item.subcategory)) {
        return 'Sportswear context, not a true substitute for this tee.';
      }
      if (isTeeText(item.name) || isTeeText(item.descriptor) || isTeeText(item.subcategory)) {
        if (/pocket/.test(name)) return 'Another casual tee, but the chest pocket changes the feel.';
        if (/navy|slub/.test(name)) return 'Another easy tee, with a softer color and more visible texture.';
        if (/black|crewneck/.test(name)) return 'The closest basic tee; the question is whether the new fabric feels more structured.';
        return 'Useful as a fit and fabric comparison, not a separate reason to buy.';
      }
      return item.summary || (toArray(item.reasons)[0]) || 'A remembered closet item that helps ground the recommendation.';
    }
    function renderEditorialCloset(vm) {
      var comparators = getComparators(vm);
      if (!comparators.length) return '';
      var cards = comparators.map(function (item) {
        var image = item.imageUrl
          ? '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.imageAlt || item.name) + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML=\\'<div class=&quot;pa-editorial-closet-fallback&quot;>Photo unavailable</div>\\';" />'
          : '<div class="pa-editorial-closet-fallback">' + escapeHtml(item.hasImage ? 'Photo on file' : 'No photo yet') + '</div>';
        return '<article class="pa-editorial-closet-card"><div class="pa-editorial-closet-image">' + image + '</div><div class="pa-editorial-closet-body"><div class="pa-editorial-closet-name">' + escapeHtml(item.name) + '</div><div class="pa-editorial-closet-badge">' + escapeHtml(editorialComparatorBadge(item)) + '</div><div class="pa-editorial-closet-note">' + escapeHtml(editorialComparatorNote(item)) + '</div></div></article>';
      }).join('');
      return '<section class="pa-editorial-section"><div class="pa-editorial-label-row"><div class="pa-editorial-label">Closet proof</div><div class="pa-editorial-source">From your closet</div></div><div class="pa-editorial-closet">' + cards + '</div></section>';
    }
    function buildEditorialTake(vm) {
      var judgment = getJudgment(vm);
      if (judgment && judgment.rationale) return judgment.rationale;
      if (judgment && judgment.headline) return judgment.headline;
      var comparators = getComparators(vm);
      if (isTeePurchase(vm) && comparators.length) {
        var names = comparators.slice(0, 3).map(function (item) { return item.name; });
        return 'Your closest tee comparisons are ' + names.join(names.length > 2 ? ', ' : ' and ').replace(/, ([^,]*)$/, ', and $1') + '. I would judge this on whether the color, fabric, and fit add real use beyond those tees.';
      }
      if (vm.verdict === 'skip' && comparators.length) {
        var first = comparators[0];
        return 'Your closest match is ' + first.name + '. I would skip this unless it clearly replaces that pair or solves a fit problem.';
      }
      var read = (vm.shoppingAnswer && vm.shoppingAnswer.verdictReason) || vm.analysisSummary || vm.verdictHeadline;
      var reason = vm.reasons[0] || '';
      if (read && reason && read !== reason) return read + ' ' + reason;
      return read || reason || 'Fluent is weighing the product against your saved closet context.';
    }
    function buildWhatAdds(vm) {
      var judgment = getJudgment(vm);
      if (judgment && judgment.whatItAdds) return judgment.whatItAdds;
      if (isTeePurchase(vm)) return vm.verdict === 'skip' ? 'Not enough new utility beyond tees you already own.' : 'Potentially a different color or fabric note in your tee rotation.';
      if (vm.gaps.length && vm.gaps[0].note) return vm.gaps[0].note;
      if (vm.verdict === 'recommend') return vm.verdictHeadline;
      if (vm.verdict === 'skip') return 'Not much beyond another version of something you already own.';
      if (vm.verdict === 'wait') return 'The potential is there, but the visual and closet evidence are not strong enough yet.';
      return 'A slightly different take on a job your closet already covers.';
    }
    function buildWhereOverlaps(vm) {
      var judgment = getJudgment(vm);
      if (judgment && judgment.whereItOverlaps) return judgment.whereItOverlaps;
      var comparators = getComparators(vm);
      if (comparators.length) {
        if (isTeePurchase(vm)) {
          return 'Closest tee comparison: ' + comparators[0].name + '. This is the closet overlap I would actually weigh.';
        }
        var first = comparators[0];
        return 'Closest match: ' + first.name + '. Treat the other photos as supporting evidence, not separate reasons to buy.';
      }
      if (isTeePurchase(vm)) return 'I do not see a clean tee duplicate in the visible closet evidence.';
      return vm.analysisSummary || 'No close closet overlap was strong enough to anchor this decision.';
    }
    function renderEditorialPhotoRead(vm) {
      if (!vm.visualGrounding) return '';
      var pieces = [vm.visualGrounding.note];
      var comparatorCount = getComparators(vm).filter(function (item) { return item.hasImage; }).length;
      if (vm.visualGrounding.candidateVisualGrounding === 'host_visual_inspection') {
        pieces.push(comparatorCount > 0 ? comparatorCount + ' closet photo' + (comparatorCount === 1 ? ' was' : 's were') + ' available for comparison.' : 'No closet comparison photo was available, so this leans more on saved item detail.');
      }
      return '<section class="pa-editorial-photo-read" data-tone="' + escapeHtml(vm.visualGrounding.tone || 'neutral') + '"><strong>' + escapeHtml(vm.visualGrounding.label || 'Photo read') + '</strong>' + escapeHtml(pieces.filter(Boolean).join(' ')) + '</section>';
    }
    function renderEditorialWhy(vm) {
      var judgment = getJudgment(vm);
      var rows = judgment
        ? [judgment.headline, judgment.rationale].concat(toArray(judgment.pairingOpportunities)).filter(Boolean)
        : toArray(vm.reasons);
      rows = rows.filter(function (entry, index, arr) {
        return entry && arr.indexOf(entry) === index;
      }).slice(0, 3);
      if (!rows.length) return '';
      return '<section class="pa-editorial-section"><div class="pa-editorial-label">Why</div><div class="pa-editorial-why">' + rows.map(function (entry) { return '<p class="pa-take-copy">' + escapeHtml(entry) + '</p>'; }).join('') + '</div></section>';
    }
    function buildDecisionCall(vm) {
      var judgment = getJudgment(vm);
      if (judgment) {
        var label = judgmentVerdictLabel(judgment.verdict);
        var detail = judgment.rationale || judgment.headline || 'The stylist call is based on the inspected product image and closet proof above.';
        return [label === 'Buy' ? 'Buy it' : label === 'Skip' ? 'Skip it' : label, detail];
      }
      var changer = vm.shoppingAnswer ? toArray(vm.shoppingAnswer.whatWouldChangeVerdict)[0] : null;
      if (vm.verdict === 'recommend') {
        return ['Buy it', 'This adds enough utility or coverage to earn a place in the closet.'];
      }
      if (vm.verdict === 'skip') {
        return ['Skip it', changer || 'The closet case is not strong enough to justify adding this right now.'];
      }
      if (vm.verdict === 'wait') {
        return ['Wait', changer || 'The evidence is not strong enough for a confident stylist call yet.'];
      }
      return ['Lean skip', changer || 'It is attractive, but the closet utility is not clear enough to make it a priority buy.'];
    }
    function renderEditorialDecision(vm) {
      var call = buildDecisionCall(vm);
      var judgment = getJudgment(vm);
      var caveats = judgment ? toArray(judgment.caveats).filter(Boolean).slice(0, 2) : [];
      var caveatHtml = caveats.length
        ? '<div class="pa-editorial-change-mind"><div class="pa-editorial-insight-title">What would change this</div>' + caveats.map(function (entry) { return '<p class="pa-editorial-insight-copy">' + escapeHtml(entry) + '</p>'; }).join('') + '</div>'
        : '';
      return '<div class="pa-editorial-decision"><div class="pa-editorial-insight-title">The decision</div><div class="pa-editorial-decision-row"><strong>' + escapeHtml(call[0]) + '</strong> — ' + escapeHtml(call[1]) + '</div>' + caveatHtml + '</div>';
    }
    function renderEditorialInsights(vm) {
      return '<section class="pa-editorial-insights"><div><div class="pa-editorial-insight-title">What it unlocks</div><div class="pa-editorial-insight-copy">' + escapeHtml(buildWhatAdds(vm)) + '</div></div><div><div class="pa-editorial-insight-title">What it competes with</div><div class="pa-editorial-insight-copy">' + escapeHtml(buildWhereOverlaps(vm)) + '</div></div></section>';
    }
    function renderEditorialContext(vm) {
      var parts = [vm.context.calibrationLabel || 'From your closet'];
      if (typeof vm.context.closetItemsChecked === 'number' && typeof vm.context.totalActiveEvidenceItems === 'number') {
        parts.push(vm.context.closetItemsChecked + ' relevant pieces checked from ' + vm.context.totalActiveEvidenceItems + ' active evidence items');
      } else if (typeof vm.context.closetItemsChecked === 'number') parts.push(vm.context.closetItemsChecked + ' items checked');
      var displayedComparators = getComparators(vm).length;
      if (displayedComparators > 0) parts.push(displayedComparators + ' closet pieces checked');
      return '<div class="pa-editorial-context">' + escapeHtml(parts.join(' · ')) + '</div>';
    }
    function renderEditorialActions(actions) {
      return actions.length ? renderActions(actions) : '';
    }
    function renderEditorialVerdictLabel(vm) {
      var judgment = getJudgment(vm);
      if (judgment) return judgmentVerdictLabel(judgment.verdict);
      if (vm.verdict === 'consider') return 'Lean skip';
      return renderVerdictLabel(vm.verdict);
    }
    async function handleAction(actionId) {
      var invocation = getActionInvocations().find(function (action) { return action.id === actionId; }) || null;
      if (!invocation) return;
      var callTool = getCallTool();
      if (!callTool) {
        errorMessage = 'This host cannot call Fluent tools from the widget yet.';
        render();
        return;
      }
      pendingActionId = actionId;
      errorMessage = '';
      successMessage = '';
      render();
      try {
        await callTool(invocation.toolName, invocation.args || {});
        pendingActionId = null;
        completedActionIds[actionId] = true;
        successMessage = 'Saved to your closet.';
        setWidgetState({
          completedActionIds: completedActionIds,
          lastActionId: actionId,
          status: 'saved',
        });
        render();
      } catch (error) {
        pendingActionId = null;
        errorMessage = (error && error.message) || 'Unable to apply that action right now.';
        render();
      }
    }
    function render() {
      if (!root) return;
      var vm = getViewModel();
      if (!vm) {
        var stillWaiting = hydrationAttempts < MAX_HYDRATION_ATTEMPTS;
        root.innerHTML = stillWaiting
          ? '<div class="pa-fallback">Preparing your purchase analysis…</div>'
          : '<div class="pa-fallback"><strong>Purchase analysis did not load.</strong><span>Ask Fluent to retry after checking the product image, or use the text recommendation in the chat.</span></div>';
        scheduleHydrationCheck();
        notifyHeight();
        return;
      }
      root.innerHTML =
        '<article class="pa-card pa-editorial"><div class="pa-card-inner">'
        + '<header class="pa-editorial-head"><div class="pa-thumb">' + renderThumb(vm.item) + '</div><div><div class="pa-editorial-kicker">Should I buy this?</div><h2 class="pa-editorial-title pa-title">' + escapeHtml(vm.item.name) + '</h2>' + (productMeta(vm.item) ? '<div class="pa-editorial-meta">' + escapeHtml(productMeta(vm.item)) + '</div>' : '') + '<div class="pa-editorial-verdict">' + escapeHtml(renderEditorialVerdictLabel(vm)) + '</div><p class="pa-editorial-headline">' + escapeHtml(vm.verdictHeadline) + '</p></div></header>'
        + '<section class="pa-editorial-section"><div class="pa-editorial-label">The call</div><p class="pa-take-copy">' + escapeHtml(buildEditorialTake(vm)) + '</p></section>'
        + renderEditorialPhotoRead(vm)
        + renderEditorialWhy(vm)
        + renderEditorialCloset(vm)
        + renderEditorialInsights(vm)
        + renderEditorialDecision(vm)
        + (errorMessage ? '<div class="pa-error" role="alert">' + escapeHtml(errorMessage) + '</div>' : '')
        + (successMessage ? '<div class="pa-success" role="status" aria-live="polite">' + escapeHtml(successMessage) + '</div>' : '')
        + '<footer class="pa-editorial-footer">' + renderEditorialContext(vm) + renderEditorialActions(vm.actions) + '</footer>'
        + '</div></article>';
      var buttons = root.querySelectorAll('[data-action]');
      for (var i = 0; i < buttons.length; i += 1) {
        (function (button) {
          button.addEventListener('click', function () {
            var actionId = button.getAttribute('data-action');
            if (actionId) handleAction(actionId);
          });
        })(buttons[i]);
      }
      notifyHeight();
    }
    window.addEventListener('openai:set_globals', function () {
      hydrateFromCandidate(getOpenAI().toolResponseMetadata) || hydrateFromCandidate(getOpenAI().toolOutput);
      render();
    });
    function connectMcpAppsHost() {
      if (bridgeReady) return bridgeReady;
      bridgeReady = bridgeRequest('ui/initialize', {
        appInfo: {
          name: 'Fluent Style Purchase Analysis',
          version: '${STYLE_PURCHASE_ANALYSIS_TEMPLATE_VERSION}',
        },
        protocolVersion: '2026-01-26',
        appCapabilities: {},
      }, 3000).then(function (result) {
        bridgeInitialized = true;
        hydrateFromCandidate(result);
        bridgeNotify('ui/notifications/initialized', {});
        notifyHeight();
        return result;
      }).catch(function () {
        return null;
      });
      return bridgeReady;
    }
    void connectMcpAppsHost();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { render(); });
    } else {
      render();
    }
  })();
</script>
`;
}

function buildPurchaseAnalysisWidgetViewModel(viewModel: PurchaseAnalysisViewModel): PurchaseAnalysisWidgetViewModel {
  return {
    actions: viewModel.actions.map((action) => ({ id: action.id, label: action.label, variant: action.variant })),
    alternatives: viewModel.alternatives,
    analysisSummary: viewModel.analysisSummary,
    confidence: viewModel.confidence,
    confidenceLabel: viewModel.confidenceLabel,
    confidencePercent: viewModel.confidencePercent,
    context: viewModel.context,
    findings: viewModel.findings,
    gaps: viewModel.gaps,
    generatedAt: viewModel.generatedAt,
    id: viewModel.id,
    item: viewModel.item,
    judgmentSource: viewModel.judgmentSource,
    overlap: viewModel.overlap,
    reasons: viewModel.reasons,
    shoppingAnswer: viewModel.shoppingAnswer,
    stylistJudgment: viewModel.stylistJudgment,
    verdict: viewModel.verdict,
    verdictEmphasis: viewModel.verdictEmphasis,
    verdictHeadline: viewModel.verdictHeadline,
    visualGrounding: viewModel.visualGrounding,
  };
}

function buildItemViewModel(
  candidate: StylePurchaseCandidate,
  imageHints?: PurchaseAnalysisImageHints,
): PurchaseAnalysisItemViewModel {
  const priceCad = candidate.estimatedPrice?.min ?? candidate.estimatedPrice?.max ?? null;
  return {
    brand: candidate.brand,
    category: candidate.category,
    colorway: candidate.colorName ?? candidate.colorFamily,
    descriptor: buildDescriptor(candidate),
    imageAlt: candidate.name ?? 'Style purchase candidate',
    imageUrl: imageHints?.candidateImageUrl ?? candidate.imageUrls[0] ?? null,
    name: candidate.name ?? titleCase(candidate.subcategory ?? candidate.category ?? 'Candidate'),
    priceCad,
    priceDisplay: formatPrice(candidate.estimatedPrice),
    productUrl: null,
  };
}

function buildVisualGroundingViewModel(analysis: StylePurchaseAnalysis): PurchaseAnalysisVisualGroundingViewModel {
  const candidateImageCount = analysis.evidenceQuality.candidateImageCount;
  if (analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection') {
    const observation = analysis.evidenceQuality.candidateVisualObservations[0];
    return {
      candidateImageCount,
      candidateVisualGrounding: 'host_visual_inspection',
      label: 'Photo read',
      note: observation ? humanizeVisualObservation(observation) : 'I looked at the product photo before making the call.',
      tone: 'neutral',
    };
  }
  if (analysis.evidenceQuality.candidateVisualGrounding === 'image_reference_only') {
    return {
      candidateImageCount,
      candidateVisualGrounding: 'image_reference_only',
      label: 'Photo still needs a look',
      note:
        'I found a product image, but it has not been visually checked yet. I would treat color, texture, and fine overlap calls as tentative.',
      tone: 'warn',
    };
  }

  return {
    candidateImageCount,
    candidateVisualGrounding: 'none',
    label: 'No photo to judge',
    note:
      'I do not have a usable product photo here, so this leans on product text and closet context rather than a true visual read.',
    tone: 'warn',
  };
}

function humanizeVisualObservation(observation: string): string {
  const color = extractObservationField(observation, 'color');
  const silhouette = extractObservationField(observation, 'silhouette');
  const material = extractObservationField(observation, 'material/texture');
  const details = extractObservationField(observation, 'details');
  const parts = ['I looked at the product photo.'];
  if (color || silhouette) {
    parts.push(`It reads as ${joinSentenceParts([color, silhouette ? `with ${silhouette}` : null])}.`);
  }
  if (material) {
    parts.push(`The material reads as ${material}.`);
  }
  if (details) {
    parts.push(`The useful details are ${details}.`);
  }
  if (parts.length === 1) {
    parts.push(cleanObservationText(observation) ?? 'I looked at the product photo before making the call.');
  }
  return parts.join(' ');
}

function extractObservationField(observation: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nextFields = 'color|silhouette|material\\/texture|details';
  const match = new RegExp(`${escaped}:\\s*([\\s\\S]*?)(?:\\.\\s*(?:${nextFields}):|$)`, 'i').exec(observation);
  return cleanObservationText(match?.[1] ?? null);
}

function cleanObservationText(value: string | null): string | null {
  const cleaned = (value ?? '')
    .replace(/^image\s+[^.]+\.\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;,\s]+$/g, '');
  return cleaned || null;
}

function joinSentenceParts(parts: Array<string | null>): string {
  const cleanParts = parts.filter((part): part is string => Boolean(part));
  if (cleanParts.length <= 1) return cleanParts[0] ?? '';
  return `${cleanParts.slice(0, -1).join(', ')} ${cleanParts[cleanParts.length - 1]}`;
}

function addVisualGroundingToHeadline(analysis: StylePurchaseAnalysis, headline: string): string {
  if (analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection') {
    return headline;
  }
  if (analysis.evidenceQuality.candidateVisualGrounding === 'image_reference_only') {
    return `Image not inspected; ${lowercaseFirst(headline)}`;
  }
  return `No product image inspected; ${lowercaseFirst(headline)}`;
}

function lowercaseFirst(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function buildDescriptor(candidate: StylePurchaseCandidate): string | null {
  const bits = [candidate.subcategory, candidate.colorName ?? candidate.colorFamily, candidate.fabricHand]
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, 3);
  return bits.length ? bits.map(titleCase).join(' · ') : null;
}

function deriveVerdict(analysis: StylePurchaseAnalysis): PurchaseVerdict {
  if (analysis.tensionSignals.hardAvoid) return 'skip';
  if (analysis.comparatorReasoning.framing === 'duplicate') return 'skip';
  if (analysis.comparatorReasoning.framing === 'replacement' || analysis.comparatorReasoning.framing === 'upgrade') {
    return analysis.confidenceNotes.length >= 3 ? 'wait' : 'consider';
  }
  if (analysis.comparatorReasoning.framing === 'addition') {
    return analysis.coverageImpact.strengthensWeakArea || Boolean(analysis.laneAssessment.introduces)
      ? 'recommend'
      : 'consider';
  }
  if (analysis.comparatorReasoning.framing === 'adjacent') return 'consider';
  if (analysis.coverageImpact.pilesIntoCoveredLane && analysis.contextBuckets.exactComparatorItems.length > 0) {
    return 'skip';
  }
  if (analysis.coverageImpact.strengthensWeakArea || Boolean(analysis.laneAssessment.introduces)) {
    return 'recommend';
  }
  if (analysis.comparatorCoverage.mode === 'sparse' || analysis.evidenceQuality.notes.length >= 2) {
    return 'wait';
  }
  return 'consider';
}

function deriveConfidencePercent(analysis: StylePurchaseAnalysis): number {
  let score = 58;
  if (analysis.candidate.imageUrls.length > 0) score += 8;
  if (analysis.comparatorCoverage.mode === 'exact_comparator') score += 14;
  else if (analysis.comparatorCoverage.mode === 'typed_role') score += 8;
  else if (analysis.comparatorCoverage.mode === 'sparse') score -= 12;
  if (analysis.evidenceQuality.typedProfileCoverage >= 0.6) score += 6;
  if (analysis.evidenceQuality.primaryPhotoCoverage < 0.35) score -= 8;
  if (analysis.confidenceNotes.length >= 3) score -= 6;
  return Math.max(28, Math.min(92, score));
}

function buildVerdictHeadline(analysis: StylePurchaseAnalysis, verdict: PurchaseVerdict): string {
  if (verdict === 'recommend') {
    if (analysis.comparatorReasoning.framing === 'addition') return analysis.comparatorReasoning.summary;
    if (analysis.coverageImpact.strengthensWeakArea) return 'This adds something your closet is lighter on.';
    if (analysis.laneAssessment.introduces) return `This opens up a useful ${formatJudgmentAreaLabel(analysis.laneAssessment.introduces)} option.`;
    return 'This looks like a real addition, not more of the same.';
  }
  if (verdict === 'skip') {
    if (analysis.comparatorReasoning.framing === 'duplicate') {
      return `You already own close versions of this kind of ${describeCandidateItemKind(analysis)}.`;
    }
    if (analysis.tensionSignals.hardAvoid) return `This runs into a hard avoid: ${analysis.tensionSignals.hardAvoid}.`;
    if (analysis.contextBuckets.exactComparatorItems.length > 0) {
      return `You already own very similar versions of this kind of ${describeCandidateItemKind(analysis)}.`;
    }
    return 'This looks too close to things you already cover well.';
  }
  if (verdict === 'wait') {
    return 'The case is plausible, but the evidence is too thin right now.';
  }
  if (analysis.comparatorReasoning.framing === 'replacement') {
    return 'This feels more like a replacement than a true addition.';
  }
  if (analysis.comparatorReasoning.framing === 'upgrade') {
    return 'This could upgrade something you already wear often.';
  }
  if (analysis.comparatorReasoning.framing === 'adjacent') {
    return `Lean skip: this feels too close to what your closet already does, and the difference is not strong enough yet.`;
  }
  return 'The case is mixed: it could work, but the overlap is real.';
}

function buildSummary(analysis: StylePurchaseAnalysis, verdict: PurchaseVerdict): string {
  const overlapNames = buildNamedOverlapList(analysis);
  if (verdict === 'recommend') {
    if (analysis.comparatorReasoning.framing === 'addition') {
      return analysis.comparatorReasoning.summary;
    }
    return 'The closet context points toward a real addition rather than another near-duplicate.';
  }
  if (verdict === 'skip') {
    if (overlapNames.length > 0) {
      return `You already own close matches like ${overlapNames.join(' and ')}.`;
    }
    return 'The strongest signals say this would mostly stack onto coverage you already have.';
  }
  if (verdict === 'wait') {
    return 'There is not quite enough grounded evidence yet to make this a confident buy call.';
  }
  if (
    analysis.comparatorReasoning.framing === 'replacement' ||
    analysis.comparatorReasoning.framing === 'upgrade'
  ) {
    return analysis.comparatorReasoning.summary;
  }
  if (analysis.comparatorReasoning.framing === 'adjacent') {
    if (overlapNames.length > 0) {
      return `Your closet already has ${describeCandidateItemKind(analysis)} options like ${overlapNames.join(' and ')}. I would pass for now; the difference is not obvious enough from the available evidence.`;
    }
    return `This is close to something your closet already covers. I would pass for now; the available evidence does not show a distinct enough reason to add it.`;
  }
  return 'There is a case for it, but the decision depends on how much you want another version of this kind of item.';
}

function buildOverlapViewModel(analysis: StylePurchaseAnalysis): PurchaseAnalysisOverlapViewModel[] {
  if (analysis.comparatorReasoning.topComparisons.length > 0) {
    return selectVisibleComparisons(analysis).map((entry) => ({
      name: formatOwnedOverlapName(analysis.itemsById[entry.itemId]),
      note: cleanPurchasePresentationCopy(entry.summary),
      pct: entry.overlapScore,
    }));
  }
  const weightedMatches: Array<{ itemId: string; note: string | null; pct: number }> = [];
  const pushMatches = (matches: typeof analysis.contextBuckets.exactComparatorItems, pct: number) => {
    matches.forEach((match) => {
      weightedMatches.push({
        itemId: match.itemId,
        note: match.reasons[0] ?? null,
        pct,
      });
    });
  };
  pushMatches(analysis.contextBuckets.exactComparatorItems, 86);
  pushMatches(analysis.contextBuckets.typedRoleItems, 72);
  pushMatches(analysis.contextBuckets.sameCategoryItems, 58);
  pushMatches(analysis.contextBuckets.nearbyFormalityItems, 46);

  const seen = new Set<string>();
  return weightedMatches
    .filter((entry) => {
      if (seen.has(entry.itemId)) return false;
      seen.add(entry.itemId);
      return true;
    })
    .slice(0, 4)
    .map((entry) => ({
      name: formatOwnedOverlapName(analysis.itemsById[entry.itemId]),
      note: cleanPurchasePresentationCopy(entry.note),
      pct: entry.pct,
    }));
}

function buildShoppingAnswerViewModel(
  analysis: StylePurchaseAnalysis,
  verdict: PurchaseVerdict,
  imageHints?: PurchaseAnalysisImageHints,
  comparatorItemIdMode: 'canonical' | 'handles' = 'canonical',
  stylistJudgment?: PurchaseAnalysisStylistJudgmentViewModel | null,
  suppressWardrobeFitCopy = false,
): PurchaseAnalysisShoppingAnswerViewModel {
  const closestComparators = suppressWardrobeFitCopy ? [] : buildShoppingClosestComparators(analysis, imageHints, comparatorItemIdMode);
  return {
    adjacentReferences: suppressWardrobeFitCopy ? [] : buildShoppingAdjacentReferences(analysis, imageHints, comparatorItemIdMode),
    closestComparators,
    directComparators: closestComparators.filter((entry) => entry.comparatorRole === 'direct_comparator'),
    evidence: suppressWardrobeFitCopy ? buildCandidateOnlyShoppingEvidence(analysis) : buildShoppingEvidence(analysis),
    rejectedComparators: suppressWardrobeFitCopy ? [] : buildShoppingRejectedComparators(analysis, comparatorItemIdMode),
    verdict: mapShoppingVerdict(verdict),
    verdictReason:
      cleanPurchasePresentationCopy(
        suppressWardrobeFitCopy ? buildCandidateOnlySummary(analysis, verdict) : stylistJudgment?.rationale ?? buildSummary(analysis, verdict),
      ) ?? '',
    whatWouldChangeVerdict: stylistJudgment?.caveats.length
      ? stylistJudgment.caveats
      : cleanPurchasePresentationCopyArray(
          suppressWardrobeFitCopy ? buildCandidateOnlyVerdictChangers(analysis) : buildShoppingVerdictChangers(analysis, verdict),
        ),
  };
}

function buildShoppingClosestComparators(
  analysis: StylePurchaseAnalysis,
  imageHints?: PurchaseAnalysisImageHints,
  comparatorItemIdMode: 'canonical' | 'handles' = 'canonical',
): PurchaseAnalysisShoppingComparatorViewModel[] {
  return selectVisibleComparisons(analysis)
    .slice(0, 4)
    .map((entry, index) =>
      buildShoppingComparatorViewModel(
        analysis,
        entry,
        comparatorItemIdMode === 'handles' ? `closet-match-${index + 1}` : entry.itemId,
        imageHints,
      ),
    );
}

function buildShoppingAdjacentReferences(
  analysis: StylePurchaseAnalysis,
  imageHints?: PurchaseAnalysisImageHints,
  comparatorItemIdMode: 'canonical' | 'handles' = 'canonical',
): PurchaseAnalysisShoppingComparatorViewModel[] {
  const closestIds = new Set(selectVisibleComparisons(analysis).map((entry) => entry.itemId));
  const adjacentReferences = analysis.comparatorReasoning.topComparisons.filter(
    (entry) => determineShoppingComparatorRole(analysis, entry) === 'adjacent_reference',
  );
  return [
    ...selectVisibleComparisons(analysis).filter((entry) => determineShoppingComparatorRole(analysis, entry) === 'adjacent_reference'),
    ...adjacentReferences.filter((entry) => !closestIds.has(entry.itemId)),
  ]
    .slice(0, 4)
    .map((entry, index) =>
      buildShoppingComparatorViewModel(
        analysis,
        entry,
        comparatorItemIdMode === 'handles' ? `adjacent-match-${index + 1}` : entry.itemId,
        imageHints,
      ),
    );
}

function buildShoppingComparatorViewModel(
  analysis: StylePurchaseAnalysis,
  entry: StylePurchaseAnalysis['comparatorReasoning']['topComparisons'][number],
  displayItemId: string,
  imageHints?: PurchaseAnalysisImageHints,
): PurchaseAnalysisShoppingComparatorViewModel {
  const item = analysis.itemsById[entry.itemId];
  const hintedImageUrl = imageHints?.comparatorImageUrlsByItemId?.[entry.itemId] ?? null;
  const comparatorRole = determineShoppingComparatorRole(analysis, entry);
  return {
    brand: item?.brand ?? null,
    canonicalItemId: entry.itemId,
    category: item?.category ?? null,
    colorFamily: item?.colorFamily ?? null,
    comparatorRole,
    confidence: entry.confidence,
    descriptor: buildOwnedComparatorDescriptor(item),
    hasImage: Boolean(item?.primaryPhotoDelivery),
    imageAlt: item?.name ?? 'Saved closet item',
    imageUrl: hintedImageUrl,
    itemId: displayItemId,
    name: formatOwnedOverlapName(item),
    overlapScore: entry.overlapScore,
    reasons: cleanPurchasePresentationCopyArray(entry.notes.slice(0, 3)),
    relation: entry.relation,
    relationLabel: cleanPurchasePresentationCopy(formatRelationLabel(entry.relation)) ?? formatRelationLabel(entry.relation),
    roleLabel: comparatorRole === 'direct_comparator' ? 'Closest in your closet' : 'Adjacent reference',
    summary: cleanPurchasePresentationCopy(entry.summary) ?? '',
    subcategory: item?.subcategory ?? null,
  };
}

function mapShoppingComparatorRole(relation: StylePurchaseComparisonRelation): PurchaseAnalysisShoppingComparatorRole {
  if (relation === 'duplicate' || relation === 'replacement' || relation === 'upgrade') {
    return 'direct_comparator';
  }
  return 'adjacent_reference';
}

function determineShoppingComparatorRole(
  analysis: StylePurchaseAnalysis,
  entry: StylePurchaseAnalysis['comparatorReasoning']['topComparisons'][number],
): PurchaseAnalysisShoppingComparatorRole {
  const directBucketIds = new Set([
    ...analysis.contextBuckets.exactComparatorItems.map((match) => match.itemId),
    ...analysis.contextBuckets.typedRoleItems.map((match) => match.itemId),
  ]);
  if (directBucketIds.has(entry.itemId)) {
    return 'direct_comparator';
  }
  return mapShoppingComparatorRole(entry.relation);
}

function buildShoppingRejectedComparators(
  analysis: StylePurchaseAnalysis,
  comparatorItemIdMode: 'canonical' | 'handles' = 'canonical',
): PurchaseAnalysisShoppingRejectedComparatorViewModel[] {
  return analysis.comparatorReasoning.rejectedComparisons.slice(0, 6).map((entry, index) => ({
    itemId: comparatorItemIdMode === 'handles' ? `rejected-match-${index + 1}` : entry.itemId,
    name: formatOwnedOverlapName(analysis.itemsById[entry.itemId]),
    reasons: cleanPurchasePresentationCopyArray(entry.reasons.slice(0, 3)),
    rejectedBecause: cleanPurchasePresentationCopy(entry.rejectedBecause) ?? '',
  }));
}

function buildShoppingEvidence(analysis: StylePurchaseAnalysis): PurchaseAnalysisShoppingEvidenceViewModel {
  const used: string[] = [
    'active closet item state',
    'closet item category, subcategory, color, formality, and comparator metadata',
  ];
  const missing: string[] = [];

  if (analysis.comparatorReasoning.topComparisons.length > 0) {
    used.push('ranked closest closet comparators');
  }
  if (analysis.comparatorReasoning.rejectedComparisons.length > 0) {
    used.push('non-comparator rejections for same-color or adjacent items');
  }
  if (analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection') {
    used.push('host-inspected candidate image observations');
  } else if (analysis.evidenceQuality.candidateVisualGrounding === 'image_reference_only') {
    used.push('candidate image URL presence');
    missing.push('candidate image pixels have not been inspected by Fluent');
  } else {
    missing.push('no candidate image was available to inspect');
  }

  if (analysis.evidenceQuality.comparatorItemIdsInspected.length > 0) {
    used.push('host-inspected closet comparator images');
  } else {
    missing.push('closest closet comparator images have not been pixel-inspected in this result');
  }

  if (analysis.evidenceQuality.primaryPhotoCoverage < 0.5) {
    missing.push('some closet items lack primary photos');
  }
  for (const note of analysis.evidenceQuality.notes) {
    if (isMissingEvidenceNote(note)) {
      missing.push(note);
    }
  }

  return {
    missing: uniqueStrings(missing).slice(0, 5),
    used: uniqueStrings(used).slice(0, 6),
  };
}

function buildCandidateOnlyShoppingEvidence(analysis: StylePurchaseAnalysis): PurchaseAnalysisShoppingEvidenceViewModel {
  const used = ['candidate item details'];
  const missing = ['starter closet evidence or confirmed active closet evidence'];
  if (analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection') {
    used.push('host-inspected candidate image observations');
  } else if (analysis.evidenceQuality.candidateVisualGrounding === 'image_reference_only') {
    used.push('candidate image URL presence');
    missing.push('candidate image pixels have not been inspected by Fluent');
  } else {
    missing.push('no candidate image was available to inspect');
  }
  return {
    missing: uniqueStrings(missing).slice(0, 5),
    used: uniqueStrings(used).slice(0, 6),
  };
}

function isMissingEvidenceNote(note: string) {
  return /not inspected|no candidate image|lack|missing|incomplete|partial|requires|could not/i.test(note);
}

function buildShoppingVerdictChangers(analysis: StylePurchaseAnalysis, verdict: PurchaseVerdict): string[] {
  const changes: string[] = [];
  if (analysis.evidenceQuality.candidateVisualGrounding !== 'host_visual_inspection') {
    changes.push('A host-inspected candidate image showing a materially different silhouette, material, colorway, or role.');
  }
  if (analysis.evidenceQuality.comparatorItemIdsInspected.length === 0 && analysis.comparatorReasoning.topComparisons.length > 0) {
    changes.push('Images for the closest closet comparators confirming they are less visually similar than the current closet evidence suggests.');
  }
  if (verdict === 'skip') {
    changes.push('A clear reason this would replace a worn-out closet item rather than add another near-duplicate.');
  } else if (verdict === 'recommend') {
    changes.push('Finding an active closet item in the same category, silhouette, color role, and use case.');
  } else {
    changes.push(`A clearer replacement need or a distinct use case for this ${describeCandidateItemKind(analysis)}.`);
  }
  return uniqueStrings(changes).slice(0, 4);
}

function buildCandidateOnlyVerdictChangers(analysis: StylePurchaseAnalysis): string[] {
  const changes: string[] = [];
  if (analysis.evidenceQuality.candidateVisualGrounding !== 'host_visual_inspection') {
    changes.push('A host-inspected candidate image showing concrete silhouette, material, colorway, and detail.');
  }
  changes.push('A few starter closet anchors or confirmed active closet items before making wardrobe-fit claims.');
  return uniqueStrings(changes).slice(0, 4);
}

function mapShoppingVerdict(verdict: PurchaseVerdict): PurchaseAnalysisShoppingVerdict {
  if (verdict === 'recommend') return 'buy';
  if (verdict === 'skip') return 'skip';
  return 'wait';
}

function buildReasons(analysis: StylePurchaseAnalysis, verdict: PurchaseVerdict): string[] {
  const reasons: string[] = [];
  const overlapNames = buildNamedOverlapList(analysis);
  if (verdict === 'skip' && overlapNames.length > 0) {
    reasons.push(`Your closet already covers this wardrobe job, especially with ${overlapNames.slice(0, 2).join(' and ')}.`);
  } else if (analysis.comparatorReasoning.notes.length > 0) {
    reasons.push(...analysis.comparatorReasoning.notes.slice(0, 2));
  }
  if (verdict === 'skip' && analysis.evidenceQuality.candidateVisualObservations.length > 0) {
    reasons.push(`The photo does not show enough new color, shape, or material to separate it from those close matches.`);
  }
  if (verdict === 'recommend' && analysis.coverageImpact.strengthensWeakArea) {
    reasons.push('It adds something you do not already have much of instead of piling into a well-covered part of your closet.');
  }
  if (verdict === 'skip' && analysis.coverageImpact.pilesIntoCoveredLane) {
    reasons.push(`The practical gain looks limited unless this is replacing a pair you have worn out.`);
  }
  if (analysis.comparatorReasoning.framing === 'replacement') {
    reasons.push('The closest overlap looks more like something to replace than a genuinely new addition.');
  }
  if (analysis.comparatorReasoning.framing === 'upgrade') {
    reasons.push('The gain here is more about refinement than opening a genuinely new role.');
  }
  if (analysis.laneAssessment.introduces) {
    reasons.push(`It would add a clearer ${formatJudgmentAreaLabel(analysis.laneAssessment.introduces)} option than you have right now.`);
  }
  if (analysis.laneAssessment.bridges.length > 0) {
    reasons.push(`It works with ${analysis.laneAssessment.bridges.slice(0, 2).map(formatJudgmentAreaLabel).join(' and ')} pieces you already own.`);
  }
  if (analysis.alignmentSignals.notes.length > 0) {
    reasons.push(analysis.alignmentSignals.notes[0]!);
  }
  if (analysis.tensionSignals.notes.length > 0) {
    reasons.push(analysis.tensionSignals.notes[0]!);
  }
  if (analysis.confidenceNotes.length > 0 && verdict === 'wait') {
    reasons.push(analysis.confidenceNotes[0]!);
  }
  return cleanPurchasePresentationCopyArray(uniqueStrings(reasons).slice(0, 4));
}

function buildFindings(analysis: StylePurchaseAnalysis): PurchaseAnalysisFindingViewModel[] {
  const findings: PurchaseAnalysisFindingViewModel[] = [];
  if (analysis.contextBuckets.exactComparatorItems.length > 0) {
    const overlapNames = buildNamedOverlapList(analysis);
    findings.push({
      body:
        overlapNames.length > 0
          ? `Closest overlaps: ${overlapNames.join(' and ')}.`
          : `You already own direct overlaps in this kind of ${describeCandidateItemKind(analysis)}.`,
      bodySecondary: cleanPurchasePresentationCopy(analysis.contextBuckets.exactComparatorItems[0]?.reasons[0] ?? null),
      id: 'coverage',
      metricLabel: 'Overlap',
      metricValue: `${analysis.contextBuckets.exactComparatorItems.length}`,
      tag: 'Overlap',
      tone: 'overlap',
    });
  } else if (analysis.comparatorReasoning.topComparisons.length > 0) {
    const closest = selectVisibleComparisons(analysis)[0] ?? analysis.comparatorReasoning.topComparisons[0]!;
    findings.push({
      body: cleanPurchasePresentationCopy(closest.summary) ?? '',
      bodySecondary: cleanPurchasePresentationCopy(closest.notes[0] ?? null),
      id: 'coverage',
      metricLabel: 'Overlap',
      metricValue: `${Math.round(closest.overlapScore)}`,
      tag: 'Overlap',
      tone: 'overlap',
    });
  } else if (analysis.comparatorCoverage.note) {
    findings.push({
      body: cleanPurchasePresentationCopy(analysis.comparatorCoverage.note) ?? '',
      bodySecondary: null,
      id: 'coverage',
      metricLabel: 'Coverage',
      metricValue:
        analysis.comparatorCoverage.mode === 'exact_comparator'
          ? `${analysis.comparatorCoverage.exactComparatorCount}`
          : `${analysis.comparatorCoverage.sameCategoryCount}`,
      tag: 'Overlap',
      tone: 'overlap',
    });
  }
  if (
    analysis.comparatorReasoning.framing !== 'duplicate' &&
    analysis.comparatorReasoning.framing !== 'replacement' &&
    analysis.comparatorReasoning.framing !== 'upgrade' &&
    (analysis.laneAssessment.existingLane || analysis.laneAssessment.introduces)
  ) {
    findings.push({
      body: analysis.laneAssessment.introduces
        ? `This would introduce a more distinct ${formatJudgmentAreaLabel(analysis.laneAssessment.introduces)} option.`
        : `This sits in a part of your closet you already wear.`,
      bodySecondary: cleanPurchasePresentationCopy(analysis.laneAssessment.notes[0] ?? null),
      id: 'lane',
      metricLabel: 'Category',
      metricValue: analysis.laneAssessment.introduces ? 'New' : 'Known',
      tag: 'Versatility',
      tone: 'versatility',
    });
  }
  if (analysis.tensionSignals.hardAvoid || analysis.tensionSignals.notes.length > 0) {
    findings.push({
      body: analysis.tensionSignals.hardAvoid
        ? `Hard avoid: ${analysis.tensionSignals.hardAvoid}.`
        : analysis.tensionSignals.notes[0]!,
      bodySecondary: cleanPurchasePresentationCopy(analysis.confidenceNotes[0] ?? null),
      id: 'tension',
      metricLabel: 'Risk',
      metricValue: analysis.tensionSignals.hardAvoid ? 'High' : 'Watch',
      tag: 'Fit',
      tone: 'fit',
    });
  }
  return findings.slice(0, 3);
}

function buildCandidateOnlyFindings(analysis: StylePurchaseAnalysis): PurchaseAnalysisFindingViewModel[] {
  if (analysis.evidenceQuality.candidateVisualGrounding === 'host_visual_inspection') {
    return [
      {
        body: 'Candidate image inspected; closet-fit claims are paused until Style has stronger closet evidence.',
        bodySecondary: null,
        id: 'candidate-evidence',
        metricLabel: 'Scope',
        metricValue: 'Item only',
        tag: 'Evidence',
        tone: 'neutral',
      },
    ];
  }
  return [
    {
      body: 'Candidate image evidence is still needed before a final visual shopping call.',
      bodySecondary: null,
      id: 'candidate-evidence',
      metricLabel: 'Scope',
      metricValue: 'Item only',
      tag: 'Evidence',
      tone: 'neutral',
    },
  ];
}

function buildGapViewModel(analysis: StylePurchaseAnalysis): PurchaseAnalysisGapViewModel[] {
  const gaps: PurchaseAnalysisGapViewModel[] = [];
  if (
    analysis.comparatorReasoning.framing === 'duplicate' ||
    analysis.comparatorReasoning.framing === 'replacement' ||
    analysis.comparatorReasoning.framing === 'upgrade'
  ) {
    return gaps;
  }
  if (analysis.contextBuckets.exactComparatorItems.length > 0 && analysis.coverageImpact.pilesIntoCoveredLane) {
    return gaps;
  }
  if (analysis.laneAssessment.introduces) {
    gaps.push({
      lane: cleanPurchasePresentationCopy(titleCase(formatJudgmentAreaLabel(analysis.laneAssessment.introduces))) ?? '',
      need: 'high',
      note: 'This would add something you do not currently cover clearly.',
    });
  }
  if (analysis.coverageImpact.strengthensWeakArea && analysis.laneAssessment.existingLane) {
    gaps.push({
      lane: cleanPurchasePresentationCopy(titleCase(formatJudgmentAreaLabel(analysis.laneAssessment.existingLane))) ?? '',
      need: 'med',
      note: 'This would deepen a part of your closet that still looks a little thin.',
    });
  }
  return gaps.slice(0, 2);
}

function buildAnalysisId(analysis: StylePurchaseAnalysis): string {
  const seed = JSON.stringify({
    category: analysis.candidate.category,
    comparatorKey: analysis.candidate.comparatorKey,
    imageUrl: analysis.candidate.imageUrls[0] ?? null,
    name: analysis.candidate.name,
  });
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return `purchase-analysis:${Math.abs(hash)}`;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function buildNamedOverlapList(analysis: StylePurchaseAnalysis): string[] {
  return selectVisibleComparisons(analysis)
    .map((entry) => formatOwnedOverlapName(analysis.itemsById[entry.itemId]))
    .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
    .slice(0, 2);
}

function selectVisibleComparisons(analysis: StylePurchaseAnalysis) {
  const comparisons = analysis.comparatorReasoning.topComparisons;
  if (comparisons.length === 0) return comparisons;

  const directFamilyComparisons = comparisons.filter((entry) =>
    entry.notes.some((note) => /same family/i.test(note)),
  );
  if (directFamilyComparisons.length > 0) {
    return directFamilyComparisons.slice(0, 3);
  }

  const strongRelations = comparisons.filter(
    (entry) => entry.relation === 'duplicate' || entry.relation === 'replacement' || entry.relation === 'upgrade',
  );
  if (strongRelations.length > 0) {
    return strongRelations.slice(0, 3);
  }

  return comparisons.slice(0, 4);
}

function formatOwnedOverlapName(item: StylePurchaseAnalysis['itemsById'][string] | undefined): string {
  if (!item) return 'Saved closet item';
  const name = item.name?.trim();
  const brand = item.brand?.trim();
  if (!name) return item.id;
  if (!brand) return name;
  if (name.toLowerCase().includes(brand.toLowerCase())) {
    return name;
  }
  return `${brand} ${name}`;
}

function buildOwnedComparatorDescriptor(item: StylePurchaseAnalysis['itemsById'][string] | undefined): string | null {
  if (!item) return null;
  const bits = [item.subcategory, item.colorFamily, item.comparatorKey && item.comparatorKey !== 'unknown' ? item.comparatorKey : null]
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .slice(0, 2);
  return bits.length ? bits.map((entry) => titleCase(entry.replace(/_/g, ' '))).join(' · ') : null;
}

function formatRelationLabel(relation: StylePurchaseComparisonRelation): string {
  if (relation === 'duplicate') return 'Very close';
  if (relation === 'replacement') return 'Replacement';
  if (relation === 'upgrade') return 'Upgrade candidate';
  if (relation === 'adjacent') return 'Useful reference';
  if (relation === 'distinct') return 'Different enough';
  return 'Needs a closer look';
}

function describeCandidateItemKind(analysis: StylePurchaseAnalysis): string {
  const subcategory = analysis.candidate.subcategory?.trim().toLowerCase();
  if (subcategory) {
    if (subcategory.endsWith('s')) return subcategory.slice(0, -1);
    return subcategory;
  }

  const comparatorKey = analysis.candidate.comparatorKey?.trim().toLowerCase();
  if (comparatorKey && comparatorKey !== 'unknown') {
    return comparatorKey.replace(/_/g, ' ');
  }

  const category = analysis.candidate.category?.trim().toLowerCase() ?? 'item';
  if (category === 'shoe') return 'shoe';
  return category.replace(/_/g, ' ');
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatJudgmentAreaLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/\blane\b/gi, 'area');
}

function formatPrice(price: StylePurchaseCandidate['estimatedPrice']): string | null {
  if (!price) return null;
  const min = typeof price.min === 'number' && Number.isFinite(price.min) ? price.min : null;
  const max = typeof price.max === 'number' && Number.isFinite(price.max) ? price.max : null;
  if (min == null && max == null) return null;
  const formatter = new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  });
  if (min != null && max != null && min !== max) {
    return `${formatter.format(min)}-${formatter.format(max)}`;
  }
  return formatter.format(min ?? max ?? 0);
}
