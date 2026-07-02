import type {
  StyleCalibrationReadiness,
  StyleCalibrationPromptRecord,
  StyleCalibrationSignalKind,
  StyleCalibrationSignalRecord,
  StyleConfidenceBreakdown,
  StyleInferenceSource,
  StyleItemCalibrationRecord,
  StyleItemRecord,
  StyleItemWearStatus,
  StyleOnboardingCalibrationRecord,
  StyleProfileRecord,
  StyleSetupState,
} from './types';

export const STYLE_SETUP_CALIBRATION_TEMPLATE_VERSION = 'v1';
export const STYLE_SETUP_CALIBRATION_TEMPLATE_URI = 'ui://widget/fluent-style-setup-calibration-v1.html';

export function buildStyleOnboardingCalibration(input: {
  items: StyleItemRecord[];
  profile: StyleProfileRecord;
}): StyleOnboardingCalibrationRecord {
  const itemCalibrationById = new Map(input.profile.raw.itemCalibration.map((entry) => [entry.itemId, entry]));
  const activeItems = input.items.filter((item) => item.status === 'active');
  const evidenceItems = activeItems.filter((item) => !isStyleItemExcludedFromCalibration(input.profile, item.id));
  const excludedItemCount = activeItems.length - evidenceItems.length;
  const categoryCoverage = countBy(evidenceItems, (item) => (item.category ?? 'unknown').toLowerCase());
  const itemCountWithPhoto = evidenceItems.filter((item) => item.photos.length > 0).length;
  const itemCountWithDeliverablePhoto = evidenceItems.filter((item) => item.photos.some((photo) => photo.delivery)).length;
  const itemCountWithProfile = evidenceItems.filter((item) => Boolean(item.profile)).length;
  const inferredStyleSignals = inferSignalsFromCloset(evidenceItems, input.profile.raw.calibrationSignals);
  const confirmedStyleSignals = confirmedSignalsFromProfile(input.profile);
  const confidenceBreakdown = buildConfidenceBreakdown({
    confirmedSignalCount: confirmedStyleSignals.length,
    evidenceItems,
    inferredSignalCount: inferredStyleSignals.length,
    itemCountWithDeliverablePhoto,
    itemCountWithProfile,
    profile: input.profile,
  });
  const state = deriveSetupState({
    activeItemCount: evidenceItems.length,
    confirmedSignalCount: confirmedStyleSignals.length,
    confidenceBreakdown,
    inferredSignalCount: inferredStyleSignals.length,
    profile: input.profile,
  });
  const purchaseAnalysisReadiness = buildPurchaseReadiness(state, confidenceBreakdown, evidenceItems.length, excludedItemCount);
  const calibrationPrompts = buildCalibrationPrompts({
    confirmedSignalCount: confirmedStyleSignals.length,
    evidenceItems,
    inferredStyleSignals,
    profile: input.profile,
  });
  const unresolvedQuestions = buildUnresolvedQuestions({
    calibrationPrompts,
    confirmedSignalCount: confirmedStyleSignals.length,
    evidenceItems,
    profile: input.profile,
  });
  const suggestedNextAction = buildSuggestedNextAction({
    confirmedSignalCount: confirmedStyleSignals.length,
    evidenceItems,
    profile: input.profile,
    state,
    unresolvedQuestions,
  });

  return {
    activeItemCount: evidenceItems.length,
    calibrationPrompts,
    categoryCoverage,
    closetStatus: {
      hasImportedCloset: Boolean(input.profile.raw.importedClosetAt || input.profile.raw.importSource),
      importedClosetConfirmed: input.profile.raw.importedClosetConfirmed,
      state,
    },
    confirmedStyleSignals,
    confidenceBreakdown,
    excludedItemCount,
    inferredStyleSignals,
    itemCalibration: Array.from(itemCalibrationById.values()),
    photoEvidenceCoverage: {
      deliverablePhotoCoverage: ratio(itemCountWithDeliverablePhoto, evidenceItems.length),
      itemCountWithDeliverablePhoto,
      itemCountWithPhoto,
      photoCoverage: ratio(itemCountWithPhoto, evidenceItems.length),
    },
    purchaseAnalysisReadiness,
    suggestedNextAction,
    unresolvedQuestions,
  };
}

