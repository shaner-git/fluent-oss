import type { StylePurchaseAnalysis, StylePurchaseCandidate, StylePurchaseComparisonRelation } from './types';

export const STYLE_PURCHASE_ANALYSIS_LEGACY_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v2.html';
export const STYLE_PURCHASE_ANALYSIS_PREVIOUS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v3.html';
export const STYLE_PURCHASE_ANALYSIS_CACHED_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v4.html';
export const STYLE_PURCHASE_ANALYSIS_IMAGE_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v5.html';
export const STYLE_PURCHASE_ANALYSIS_HUMAN_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v6.html';
export const STYLE_PURCHASE_ANALYSIS_COMBINED_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v7.html';
export const STYLE_PURCHASE_ANALYSIS_TEMPLATE_URI = 'ui://widget/fluent-purchase-analysis-v8.html';

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
  toolName: string;
  args: Record<string, unknown>;
}

export interface PurchaseAnalysisWidgetActionViewModel {
  id: PurchaseAnalysisActionViewModel['id'];
  label: string;
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
  closetItemsChecked: number | null;
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

export type PurchaseAnalysisShoppingVerdict = 'buy' | 'skip' | 'wait';
export type PurchaseAnalysisShoppingComparatorRole = 'direct_comparator' | 'adjacent_reference';

export interface PurchaseAnalysisShoppingComparatorViewModel {
  itemId: string;
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
  shoppingAnswer: PurchaseAnalysisShoppingAnswerViewModel;
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
    imageHints?: PurchaseAnalysisImageHints;
  },
): PurchaseAnalysisViewModel {
  const verdict = deriveVerdict(analysis);
  const confidencePercent = deriveConfidencePercent(analysis);
  const confidence = confidencePercent >= 76 ? 'high' : confidencePercent >= 56 ? 'medium' : 'low';
  const item = buildItemViewModel(analysis.candidate, options?.imageHints);
  const visualGrounding = buildVisualGroundingViewModel(analysis);
  const overlap = buildOverlapViewModel(analysis);
  const reasons = buildReasons(analysis, verdict);
  const findings = buildFindings(analysis);
  const gaps = buildGapViewModel(analysis);
  const actions = item.name
    ? [
        {
          id: 'log_purchase' as const,
          label: 'Log purchase',
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
    analysisSummary: buildSummary(analysis, verdict),
    confidence,
    confidenceLabel: `Confidence · ${titleCase(confidence)}`,
    confidencePercent,
    context: {
      closetItemsChecked: Object.keys(analysis.itemsById).length,
      similarItemsOwned:
        analysis.contextBuckets.exactComparatorItems.length +
        analysis.contextBuckets.typedRoleItems.length +
        analysis.contextBuckets.sameCategoryItems.length,
      wearHistoryMonths: null,
    },
    findings,
    gaps,
    generatedAt: null,
    id: buildAnalysisId(analysis),
    item,
    overlap,
    reasons,
    shoppingAnswer: buildShoppingAnswerViewModel(analysis, verdict, options?.imageHints),
    verdict,
    verdictEmphasis: null,
    verdictHeadline: addVisualGroundingToHeadline(analysis, buildVerdictHeadline(analysis, verdict)),
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
    overlapCount: widget.overlap.length,
    purchaseAnalysis: widget,
    shoppingAnswer: widget.shoppingAnswer,
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
    shoppingAnswer: viewModel.shoppingAnswer,
    title: viewModel.item.name,
    verdict: viewModel.verdict,
    visualGrounding: viewModel.visualGrounding,
    version: 'v8',
  };
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
  .pa-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pa-thumb-glyph { color: rgba(255, 255, 255, 0.75); }
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
  .pa-compare-card[data-role="candidate"] { background: var(--pa-surface); }
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
  .pa-compare-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pa-compare-glyph { color: var(--pa-muted); font-size: 12px; font-weight: 600; text-align: center; padding: 8px; }
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
    padding: 8px 14px; background: var(--pa-surface); color: var(--pa-ink);
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
  @media (max-width: 620px) {
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

    function getOpenAI() { return window.openai || {}; }
    function getSummary() { return getOpenAI().toolOutput || null; }
    function getMetadata() { return getOpenAI().toolResponseMetadata || null; }
    function notifyHeight() {
      getOpenAI().notifyIntrinsicHeight && getOpenAI().notifyIntrinsicHeight(document.body.scrollHeight);
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
    function getCallTool() {
      var openai = getOpenAI();
      if (typeof openai.callTool === 'function') return openai.callTool.bind(openai);
      return null;
    }
    function normalize(value) {
      if (!value || typeof value !== 'object') return null;
      if (!value.item && !value.verdict) return null;
      var item = value.item || {};
      return {
        actions: toArray(value.actions).map(function (a) { return { id: a.id, label: a.label }; }),
        alternatives: toArray(value.alternatives),
        analysisSummary: typeof value.analysisSummary === 'string' ? value.analysisSummary : '',
        confidence: typeof value.confidence === 'string' ? value.confidence : 'medium',
        confidenceLabel: typeof value.confidenceLabel === 'string' ? value.confidenceLabel : 'Confidence · Medium',
        confidencePercent: typeof value.confidencePercent === 'number' ? value.confidencePercent : null,
        context: value.context && typeof value.context === 'object' ? value.context : {
          closetItemsChecked: null, wearHistoryMonths: null, similarItemsOwned: null,
        },
        findings: toArray(value.findings),
        overlap: toArray(value.overlap),
        gaps: toArray(value.gaps),
        reasons: toArray(value.reasons).filter(function (entry) { return typeof entry === 'string' && entry.length > 0; }),
        shoppingAnswer: normalizeShoppingAnswer(value.shoppingAnswer),
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
        },
        verdict: typeof value.verdict === 'string' ? value.verdict : 'consider',
        verdictEmphasis: typeof value.verdictEmphasis === 'string' ? value.verdictEmphasis : null,
        verdictHeadline: typeof value.verdictHeadline === 'string' ? value.verdictHeadline : 'Consider',
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
        itemId: typeof value.itemId === 'string' ? value.itemId : '',
        name: typeof value.name === 'string' ? value.name : 'Saved closet item',
        overlapScore: typeof value.overlapScore === 'number' ? value.overlapScore : 0,
        relationLabel: typeof value.relationLabel === 'string' ? value.relationLabel : 'Closest match',
        roleLabel: typeof value.roleLabel === 'string' ? value.roleLabel : 'Your closet',
        summary: typeof value.summary === 'string' ? value.summary : '',
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
    function getViewModel() {
      return extract(getMetadata()) || extract(getSummary()) || extract(getOpenAI().toolOutput);
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
      if (item.imageUrl) return '<img src="' + escapeHtml(item.imageUrl) + '" alt="' + escapeHtml(item.imageAlt || item.name) + '" />';
      return '<svg class="pa-thumb-glyph" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>';
    }
    function renderCompareThumb(imageUrl, alt, fallback) {
      if (imageUrl) return '<img src="' + escapeHtml(imageUrl) + '" alt="' + escapeHtml(alt || '') + '" />';
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
      if (verdict === 'consider') return 'Worth considering';
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
      if (!comparators.length && !vm.item.imageUrl) return '';
      var candidateMeta = [vm.item.colorway, vm.item.category].filter(Boolean).slice(0, 2);
      var cards = [
        '<article class="pa-compare-card" data-role="candidate"><div class="pa-compare-thumb">' + renderCompareThumb(vm.item.imageUrl, vm.item.imageAlt || vm.item.name, 'This item') + '</div><div class="pa-compare-label">This piece</div><div class="pa-compare-name">' + escapeHtml(vm.item.name || 'Candidate item') + '</div><div class="pa-compare-meta">' + candidateMeta.map(function (entry) { return '<span class="pa-chip">' + escapeHtml(displayLabel(entry)) + '</span>'; }).join('') + '</div></article>'
      ];
      comparators.forEach(function (item) {
        var meta = [item.relationLabel, item.colorFamily, item.descriptor].filter(Boolean).slice(0, 3);
        cards.push('<article class="pa-compare-card"><div class="pa-compare-thumb">' + renderCompareThumb(item.imageUrl, item.imageAlt || item.name, item.hasImage ? 'Photo on file' : 'No photo yet') + '</div><div class="pa-compare-label">' + escapeHtml(item.roleLabel || 'Your closet') + '</div><div class="pa-compare-name">' + escapeHtml(item.name) + '</div><div class="pa-compare-meta">' + meta.map(function (entry) { return '<span class="pa-chip">' + escapeHtml(displayLabel(entry)) + '</span>'; }).join('') + '</div>' + renderCompareScore(item) + (item.summary ? '<div class="pa-compare-note">' + escapeHtml(item.summary) + '</div>' : '') + '</article>');
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
      if (typeof context.closetItemsChecked === 'number') parts.push(context.closetItemsChecked + ' closet items checked');
      if (typeof context.similarItemsOwned === 'number') parts.push(context.similarItemsOwned + ' similar owned');
      if (!parts.length) return '';
      return '<div class="pa-context">' + parts.map(function (p) { return '<span>' + escapeHtml(p) + '</span>'; }).join('') + '</div>';
    }
    function renderActions(actions) {
      if (!actions.length) return '';
      var btns = actions.slice(0, 2).map(function (a, i) {
        var variant = i === actions.length - 1 ? 'primary' : 'ghost';
        var disabled = pendingActionId || completedActionIds[a.id] ? 'disabled' : '';
        var label = completedActionIds[a.id] ? 'Logged' : (a.id === pendingActionId ? '…' : a.label);
        return '<button class="pa-btn" data-variant="' + variant + '" data-action="' + escapeHtml(a.id) + '" ' + disabled + '>' + escapeHtml(label) + '</button>';
      }).join('');
      return '<div class="pa-footer">' + btns + '</div>';
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
        root.innerHTML = '<div class="pa-fallback">Preparing your purchase analysis…</div>';
        scheduleHydrationCheck();
        notifyHeight();
        return;
      }
      var useSummaryFallback = !vm.reasons.length && !vm.findings.length;
      var confidencePct = typeof vm.confidencePercent === 'number' ? Math.round(vm.confidencePercent) : null;
      root.innerHTML =
        '<article class="pa-card"><div class="pa-card-inner">'
        + '<div class="pa-head"><div class="pa-thumb">' + renderThumb(vm.item) + '</div><div class="pa-head-body"><div class="pa-eyebrow">Purchase analysis' + (vm.item.brand ? ' · ' + escapeHtml(vm.item.brand) : '') + '</div><h2 class="pa-title">' + escapeHtml(vm.item.name) + '</h2>' + (vm.item.descriptor ? '<div class="pa-descriptor">' + escapeHtml(vm.item.descriptor) + '</div>' : '') + (vm.item.priceDisplay ? '<div class="pa-price">' + escapeHtml(vm.item.priceDisplay) + '</div>' : '') + '</div></div>'
        + '<div class="pa-verdict" data-verdict="' + escapeHtml(vm.verdict) + '"><div class="pa-verdict-badge">' + renderVerdictGlyph(vm.verdict) + '</div><div><div class="pa-verdict-eyebrow">My take · ' + renderVerdictLabel(vm.verdict) + '</div><div class="pa-verdict-headline">' + escapeHtml(vm.verdictHeadline) + '</div></div><div class="pa-verdict-meta"><div class="pa-verdict-meta-label">Confidence</div><div class="pa-verdict-meta-value">' + (confidencePct !== null ? confidencePct + '%' : escapeHtml(vm.confidence)) + '</div></div></div>'
        + renderStylistRead(vm)
        + renderComparisonStrip(vm)
        + renderVisualGrounding(vm.visualGrounding)
        + (useSummaryFallback && vm.analysisSummary ? '<p class="pa-summary">' + escapeHtml(vm.analysisSummary) + '</p>' : '')
        + renderReasons(vm.reasons, vm.verdict)
        + renderFindings(vm.findings)
        + renderGaps(vm.gaps)
        + renderContext(vm.context)
        + (errorMessage ? '<div class="pa-error">' + escapeHtml(errorMessage) + '</div>' : '')
        + (successMessage ? '<div class="pa-success">' + escapeHtml(successMessage) + '</div>' : '')
        + renderActions(vm.actions)
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
    window.addEventListener('openai:set_globals', function () { render(); });
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
    actions: viewModel.actions.map((action) => ({ id: action.id, label: action.label })),
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
    overlap: viewModel.overlap,
    reasons: viewModel.reasons,
    shoppingAnswer: viewModel.shoppingAnswer,
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
    if (analysis.laneAssessment.introduces) return `This opens up a useful ${analysis.laneAssessment.introduces} option.`;
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
    return 'This could upgrade a lane you already wear.';
  }
  if (analysis.comparatorReasoning.framing === 'adjacent') {
    return 'This overlaps with what you own, but not perfectly.';
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
    analysis.comparatorReasoning.framing === 'upgrade' ||
    analysis.comparatorReasoning.framing === 'adjacent'
  ) {
    return analysis.comparatorReasoning.summary;
  }
  return 'There is a case for it, but the decision depends on how much you want another version of this kind of item.';
}

function buildOverlapViewModel(analysis: StylePurchaseAnalysis): PurchaseAnalysisOverlapViewModel[] {
  if (analysis.comparatorReasoning.topComparisons.length > 0) {
    return selectVisibleComparisons(analysis).map((entry) => ({
      name: formatOwnedOverlapName(analysis.itemsById[entry.itemId]),
      note: entry.summary,
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
      note: entry.note,
      pct: entry.pct,
    }));
}

function buildShoppingAnswerViewModel(
  analysis: StylePurchaseAnalysis,
  verdict: PurchaseVerdict,
  imageHints?: PurchaseAnalysisImageHints,
): PurchaseAnalysisShoppingAnswerViewModel {
  const closestComparators = buildShoppingClosestComparators(analysis, imageHints);
  return {
    adjacentReferences: buildShoppingAdjacentReferences(analysis, imageHints),
    closestComparators,
    directComparators: closestComparators.filter((entry) => entry.comparatorRole === 'direct_comparator'),
    evidence: buildShoppingEvidence(analysis),
    rejectedComparators: buildShoppingRejectedComparators(analysis),
    verdict: mapShoppingVerdict(verdict),
    verdictReason: buildSummary(analysis, verdict),
    whatWouldChangeVerdict: buildShoppingVerdictChangers(analysis, verdict),
  };
}

function buildShoppingClosestComparators(
  analysis: StylePurchaseAnalysis,
  imageHints?: PurchaseAnalysisImageHints,
): PurchaseAnalysisShoppingComparatorViewModel[] {
  return selectVisibleComparisons(analysis)
    .slice(0, 4)
    .map((entry) => buildShoppingComparatorViewModel(analysis, entry, imageHints));
}

function buildShoppingAdjacentReferences(
  analysis: StylePurchaseAnalysis,
  imageHints?: PurchaseAnalysisImageHints,
): PurchaseAnalysisShoppingComparatorViewModel[] {
  const closestIds = new Set(selectVisibleComparisons(analysis).map((entry) => entry.itemId));
  const adjacentReferences = analysis.comparatorReasoning.topComparisons.filter(
    (entry) => mapShoppingComparatorRole(entry.relation) === 'adjacent_reference',
  );
  return [
    ...selectVisibleComparisons(analysis).filter((entry) => mapShoppingComparatorRole(entry.relation) === 'adjacent_reference'),
    ...adjacentReferences.filter((entry) => !closestIds.has(entry.itemId)),
  ]
    .slice(0, 4)
    .map((entry) => buildShoppingComparatorViewModel(analysis, entry, imageHints));
}

function buildShoppingComparatorViewModel(
  analysis: StylePurchaseAnalysis,
  entry: StylePurchaseAnalysis['comparatorReasoning']['topComparisons'][number],
  imageHints?: PurchaseAnalysisImageHints,
): PurchaseAnalysisShoppingComparatorViewModel {
  const item = analysis.itemsById[entry.itemId];
  const hintedImageUrl = imageHints?.comparatorImageUrlsByItemId?.[entry.itemId] ?? null;
  return {
    brand: item?.brand ?? null,
    category: item?.category ?? null,
    colorFamily: item?.colorFamily ?? null,
    comparatorRole: mapShoppingComparatorRole(entry.relation),
    confidence: entry.confidence,
    descriptor: buildOwnedComparatorDescriptor(item),
    hasImage: Boolean(item?.primaryPhotoDelivery),
    imageAlt: item?.name ?? 'Saved closet item',
    imageUrl: hintedImageUrl,
    itemId: entry.itemId,
    name: formatOwnedOverlapName(item),
    overlapScore: entry.overlapScore,
    reasons: entry.notes.slice(0, 3),
    relation: entry.relation,
    relationLabel: formatRelationLabel(entry.relation),
    roleLabel: mapShoppingComparatorRole(entry.relation) === 'direct_comparator' ? 'Closest in your closet' : 'Adjacent reference',
    summary: entry.summary,
    subcategory: item?.subcategory ?? null,
  };
}

function mapShoppingComparatorRole(relation: StylePurchaseComparisonRelation): PurchaseAnalysisShoppingComparatorRole {
  if (relation === 'duplicate' || relation === 'replacement' || relation === 'upgrade') {
    return 'direct_comparator';
  }
  return 'adjacent_reference';
}

function buildShoppingRejectedComparators(analysis: StylePurchaseAnalysis): PurchaseAnalysisShoppingRejectedComparatorViewModel[] {
  return analysis.comparatorReasoning.rejectedComparisons.slice(0, 6).map((entry) => ({
    itemId: entry.itemId,
    name: formatOwnedOverlapName(analysis.itemsById[entry.itemId]),
    reasons: entry.reasons.slice(0, 3),
    rejectedBecause: entry.rejectedBecause,
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
  for (const note of analysis.evidenceQuality.notes.slice(0, 2)) {
    missing.push(note);
  }

  return {
    missing: uniqueStrings(missing).slice(0, 5),
    used: uniqueStrings(used).slice(0, 6),
  };
}

function buildShoppingVerdictChangers(analysis: StylePurchaseAnalysis, verdict: PurchaseVerdict): string[] {
  const changes: string[] = [];
  if (analysis.evidenceQuality.candidateVisualGrounding !== 'host_visual_inspection') {
    changes.push('A host-inspected candidate image showing a materially different silhouette, material, colorway, or role.');
  }
  if (analysis.evidenceQuality.comparatorItemIdsInspected.length === 0 && analysis.comparatorReasoning.topComparisons.length > 0) {
    changes.push('Images for the closest closet comparators confirming they are less visually similar than the metadata suggests.');
  }
  if (verdict === 'skip') {
    changes.push('A clear reason this would replace a worn-out closet item rather than add another near-duplicate.');
  } else if (verdict === 'recommend') {
    changes.push('Finding an active closet item in the same category, silhouette, color role, and use case.');
  } else {
    changes.push('Better visual evidence resolving whether the closest comparator is a true duplicate or only adjacent.');
  }
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
    reasons.push(`Your closet already covers this lane, especially with ${overlapNames.slice(0, 2).join(' and ')}.`);
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
    reasons.push(`It would add a clearer ${analysis.laneAssessment.introduces} option than you have right now.`);
  }
  if (analysis.laneAssessment.bridges.length > 0) {
    reasons.push(`It bridges well with ${analysis.laneAssessment.bridges.slice(0, 2).join(' and ')}.`);
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
  return uniqueStrings(reasons).slice(0, 4);
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
      bodySecondary: analysis.contextBuckets.exactComparatorItems[0]?.reasons[0] ?? null,
      id: 'coverage',
      metricLabel: 'Overlap',
      metricValue: `${analysis.contextBuckets.exactComparatorItems.length}`,
      tag: 'Overlap',
      tone: 'overlap',
    });
  } else if (analysis.comparatorReasoning.topComparisons.length > 0) {
    const closest = selectVisibleComparisons(analysis)[0] ?? analysis.comparatorReasoning.topComparisons[0]!;
    findings.push({
      body: closest.summary,
      bodySecondary: closest.notes[0] ?? null,
      id: 'coverage',
      metricLabel: 'Overlap',
      metricValue: `${Math.round(closest.overlapScore)}`,
      tag: 'Overlap',
      tone: 'overlap',
    });
  } else if (analysis.comparatorCoverage.note) {
    findings.push({
      body: analysis.comparatorCoverage.note,
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
        ? `This would introduce a more distinct ${analysis.laneAssessment.introduces} option.`
        : `This sits in a part of your closet you already wear.`,
      bodySecondary: analysis.laneAssessment.notes[0] ?? null,
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
      bodySecondary: analysis.confidenceNotes[0] ?? null,
      id: 'tension',
      metricLabel: 'Risk',
      metricValue: analysis.tensionSignals.hardAvoid ? 'High' : 'Watch',
      tag: 'Fit',
      tone: 'fit',
    });
  }
  return findings.slice(0, 3);
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
      lane: titleCase(analysis.laneAssessment.introduces),
      need: 'high',
      note: 'This would add something you do not currently cover clearly.',
    });
  }
  if (analysis.coverageImpact.strengthensWeakArea && analysis.laneAssessment.existingLane) {
    gaps.push({
      lane: titleCase(analysis.laneAssessment.existingLane),
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
  if (relation === 'upgrade') return 'Upgrade lane';
  if (relation === 'adjacent') return 'Similar role';
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
