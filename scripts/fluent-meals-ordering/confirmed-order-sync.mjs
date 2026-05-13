const NON_FOOD_PATTERNS = [
  /\bdelivery\b/i,
  /\bdiscount\b/i,
  /\bfee\b/i,
  /\bpass\b/i,
  /\bservice charge\b/i,
  /\bsubtotal\b/i,
  /\btax\b/i,
  /\btip\b/i,
  /\btotal savings\b/i,
  /\btotal\b/i,
  /\bbag\b/i,
];

const DROP_TOKENS = new Set([
  'fresh',
  'frozen',
  'large',
  'medium',
  'small',
  'organic',
  'pack',
  'packs',
  'size',
]);

export function normalizeComparableText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(token) {
  if (token.endsWith('ies') && token.length > 3) return `${token.slice(0, -3)}y`;
  if (token.endsWith('oes') && token.length > 3) return token.slice(0, -2);
  if (token.endsWith('s') && !token.endsWith('ss') && token.length > 3) return token.slice(0, -1);
  return token;
}

function tokenize(value) {
  return normalizeComparableText(value)
    .split(' ')
    .map(singularize)
    .filter((token) => token && !DROP_TOKENS.has(token));
}

function uniqueStrings(values) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function buildMatchKeys(...values) {
  const keys = new Set();
  for (const value of values) {
    const normalized = normalizeComparableText(value);
    if (!normalized) continue;
    keys.add(normalized);
    const tokens = tokenize(value);
    if (tokens.length > 0) {
      keys.add(tokens.join(' '));
    }
  }
  return Array.from(keys);
}

function scoreMatch(title, candidates) {
  const titleTokens = tokenize(title);
  const titleText = normalizeComparableText(title);
  let best = 0;

  for (const candidate of candidates) {
    const candidateTokens = tokenize(candidate);
    const candidateText = normalizeComparableText(candidate);
    if (!candidateText) continue;
    if (titleText === candidateText) {
      best = Math.max(best, 1);
      continue;
    }

    const shared = candidateTokens.filter((token) => titleTokens.includes(token));
    const overlap = candidateTokens.length > 0 ? shared.length / candidateTokens.length : 0;
    const containment =
      candidateText && (titleText.includes(candidateText) || candidateText.includes(titleText)) ? 0.2 : 0;
    best = Math.max(best, Math.min(0.99, overlap + containment));
  }

  return best;
}

export function isNonFoodRetailerLine(title) {
  const text = String(title || '').trim();
  if (!text) return true;
  return NON_FOOD_PATTERNS.some((pattern) => pattern.test(text));
}

export function collapseConfirmedOrderLines(lines) {
  const collapsed = new Map();
  for (const line of Array.isArray(lines) ? lines : []) {
    const title = String(line?.title || line?.displayName || '').trim();
    if (!title) continue;
    const key = normalizeComparableText(title);
    const current = collapsed.get(key);
    if (current) {
      current.quantity += Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : 1;
      current.rawTitles.push(title);
      continue;
    }
    collapsed.set(key, {
      title,
      quantity: Number.isFinite(Number(line?.quantity)) ? Number(line.quantity) : 1,
      rawTitles: [title],
    });
  }
  return Array.from(collapsed.values());
}

function buildExportContexts(exportData) {
  return (Array.isArray(exportData?.items) ? exportData.items : []).map((item) => ({
    name: String(item?.name || '').trim(),
    matchStrings: uniqueStrings([
      item?.name,
      item?.searchQuery,
      ...(Array.isArray(item?.allowedSubstituteQueries) ? item.allowedSubstituteQueries : []),
    ]),
  }));
}

function buildGroceryContexts(groceryPlan) {
  return (Array.isArray(groceryPlan?.raw?.items) ? groceryPlan.raw.items : []).map((item) => ({
    itemKey: item.itemKey,
    displayName: item.name,
    canonicalItemKey: item.canonicalItemKey || null,
    matchStrings: uniqueStrings([
      item.name,
      item.normalizedName,
      item.canonicalItemKey,
      ...(Array.isArray(item.allowedSubstituteQueries) ? item.allowedSubstituteQueries : []),
    ]),
  }));
}

function findBestContextMatch(line, contexts, threshold) {
  let best = null;
  for (const context of contexts) {
    const score = scoreMatch(line.title, context.matchStrings);
    if (!best || score > best.score) {
      best = { context, score };
    }
  }
  return best && best.score >= threshold ? best : null;
}