export function isStyleItemExcludedFromCalibration(profile: StyleProfileRecord, itemId: string): boolean {
  const calibration = profile.raw.itemCalibration.find((entry) => entry.itemId === itemId);
  return calibration?.wearStatus === 'stale' || calibration?.wearStatus === 'accidental';
}

export function buildStyleCalibrationSignal(input: {
  confidence?: number | null;
  correctedValue?: string | null;
  kind: StyleCalibrationSignalKind;
  note?: string | null;
  source?: StyleInferenceSource;
  status?: StyleCalibrationSignalRecord['status'];
  updatedAt?: string | null;
  value: string;
}): StyleCalibrationSignalRecord {
  return {
    confidence: clampConfidence(input.confidence ?? null),
    correctedValue: input.correctedValue ?? null,
    id: `style-signal:${input.kind}:${slugSignalValue(input.value)}`,
    kind: input.kind,
    note: input.note ?? null,
    source: input.source ?? 'user_confirmed',
    status: input.status ?? 'confirmed',
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    value: input.value,
  };
}

export function buildStyleItemCalibration(input: {
  itemId: string;
  note?: string | null;
  source?: StyleInferenceSource;
  updatedAt?: string | null;
  wearStatus: StyleItemWearStatus;
}): StyleItemCalibrationRecord {
  return {
    itemId: input.itemId,
    note: input.note ?? null,
    source: input.source ?? 'user_confirmed',
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    wearStatus: input.wearStatus,
  };
}

export function mergeStyleCalibrationSignals(
  existing: StyleCalibrationSignalRecord[],
  next: StyleCalibrationSignalRecord[],
): StyleCalibrationSignalRecord[] {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of next) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((left, right) => left.kind.localeCompare(right.kind) || left.value.localeCompare(right.value));
}

export function mergeStyleItemCalibration(
  existing: StyleItemCalibrationRecord[],
  next: StyleItemCalibrationRecord[],
): StyleItemCalibrationRecord[] {
  const byItem = new Map(existing.map((entry) => [entry.itemId, entry]));
  for (const entry of next) {
    byItem.set(entry.itemId, entry);
  }
  return [...byItem.values()].sort((left, right) => left.itemId.localeCompare(right.itemId));
}

