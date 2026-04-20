import { scoreVoilaCandidate } from './browser/retailers/voila-profile.mjs';

export function buildInCartSyncCandidates(itemRun, retailer = 'voila') {
  return Array.isArray(itemRun?.items)
    ? itemRun.items
        .filter((item) => item?.added === true && typeof item?.itemKey === 'string' && item.itemKey.trim())
        .map((item) => ({
          action_status: 'in_cart',
          item_key: item.itemKey.trim(),
          metadata: {
            browserFlow: {
              productBrand: item.productBrand ?? null,
              productKey: item.productKey ?? null,
              productTitle: item.productTitle ?? null,
              productUrl: item.productUrl ?? null,
              quantityOutcome: item.quantityOutcome ?? null,
              selectedQuery: item.selectedQuery ?? null,
            },
            kind: 'browser_cart_sync',
            retailer,
          },
          notes:
            item.quantityOutcome === 'partial'
              ? `Added to ${retailer} cart; quantity may need review.`
              : `Added to ${retailer} cart.`,
          response_mode: 'ack',
        }))
    : [];
}

export function buildCartStateSyncPlan({ actions, cartItems, groceryPlan, retailer = 'voila' } = {}) {
  const normalizedRetailer = String(retailer || 'voila').trim().toLowerCase() || 'voila';
  const existingActions = Array.isArray(actions) ? actions : [];
  const liveCartItems = Array.isArray(cartItems) ? cartItems : [];
  const planItems = collectTrackablePlanItems(groceryPlan);
  const actionsByItemKey = new Map(
    existingActions
      .filter((action) => typeof action?.itemKey === 'string' && action.itemKey.trim())
      .map((action) => [action.itemKey.trim(), action]),
  );
  const eligiblePlanItems = planItems.filter((item) => {
    const existingAction = actionsByItemKey.get(item.itemKey) ?? null;
    return existingAction == null || isBrowserCartSyncAction(existingAction);
  });
  const desiredByItemKey = new Map();
  const unmatchedCartItems = [];
  const planItemsByKey = new Map(eligiblePlanItems.map((item) => [item.itemKey, item]));

  for (const cartItem of liveCartItems) {
    const cartTitle = String(cartItem?.title || '').trim();
    if (!cartTitle) {
      continue;
    }
    const exactActionMatch = findExistingCartIdentityMatch(cartItem, actionsByItemKey, planItemsByKey);
    const match =
      exactActionMatch ??
      findBestCartPlanMatch(cartItem, eligiblePlanItems, actionsByItemKey);
    if (!match) {
      unmatchedCartItems.push(cartTitle);
      continue;
    }
    desiredByItemKey.set(match.item.itemKey, buildDesiredCartAction(match, cartItem, normalizedRetailer));
  }

  const upserts = [];
  for (const desired of desiredByItemKey.values()) {
    const existingAction = actionsByItemKey.get(desired.item_key) ?? null;
    if (!matchesDesiredCartState(existingAction, desired)) {
      upserts.push(desired);
    }
  }

  const deletes = [];
  for (const action of existingActions) {
    if (!isBrowserCartSyncAction(action)) {
      continue;
    }
    if (!['in_cart', 'substituted'].includes(String(action.actionStatus || '').trim())) {
      continue;
    }
    if (desiredByItemKey.has(action.itemKey)) {
      continue;
    }
    deletes.push({
      item_key: action.itemKey,
    });
  }

  return {
    deletes,
    summary: {
      deleteCount: deletes.length,
      eligiblePlanItemCount: eligiblePlanItems.length,
      matchedPlanCount: desiredByItemKey.size,
      unmatchedCartCount: unmatchedCartItems.length,
      upsertCount: upserts.length,
    },
    unmatchedCartItems,
    upserts,
  };
}

function collectTrackablePlanItems(groceryPlan) {
  const actionableItems = Array.isArray(groceryPlan?.raw?.items) ? groceryPlan.raw.items : [];
  const resolvedItems = Array.isArray(groceryPlan?.raw?.resolvedItems) ? groceryPlan.raw.resolvedItems : [];
  const seen = new Set();
  const collected = [];
  for (const item of [...actionableItems, ...resolvedItems]) {
    const itemKey = typeof item?.itemKey === 'string' ? item.itemKey.trim() : '';
    if (!itemKey || seen.has(itemKey)) {
      continue;
    }
    seen.add(itemKey);
    collected.push({
      ...item,
      itemKey,
      allowedSubstituteQueries: compactStrings(item?.allowedSubstituteQueries),
      avoidBrands: compactStrings(item?.avoidBrands),
      blockedSubstituteTerms: compactStrings(item?.blockedSubstituteTerms),
      preferredBrands: compactStrings(item?.preferredBrands),
    });
  }
  return collected;
}