export function classifyConfirmedOrderSync(input) {
  const confirmedOrder = input?.confirmedOrder || {};
  const exportData = input?.exportData || {};
  const groceryPlan = input?.groceryPlan || {};
  const actions = Array.isArray(input?.actions) ? input.actions : [];

  const collapsedLines = collapseConfirmedOrderLines(confirmedOrder.items);
  const exportContexts = buildExportContexts(exportData);
  const groceryContexts = buildGroceryContexts(groceryPlan);
  const actionMap = new Map(actions.map((action) => [action.itemKey, action]));
  const matchedItemKeys = new Set();

  const matchedPurchased = [];
  const orderedExtras = [];
  const unresolved = [];
  const ignored = [];

  for (const line of collapsedLines) {
    if (isNonFoodRetailerLine(line.title)) {
      ignored.push({
        classification: 'non_food_ignored',
        retailerTitle: line.title,
        notes: 'Ignored non-food or fee line.',
      });
      continue;
    }

    const exportMatch = findBestContextMatch(line, exportContexts, 0.9);
    let groceryMatch =
      exportMatch
        ? findBestContextMatch(
            { title: exportMatch.context.name },
            groceryContexts.filter((context) => !matchedItemKeys.has(context.itemKey)),
            0.9,
          )
        : null;

    if (!groceryMatch) {
      groceryMatch = findBestContextMatch(
        line,
        groceryContexts.filter((context) => !matchedItemKeys.has(context.itemKey)),
        0.9,
      );
    }

    if (groceryMatch) {
      matchedItemKeys.add(groceryMatch.context.itemKey);
      matchedPurchased.push({
        classification: 'matched_purchased',
        itemKey: groceryMatch.context.itemKey,
        displayName: groceryMatch.context.displayName,
        retailerTitle: line.title,
        notes:
          exportMatch && exportMatch.context.name !== groceryMatch.context.displayName
            ? `Matched from current export item ${exportMatch.context.name}.`
            : 'Matched to the current week grocery line.',
      });
      continue;
    }

    const weakPlanMatch = findBestContextMatch(line, groceryContexts, 0.55);
    if (weakPlanMatch) {
      unresolved.push({
        classification: 'retailer_substitution_unresolved',
        retailerTitle: line.title,
        matchedItemKey: weakPlanMatch.context.itemKey,
        notes: `Retailer line may correspond to ${weakPlanMatch.context.displayName}, but the match is not confident enough to auto-sync.`,
      });
      continue;
    }

    orderedExtras.push({
      classification: 'ordered_extra',
      displayName: line.title,
      retailerTitle: line.title,
      notes: 'Confirmed retailer line is outside the current grocery-plan lines.',
    });
  }

  const explicitSkipped = [];
  const missingPlanned = [];
  for (const groceryItem of groceryContexts) {
    if (matchedItemKeys.has(groceryItem.itemKey)) continue;
    const action = actionMap.get(groceryItem.itemKey);
    if (action?.actionStatus === 'skipped') {
      explicitSkipped.push({
        classification: 'explicitly_skipped',
        itemKey: groceryItem.itemKey,
        displayName: groceryItem.displayName,
      });
      continue;
    }
    missingPlanned.push({
      classification: 'missing_from_confirmed_order',
      itemKey: groceryItem.itemKey,
      displayName: groceryItem.displayName,
    });
  }

  return {
    confirmedOrder: {
      orderId: confirmedOrder.orderId || null,
      retailer: confirmedOrder.retailer || null,
      status: confirmedOrder.status || null,
      confirmedAt: confirmedOrder.confirmedAt || null,
      slotWindow: confirmedOrder.slotWindow || null,
    },
    matchedPurchased,
    orderedExtras,
    unresolved,
    ignored,
    missingPlanned,
    explicitSkipped,
    counts: {
      explicitSkippedCount: explicitSkipped.length,
      ignoredCount: ignored.length,
      matchedPurchasedCount: matchedPurchased.length,
      missingPlannedCount: missingPlanned.length,
      orderedExtraCount: orderedExtras.length,
      unresolvedCount: unresolved.length,
    },
  };
}

export function buildConfirmedOrderSyncMetadata(input) {
  const syncSummary = input?.syncSummary || {};
  const confirmedOrder = syncSummary.confirmedOrder || {};
  const counts = syncSummary.counts || {};
  return {
    confirmed_order_sync: {
      retailer: String(input?.retailer || confirmedOrder.retailer || '').trim().toLowerCase(),
      retailerOrderId: String(input?.retailerOrderId || confirmedOrder.orderId || '').trim(),
      weekStart: String(input?.weekStart || '').trim(),
      status: String(input?.status || 'sync_completed'),
      confirmedAt: confirmedOrder.confirmedAt || null,
      syncedAt: input?.syncedAt || new Date().toISOString(),
      matchedPurchasedCount: Number(counts.matchedPurchasedCount || 0),
      orderedExtraCount: Number(counts.orderedExtraCount || 0),
      explicitSkippedCount: Number(counts.explicitSkippedCount || 0),
      missingPlannedCount: Number(counts.missingPlannedCount || 0),
      unresolvedCount: Number(counts.unresolvedCount || 0),
      payloadSummary: syncSummary,
      force: input?.force === true,
    },
  };
}