export function getStyleSetupCalibrationWidgetHtml(): string {
  return `
<div id="style-setup-root"></div>
<style>
  :root { color-scheme: light; --ink:#111; --soft:#53565f; --muted:#737780; --line:#e6e6e9; --panel:#fff; --wash:#f6f6f7; --accent:#7c2d3e; --ok:#0f766e; --warn:#a16207; --bad:#b91c1c; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  * { box-sizing: border-box; }
  body { margin:0; background:transparent; color:var(--ink); font-family:inherit; }
  .ss-card { border:1px solid var(--line); border-radius:14px; background:var(--panel); overflow:hidden; }
  .ss-head { padding:18px 20px 16px; border-bottom:1px solid var(--line); }
  .ss-kicker { color:var(--muted); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; }
  .ss-title { margin:5px 0 0; font-size:21px; line-height:1.2; font-weight:700; }
  .ss-body { padding:18px 20px 20px; display:grid; gap:16px; }
  .ss-grid { display:grid; gap:10px; grid-template-columns:repeat(4,minmax(0,1fr)); }
  .ss-meter { border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--wash); min-width:0; }
  .ss-meter b { display:block; font-size:18px; line-height:1.2; }
  .ss-meter span { display:block; color:var(--muted); font-size:12px; line-height:1.25; margin-top:3px; }
  .ss-section { display:grid; gap:8px; }
  .ss-section h3 { margin:0; font-size:14px; line-height:1.25; }
  .ss-list { display:grid; gap:7px; margin:0; padding:0; list-style:none; }
  .ss-list li { border:1px solid var(--line); border-radius:8px; padding:9px 10px; font-size:13px; color:var(--soft); line-height:1.35; }
  .ss-signal { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--line); border-radius:999px; padding:6px 9px; font-size:12px; color:var(--soft); margin:0 6px 6px 0; }
  .ss-prompts { display:grid; gap:8px; }
  .ss-prompt { border:1px solid var(--line); border-radius:8px; padding:10px; background:#fff; }
  .ss-prompt b { display:block; font-size:13px; margin-bottom:3px; }
  .ss-prompt p { margin:0; color:var(--soft); font-size:13px; line-height:1.35; }
  .ss-replies { margin-top:8px !important; color:var(--soft); font-size:12px !important; line-height:1.35; }
  .ss-next { border-left:4px solid var(--accent); background:#fbf7f8; border-radius:8px; padding:12px; }
  .ss-next b { display:block; font-size:14px; margin-bottom:4px; }
  .ss-next span { display:block; color:var(--soft); font-size:13px; line-height:1.4; }
  @media (max-width: 560px) { .ss-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .ss-head,.ss-body { padding-left:14px; padding-right:14px; } }
</style>
<script>
(() => {
  const meta = window.openai?.toolOutput?._meta || window.openai?.widgetProps?._meta || {};
  const data = meta.styleCalibration || {};
  const pct = (v) => Math.round((Number(v) || 0) * 100) + "%";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  const list = (items, empty) => (items && items.length ? items.map((item) => "<li>" + esc(item) + "</li>").join("") : "<li>" + esc(empty) + "</li>");
  const signals = (items, empty) => (items && items.length ? items.slice(0, 10).map((item) => '<span class="ss-signal">' + esc(item.kind).replace(/_/g, " ") + ': ' + esc(item.value) + '</span>').join("") : '<span class="ss-signal">' + esc(empty) + '</span>');
  const prompts = (items) => (items && items.length ? items.slice(0, 4).map((item) => {
    const options = (item.responseOptions || []).slice(0, 3).map((option) => esc(option.label)).join(" / ");
    return '<div class="ss-prompt"><b>' + esc(item.label) + '</b><p>' + esc(item.question) + '</p>' + (options ? '<p class="ss-replies">Suggested reply: ' + options + '</p>' : '') + '</div>';
  }).join("") : '<div class="ss-prompt"><b>Use Style now</b><p>Fluent will keep confidence visible and ask for corrections only when needed.</p></div>');
  const setupTitle = () => {
    const state = data.closetStatus?.state;
    if (state === "no_style_state" || state === "empty_closet_started") return "Start with a few real closet anchors.";
    if (state === "closet_imported_unconfirmed") return "Confirm what still belongs in your closet.";
    if (state === "style_calibrated") return "Style is calibrated enough to use normally.";
    return "Confirm the strongest closet-suggested signals.";
  };
  const c = data.confidenceBreakdown || {};
  const root = document.getElementById("style-setup-root");
  root.innerHTML = '<article class="ss-card">' +
    '<header class="ss-head"><div class="ss-kicker">Style setup</div><h2 class="ss-title">' + esc(setupTitle()) + '</h2></header>' +
    '<div class="ss-body">' +
      '<div class="ss-grid">' +
        '<div class="ss-meter"><b>' + esc(data.activeItemCount ?? 0) + '</b><span>active evidence items</span></div>' +
        '<div class="ss-meter"><b>' + pct(c.closetCoverageConfidence) + '</b><span>closet evidence</span></div>' +
        '<div class="ss-meter"><b>' + pct(c.visualEvidenceConfidence) + '</b><span>visual evidence</span></div>' +
        '<div class="ss-meter"><b>' + pct(c.preferenceCalibrationConfidence) + '</b><span>confirmed taste</span></div>' +
      '</div>' +
      '<section class="ss-section"><h3>Confirmed taste</h3><div>' + signals(data.confirmedStyleSignals, "No confirmed taste signals yet") + '</div></section>' +
      '<section class="ss-section"><h3>What Fluent is guessing</h3><div>' + signals(data.inferredStyleSignals, "No strong closet pattern yet") + '</div></section>' +
      '<section class="ss-section"><h3>Evidence gaps</h3><ul class="ss-list">' + list(data.unresolvedQuestions, "No high-priority evidence gap right now") + '</ul></section>' +
      '<section class="ss-section"><h3>Quick calibration</h3><div class="ss-prompts">' + prompts(data.calibrationPrompts) + '</div></section>' +
      '<section class="ss-next"><b>' + esc(data.suggestedNextAction?.label || "Use Style now") + '</b><span>' + esc(data.suggestedNextAction?.rationale || "Fluent will keep confidence visible and calibrate as stronger evidence arrives.") + '</span></section>' +
    '</div>' +
  '</article>';
})();
</script>`;
}