function findBestCartPlanMatch(cartItem, planItems, actionsByItemKey) {
  const cartTitle = String(cartItem?.title || '').trim();
  const cartProductKey = normalizeText(String(cartItem?.productKey || '').trim());
  const cartProductUrl = normalizeText(String(cartItem?.productUrl || '').trim());
  const candidate = {
    brand: null,
    onSale: false,
    title: cartTitle,
  };
  let best = null;
  let runnerUp = null;

  for (const item of planItems) {
    const directMatch = scoreQueriesAgainstCart(candidate, item, compactStrings([item?.name]));
    const substituteMatch = scoreQueriesAgainstCart(candidate, item, item.allowedSubstituteQueries);
    const chosenMatch = pickBestMatchKind(directMatch, substituteMatch);
    if (!chosenMatch) {
      continue;
    }

    const existingAction = actionsByItemKey.get(item.itemKey) ?? null;
    const exactIdentityBonus =
      cartProductKey && normalizeText(existingAction?.metadata?.browserFlow?.productKey) === cartProductKey
        ? 20
        : cartProductUrl && normalizeText(existingAction?.metadata?.browserFlow?.productUrl) === cartProductUrl
          ? 20
          : 0;
    const stabilityBonus =
      isBrowserCartSyncAction(existingAction) && normalizeText(existingAction.substituteDisplayName) === normalizeText(cartTitle)
        ? 0.5
        : 0;
    const score = chosenMatch.score + stabilityBonus + exactIdentityBonus;
    const candidateMatch = {
      item,
      kind: chosenMatch.kind,
      query: chosenMatch.query,
      score,
    };
    if (!best || score > best.score) {
      runnerUp = best;
      best = candidateMatch;
    } else if (!runnerUp || score > runnerUp.score) {
      runnerUp = candidateMatch;
    }
  }

  if (best && runnerUp && best.score < 20 && best.score - runnerUp.score < 1.5) {
    return null;
  }

  return best;
}

function scoreQueriesAgainstCart(candidate, item, queries) {
  let best = null;
  for (const query of compactStrings(queries)) {
    const score = scoreVoilaCandidate(item, query, candidate);
    if (!best || score > best.score) {
      best = { query, score };
    }
  }
  return best;
}

function pickBestMatchKind(directMatch, substituteMatch) {
  const directScore = directMatch?.score ?? Number.NEGATIVE_INFINITY;
  const substituteScore = substituteMatch?.score ?? Number.NEGATIVE_INFINITY;
  if (directScore < 8 && substituteScore < 8) {
    return null;
  }
  if (directScore >= substituteScore) {
    return {
      kind: 'in_cart',
      query: directMatch.query,
      score: directScore,
    };
  }
  return {
    kind: 'substituted',
    query: substituteMatch.query,
    score: substituteScore,
  };
}

function matchesDesiredCartState(existingAction, desired) {
  if (!existingAction || !isBrowserCartSyncAction(existingAction)) {
    return false;
  }
  if (existingAction.actionStatus !== desired.action_status) {
    return false;
  }
  const existingBrowserFlow = existingAction.metadata?.browserFlow ?? {};
  const desiredBrowserFlow = desired.metadata?.browserFlow ?? {};
  return (
    normalizeText(existingAction.substituteDisplayName) === normalizeText(desired.substitute_display_name) &&
    normalizeText(existingBrowserFlow.productKey) === normalizeText(desiredBrowserFlow.productKey) &&
    normalizeText(existingBrowserFlow.productUrl) === normalizeText(desiredBrowserFlow.productUrl)
  );
}

function isBrowserCartSyncAction(action) {
  const metadata = action?.metadata;
  return typeof metadata === 'object' && metadata != null && metadata.kind === 'browser_cart_sync';
}

function compactStrings(value) {
  return Array.isArray(value)
    ? value.map((entry) => String(entry || '').trim()).filter(Boolean)
    : [];
}

function findExistingCartIdentityMatch(cartItem, actionsByItemKey, planItemsByKey) {
  const cartProductKey = normalizeText(cartItem?.productKey);
  const cartProductUrl = normalizeText(cartItem?.productUrl);
  if (!cartProductKey && !cartProductUrl) {
    return null;
  }

  for (const action of actionsByItemKey.values()) {
    if (!isBrowserCartSyncAction(action)) {
      continue;
    }
    const browserFlow = action.metadata?.browserFlow ?? {};
    const actionProductKey = normalizeText(browserFlow.productKey);
    const actionProductUrl = normalizeText(browserFlow.productUrl);
    const sameProduct =
      (cartProductKey && actionProductKey === cartProductKey) ||
      (cartProductUrl && actionProductUrl === cartProductUrl);
    if (!sameProduct) {
      continue;
    }
    const item = planItemsByKey.get(action.itemKey) ?? null;
    if (!item) {
      continue;
    }
    return {
      item,
      kind: action.actionStatus === 'substituted' ? 'substituted' : 'in_cart',
      query: browserFlow.selectedQuery ?? null,
      score: 100,
    };
  }

  return null;
}

function buildDesiredCartAction(match, cartItem, retailer) {
  const cartTitle = String(cartItem?.title || '').trim();
  return {
    action_status: match.kind,
    item_key: match.item.itemKey,
    metadata: {
      browserFlow: {
        cartTitle,
        matchedQuery: match.query,
        matchKind: match.kind,
        matchScore: Number(match.score.toFixed(2)),
        productKey: typeof cartItem?.productKey === 'string' && cartItem.productKey.trim() ? cartItem.productKey.trim() : null,
        productUrl: typeof cartItem?.productUrl === 'string' && cartItem.productUrl.trim() ? cartItem.productUrl.trim() : null,
      },
      kind: 'browser_cart_sync',
      retailer,
    },
    notes:
      match.kind === 'substituted'
        ? `Matched to ${retailer} cart substitution: ${cartTitle}.`
        : `Confirmed in ${retailer} cart via browser sync.`,
    response_mode: 'ack',
    ...(match.kind === 'substituted' ? { substitute_display_name: cartTitle } : {}),
  };
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