function buildConfidenceBreakdown(input: {
  confirmedSignalCount: number;
  evidenceItems: StyleItemRecord[];
  inferredSignalCount: number;
  itemCountWithDeliverablePhoto: number;
  itemCountWithProfile: number;
  profile: StyleProfileRecord;
}): StyleConfidenceBreakdown {
  const activeCount = input.evidenceItems.length;
  const categoryCount = new Set(input.evidenceItems.map((item) => item.category).filter(Boolean)).size;
  const baseCoverage =
    activeCount === 0 ? 0 : activeCount <= 3 ? 0.22 : activeCount <= 9 ? 0.48 : activeCount <= 19 ? 0.72 : 0.88;
  const categoryBoost = Math.min(0.12, categoryCount * 0.03);
  const closetCoverageConfidence = clampConfidence(
    input.profile.raw.importedClosetAt && !input.profile.raw.importedClosetConfirmed
      ? Math.min(0.55, baseCoverage + categoryBoost)
      : baseCoverage + categoryBoost,
  );
  const visualEvidenceConfidence = clampConfidence(
    ratio(input.itemCountWithDeliverablePhoto, activeCount) * 0.8 + ratio(input.itemCountWithProfile, activeCount) * 0.2,
  );
  const preferenceCalibrationConfidence = clampConfidence(
    Math.min(0.9, input.confirmedSignalCount * 0.16 + (input.profile.raw.tasteCalibrationConfirmed ? 0.25 : 0)),
  );
  const rawShoppingDecisionConfidence =
    closetCoverageConfidence * 0.42 + visualEvidenceConfidence * 0.24 + preferenceCalibrationConfidence * 0.34;
  const shoppingDecisionConfidence = clampConfidence(
    preferenceCalibrationConfidence === 0
      ? Math.min(rawShoppingDecisionConfidence, closetCoverageConfidence >= 0.72 ? 0.58 : 0.5)
      : rawShoppingDecisionConfidence,
  );
  return {
    closetCoverageConfidence,
    preferenceCalibrationConfidence,
    shoppingDecisionConfidence,
    visualEvidenceConfidence,
  };
}

function deriveSetupState(input: {
  activeItemCount: number;
  confirmedSignalCount: number;
  confidenceBreakdown: StyleConfidenceBreakdown;
  inferredSignalCount: number;
  profile: StyleProfileRecord;
}): StyleSetupState {
  if (input.profile.raw.importedClosetAt && !input.profile.raw.importedClosetConfirmed && input.activeItemCount > 0) {
    return 'closet_imported_unconfirmed';
  }
  if (input.activeItemCount === 0) {
    return input.confirmedSignalCount > 0 || input.profile.updatedAt ? 'empty_closet_started' : 'no_style_state';
  }
  if (input.activeItemCount < 3) {
    return 'empty_closet_started';
  }
  if (input.activeItemCount < 5) {
    return 'starter_closet_ready';
  }
  if (input.activeItemCount < 10) {
    return input.confirmedSignalCount > 0 ? 'preference_partially_confirmed' : 'starter_closet_ready';
  }
  if (input.confidenceBreakdown.preferenceCalibrationConfidence >= 0.68 && input.confidenceBreakdown.closetCoverageConfidence >= 0.72) {
    return 'style_calibrated';
  }
  if (input.confirmedSignalCount > 0) {
    return 'preference_partially_confirmed';
  }
  if (input.inferredSignalCount > 0) {
    return 'preference_inferred';
  }
  return 'closet_evidence_ready';
}

function buildPurchaseReadiness(
  state: StyleSetupState,
  confidence: StyleConfidenceBreakdown,
  activeItemCount: number,
  excludedItemCount: number,
): StyleCalibrationReadiness {
  const notes: string[] = [];
  if (excludedItemCount > 0) {
    notes.push(`${excludedItemCount} active item(s) marked stale or accidental were excluded from confidence.`);
  }
  if (state === 'no_style_state' || activeItemCount === 0) {
    return {
      basis: 'no_closet',
      label: 'I can judge the item, but I do not know your wardrobe yet.',
      notes: [...notes, 'Purchase analysis should focus on the candidate item and ask for starter closet evidence before making wardrobe-fit claims.'],
      ready: false,
      readinessLevel: 'not_ready',
    };
  }
  if (state === 'empty_closet_started') {
    return {
      basis: 'thin_closet',
      label: 'Early closet signal only.',
      notes: [...notes, 'Ask for at least three starter closet anchors before making wardrobe-fit claims; five anchors makes the read sharper.'],
      ready: false,
      readinessLevel: 'not_ready',
    };
  }
  if (state === 'closet_imported_unconfirmed') {
    const ready = confidence.shoppingDecisionConfidence >= 0.45;
    return {
      basis: 'imported_unconfirmed',
      label: ready
        ? 'Imported closet evidence supports provisional purchase reads.'
        : 'Imported closet evidence is too thin for wardrobe-fit claims.',
      notes: [
        ...notes,
        ready
          ? 'Say “your imported closet suggests” until the user confirms active ownership and taste.'
          : 'Ask the user to confirm active imported items or add starter anchors before making wardrobe-fit claims.',
      ],
      ready,
      readinessLevel: ready ? 'provisional' : 'not_ready',
    };
  }
  if (state === 'starter_closet_ready') {
    const starterNote = activeItemCount < 5
      ? 'Cautious read: three to four anchors are enough for a provisional verdict; add five-plus active items for a sharper read.'
      : 'Recommendations can compare against anchor items, but should keep confidence visible.';
    return {
      basis: 'starter_closet',
      label: 'Starter closet ready for cautious purchase reads.',
      notes: [...notes, starterNote],
      ready: true,
      readinessLevel: 'provisional',
    };
  }
  if (state === 'closet_evidence_ready') {
    return {
      basis: 'starter_closet',
      label: 'Closet evidence supports provisional purchase reads.',
      notes: [...notes, 'Closet evidence exists, but no strong inferred pattern or confirmed taste is available yet.'],
      ready: true,
      readinessLevel: 'provisional',
    };
  }
  if (state === 'preference_inferred') {
    return {
      basis: 'closet_inferred',
      label: 'Closet evidence supports provisional purchase reads.',
      notes: [...notes, 'Use “your closet suggests” rather than “you prefer.” Taste is not confirmed yet.'],
      ready: true,
      readinessLevel: 'provisional',
    };
  }
  if (state === 'preference_partially_confirmed') {
    return {
      basis: 'partially_confirmed',
      label: 'Some taste is confirmed; keep calibrating.',
      notes: [...notes, 'Strong claims should cite confirmed signals or visible closet evidence.'],
      ready: true,
      readinessLevel: 'provisional',
    };
  }
  return {
    basis: 'confirmed_preferences',
    label: 'Style is calibrated enough for confident purchase reads.',
    notes,
    ready: true,
    readinessLevel: 'ready',
  };
}

function inferSignalsFromCloset(
  items: StyleItemRecord[],
  storedSignals: StyleCalibrationSignalRecord[],
): StyleCalibrationSignalRecord[] {
  const suppressedSignalKeys = new Set<string>();
  const suppressedSignalKinds = new Set<StyleCalibrationSignalKind>();
  for (const entry of storedSignals) {
    if (entry.source !== 'user_confirmed') continue;
    if (entry.status !== 'confirmed' && entry.status !== 'corrected' && entry.status !== 'rejected') continue;
    suppressedSignalKeys.add(signalKey(entry.kind, entry.value));
    if (entry.correctedValue) {
      suppressedSignalKeys.add(signalKey(entry.kind, entry.correctedValue));
    }
    if (entry.status === 'confirmed' || entry.status === 'corrected') {
      suppressedSignalKinds.add(entry.kind);
    }
  }
  const storedInferred = storedSignals.filter(
    (entry) =>
      entry.status === 'inferred' &&
      entry.source !== 'user_confirmed' &&
      !suppressedSignalKinds.has(entry.kind) &&
      !suppressedSignalKeys.has(signalKey(entry.kind, entry.value)),
  );
  const colorSignals = topCounts(items.map((item) => item.colorFamily).filter(isString), 'color');
  const silhouetteSignals = topCounts(items.map((item) => item.profile?.raw.silhouette).filter(isString), 'silhouette');
  const generatedSignals = [...colorSignals, ...silhouetteSignals].filter(
    (entry) => !suppressedSignalKinds.has(entry.kind) && !suppressedSignalKeys.has(signalKey(entry.kind, entry.value)),
  );
  return mergeStyleCalibrationSignals(storedInferred, generatedSignals).slice(0, 10);
}

function confirmedSignalsFromProfile(profile: StyleProfileRecord): StyleCalibrationSignalRecord[] {
  const explicit = profile.raw.calibrationSignals
    .filter((entry) => (entry.status === 'confirmed' || entry.status === 'corrected') && entry.source === 'user_confirmed')
    .map((entry) =>
      entry.status === 'corrected' && entry.correctedValue
        ? {
            ...entry,
            value: entry.correctedValue,
          }
        : entry,
    );
  return explicit.filter((entry) => entry.status !== 'rejected').slice(0, 16);
}

function buildUnresolvedQuestions(input: {
  calibrationPrompts: StyleCalibrationPromptRecord[];
  confirmedSignalCount: number;
  evidenceItems: StyleItemRecord[];
  profile: StyleProfileRecord;
}): string[] {
  const questions: string[] = [];
  if (input.evidenceItems.length === 0) {
    questions.push('Add one real anchor item from a photo, link, or short description.');
  } else if (input.evidenceItems.length < 5) {
    questions.push('Which few missing pieces best represent what you wear most?');
  }
  if (
    input.profile.raw.importedClosetAt &&
    !input.profile.raw.importedClosetConfirmed &&
    !input.calibrationPrompts.some((prompt) => prompt.id === 'confirm-imported-closet-active')
  ) {
    questions.push('Which imported items are actively worn versus stale or accidental?');
  }
  if (input.profile.raw.budgetProfile == null) {
    questions.push('Budget range is still unknown for everyday buys and investment pieces.');
  }
  if (input.confirmedSignalCount === 0) {
    questions.push('No taste signal has been explicitly confirmed yet.');
  }
  return questions.slice(0, 4);
}

function buildSuggestedNextAction(input: {
  confirmedSignalCount: number;
  evidenceItems: StyleItemRecord[];
  profile: StyleProfileRecord;
  state: StyleSetupState;
  unresolvedQuestions: string[];
}) {
  if (input.evidenceItems.length === 0) {
    return {
      label: 'Add 3 starter closet anchors',
      rationale: 'Three real items are enough for a provisional purchase read; five makes it sharper without turning setup into homework.',
      toolName: 'style_add_starter_closet_item',
    };
  }
  if (input.profile.raw.importedClosetAt && !input.profile.raw.importedClosetConfirmed) {
    return {
      label: 'Confirm imported closet evidence',
      rationale: 'Imported ownership is evidence, not taste. Confirm active/stale items before Fluent makes strong claims.',
      toolName: 'style_record_calibration_response',
    };
  }
  if (input.evidenceItems.length < 5) {
    const belowMinimum = input.evidenceItems.length < 3;
    return {
      label: belowMinimum ? 'Add another starter anchor' : 'Add one more anchor when easy',
      rationale: belowMinimum
        ? 'Style needs at least three real pieces before it should make wardrobe-fit claims.'
        : 'Style can run a provisional purchase read now; five anchors makes the read sharper.',
      toolName: 'style_add_starter_closet_item',
    };
  }
  if (input.profile.raw.budgetProfile == null) {
    return {
      label: 'Set a budget range',
      rationale: 'One budget range helps Style separate everyday buys from investment pieces.',
      toolName: 'style_record_calibration_response',
    };
  }
  if (input.confirmedSignalCount === 0) {
    return {
      label: 'Confirm one closet-suggested signal',
      rationale: 'One confirmed or corrected signal is more useful than a generic quiz.',
      toolName: 'style_record_calibration_response',
    };
  }
  if (input.unresolvedQuestions.length > 0) {
    return {
      label: 'Resolve one evidence gap',
      rationale: 'A single high-confidence correction improves future Style calls more than a long intake form.',
      toolName: 'style_record_calibration_response',
    };
  }
  return {
    label: input.state === 'style_calibrated' ? 'Use Style normally' : 'Run a purchase read and calibrate opportunistically',
    rationale: 'Fluent can keep confidence visible and ask for corrections only when a decision depends on them.',
    toolName: null,
  };
}

function buildCalibrationPrompts(input: {
  confirmedSignalCount: number;
  evidenceItems: StyleItemRecord[];
  inferredStyleSignals: StyleCalibrationSignalRecord[];
  profile: StyleProfileRecord;
}): StyleCalibrationPromptRecord[] {
  const prompts: StyleCalibrationPromptRecord[] = [];
  if (input.evidenceItems.length === 0) {
    prompts.push({
      id: 'starter-anchor-items',
      kind: 'starter_item',
      label: 'Add 3 starter anchors',
      question: 'Add three to five items you actually wear often: photos, product links, or short descriptions.',
      rationale: 'Three real anchors unlock a provisional purchase read; five makes it sharper.',
      responseOptions: [
        { label: 'Add description/link/photo', requiresFreeText: 'item_description', source: null, status: null, value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'style_add_starter_closet_item',
    });
  } else if (input.evidenceItems.length < 5) {
    const belowMinimum = input.evidenceItems.length < 3;
    prompts.push({
      id: 'starter-anchor-items-more',
      kind: 'starter_item',
      label: belowMinimum ? 'Add another starter anchor' : 'Add one more anchor when easy',
      question: belowMinimum
        ? 'Add another item you actually wear often: photo, product link, or a short description.'
        : 'Style can run a provisional purchase read now. Add one or two more often-worn items when easy for a sharper read.',
      rationale: belowMinimum
        ? 'Style needs at least three real anchors before making wardrobe-fit claims.'
        : 'Five real anchors improves the read without making setup a questionnaire.',
      responseOptions: [
        { label: 'Add description/link/photo', requiresFreeText: 'item_description', source: null, status: null, value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'style_add_starter_closet_item',
    });
  }

  for (const signal of input.inferredStyleSignals.slice(0, 3)) {
    prompts.push({
      id: `confirm-${signal.id.replace(/[^a-z0-9:-]+/gi, '-')}`,
      kind: 'confirm_signal',
      label: `Confirm ${signal.kind.replace(/_/g, ' ')}`,
      question: `Your closet suggests ${signal.value}. Is that intentional, wrong, or just ownership?`,
      rationale: 'Confirming or correcting a closet-derived pattern turns evidence into calibrated taste.',
      responseOptions: [
        { label: 'Confirm', requiresFreeText: null, source: 'user_confirmed', status: 'confirmed', value: signal.value },
        { label: 'Correct with text', requiresFreeText: 'corrected_value', source: 'user_confirmed', status: 'corrected', value: signal.value },
        { label: 'Not me', requiresFreeText: null, source: 'user_confirmed', status: 'rejected', value: signal.value },
      ],
      signal: {
        id: signal.id,
        kind: signal.kind,
        source: signal.source,
        value: signal.value,
      },
      toolName: 'style_record_calibration_response',
    });
  }

  if (input.profile.raw.importedClosetAt && !input.profile.raw.importedClosetConfirmed) {
    prompts.push({
      id: 'confirm-imported-closet-active',
      kind: 'import_review',
      label: 'Confirm imported items',
      question: 'Which imported items are actively worn versus stale or accidental?',
      rationale: 'Imported ownership is useful evidence, but not calibrated taste.',
      responseOptions: [
        { label: 'Mark active/stale items', requiresFreeText: 'item_selection', source: null, status: null, value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'style_record_calibration_response',
    });
  }

  if (input.confirmedSignalCount === 0) {
    prompts.push({
      id: 'first-hard-avoid-or-fit',
      kind: 'constraint',
      label: 'Save one constraint',
      question: 'What is one hard avoid or fit rule Fluent should remember before judging purchases?',
      rationale: 'A single confirmed avoid or fit rule prevents overconfident shopping advice.',
      responseOptions: [
        { label: 'Save hard avoid', requiresFreeText: 'preference_value', source: 'user_confirmed', status: 'confirmed', value: null },
        { label: 'Save fit rule', requiresFreeText: 'preference_value', source: 'user_confirmed', status: 'confirmed', value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'style_record_calibration_response',
    });
  }

  if (!input.profile.raw.budgetProfile) {
    prompts.push({
      id: 'budget-range',
      kind: 'budget',
      label: 'Set budget range',
      question: 'What budget range should Style assume for everyday buys and investment pieces?',
      rationale: 'Budget context changes shopping advice without requiring a long style quiz.',
      responseOptions: [
        { label: 'Save budget', requiresFreeText: 'budget_value', source: null, status: null, value: null },
        { label: 'Skip for now', requiresFreeText: null, source: null, status: null, value: null },
      ],
      signal: null,
      toolName: 'style_record_calibration_response',
    });
  }

  if (prompts.length === 0) {
    prompts.push({
      id: 'opportunistic-calibration',
      kind: 'opportunistic',
      label: 'Calibrate during purchases',
      question: 'Use Style normally; Fluent can ask one correction only when a recommendation depends on it.',
      rationale: 'Calibration should stay useful in the moment instead of becoming homework.',
      responseOptions: [{ label: 'Continue with visible confidence', requiresFreeText: null, source: null, status: null, value: null }],
      signal: null,
      toolName: null,
    });
  }

  return prompts.slice(0, 5);
}

function countBy<T>(values: T[], getKey: (value: T) => string): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = getKey(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));
}

function topCounts(values: string[], kind: StyleCalibrationSignalKind): StyleCalibrationSignalRecord[] {
  return countBy(values, (value) => value.toLowerCase())
    .filter((entry) => entry.count >= 2)
    .slice(0, 3)
    .map((entry) =>
      buildStyleCalibrationSignal({
        confidence: Math.min(0.72, 0.34 + entry.count * 0.08),
        kind,
        note: `Seen across ${entry.count} active closet items.`,
        source: 'closet_inferred',
        status: 'inferred',
        value: entry.category,
      }),
    );
}

function signalKey(kind: StyleCalibrationSignalKind, value: string): string {
  return `${kind}:${slugSignalValue(value)}`;
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? Number((numerator / denominator).toFixed(2)) : 0;
}

function clampConfidence(value: number | null): number {
  if (value == null || !Number.isFinite(value)) {
    return 0;
  }
  return Number(Math.max(0, Math.min(1, value)).toFixed(2));
}

function slugSignalValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || crypto.randomUUID();
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
