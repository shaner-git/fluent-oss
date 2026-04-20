import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  DEFAULT_BROWSER_DATA_DIR,
  DEFAULT_CREDENTIAL_PROVIDER,
  DEFAULT_VERIFICATION_PROVIDER,
  isRetailerVerificationRequiredError,
} from './retailer-auth.mjs';
import { buildDeliveryCalendarCandidate } from './calendar-sync.mjs';
import { buildHostedGroceryExport } from './build-grocery-export.mjs';
import { buildConfirmedOrderSyncMetadata, classifyConfirmedOrderSync } from './confirmed-order-sync.mjs';
import { buildCartStateSyncPlan } from './in-cart-sync.mjs';
import {
  launchBrowserUseCloudCdpAdapter,
  launchBrowserUseLocalCdpAdapter,
} from './browser/browser-use-cdp-adapter.mjs';
import {
  DEFAULT_BROWSER_BACKEND,
  isBrowserUseBackend,
  normalizeBrowserBackend,
} from './browser/browser-backends.mjs';
import { launchPlaywrightAdapter } from './browser/playwright-adapter.mjs';
import { createVoilaRetailerProfile } from './browser/retailers/voila-profile.mjs';
import { FLUENT_MEALS_GROCERY_EXPORT_DIR, FLUENT_MEALS_OVERNIGHT_REPORT_DIR } from './runtime-paths.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDir, '..');
const voilaProfile = createVoilaRetailerProfile();

if (isInvokedDirectly()) {
  await main();
}

export async function runGroceryBrowserFlow(options = {}) {
  const exportPath = resolvePath(
    skillRoot,
    options.exportPath || path.join(FLUENT_MEALS_GROCERY_EXPORT_DIR, `grocery-export-voila-${todayDateStamp()}.json`),
  );
  let exportData = JSON.parse(await fs.readFile(exportPath, 'utf8'));
  const store = String(options.store || exportData.store || 'voila').toLowerCase();
  if (store !== 'voila') {
    throw new Error(`Fluent-owned browser execution is only implemented for voila in this phase. Received: ${store}`);
  }
  const baseUrl = String(options.baseUrl || process.env.FLUENT_BASE_URL || 'https://fluent-mcp.accounts-ca9.workers.dev').replace(/\/$/, '');
  const accessToken = String(options.accessToken || process.env.FLUENT_ACCESS_TOKEN || '').trim();
  const weekStart = String(options.weekStart || exportData?.planMetadata?.weekStart || '').trim() || null;

  const reportPath = resolvePath(
    skillRoot,
    options.reportPath || path.join(FLUENT_MEALS_OVERNIGHT_REPORT_DIR, `browser-flow-${store}-${todayDateStamp()}.json`),
  );
  const headless = parseBoolean(options.headless, false);
  const keepOpen = parseBoolean(options.keepOpen, false);
  const useChrome = parseBoolean(options.useChrome, false);
  const loginTimeoutMs = Number.isFinite(Number(options.loginTimeoutMs)) ? Number(options.loginTimeoutMs) : 120_000;
  const credentialProvider = String(options.credentialProvider || DEFAULT_CREDENTIAL_PROVIDER).toLowerCase();
  const verificationProvider = options.verificationProvider
    ? String(options.verificationProvider).toLowerCase()
    : isBrowserUseBackend(options.browserBackend || DEFAULT_BROWSER_BACKEND)
      ? 'manual'
      : DEFAULT_VERIFICATION_PROVIDER;
  const gogAccount = options.gogAccount ? String(options.gogAccount).trim() : null;
  const retailerAccount = options.retailerAccount ? String(options.retailerAccount).trim() : null;
  const verificationEmail = options.verificationEmail ? String(options.verificationEmail).trim() : null;
  const verificationCode = options.verificationCode ? String(options.verificationCode).trim() : null;
  const orderId = options.orderId ? String(options.orderId).trim() : null;
  const syncConfirmedOrder = parseBoolean(options.syncConfirmedOrder, false) || Boolean(orderId);
  const forceOrderSync = parseBoolean(options.forceOrderSync, false);
  const syncDeliveryCalendar = parseBoolean(options.syncDeliveryCalendar, syncConfirmedOrder);
  const userDataDir = options.userDataDir
    ? resolvePath(skillRoot, options.userDataDir)
    : DEFAULT_BROWSER_DATA_DIR;
  const browserBackend = normalizeBrowserBackend(options.browserBackend);
  const browserUseApiKey = String(options.browserUseApiKey || process.env.BROWSER_USE_API_KEY || '').trim() || null;
  const browserUseApiBaseUrl = String(options.browserUseApiBaseUrl || process.env.BROWSER_USE_API_BASE_URL || '').trim() || null;
  const browserUseSessionId = String(options.browserUseSessionId || '').trim() || null;
  const browserUseProfileId = String(options.browserUseProfileId || '').trim() || null;
  const browserUseProfileName = String(options.browserUseProfileName || '').trim() || null;
  const browserUseProxyCountryCode =
    options.browserUseProxyCountryCode !== undefined
      ? options.browserUseProxyCountryCode
      : process.env.BROWSER_USE_PROXY_COUNTRY_CODE;
  const browserUseTimeoutMinutes = Number.isFinite(Number(options.browserUseTimeoutMinutes))
    ? Number(options.browserUseTimeoutMinutes)
    : Number.isFinite(Number(process.env.BROWSER_USE_TIMEOUT_MINUTES))
      ? Number(process.env.BROWSER_USE_TIMEOUT_MINUTES)
      : null;
  const browserUseWebSocketUrl =
    String(options.browserUseWebSocketUrl || process.env.FLUENT_BROWSER_USE_CDP_WS || process.env.BU_CDP_WS || '').trim() || null;
  const purchaseRunnerToken = String(
    options.purchaseRunnerToken || process.env.FLUENT_PURCHASE_RUNNER_TOKEN || '',
  ).trim();

  if (browserBackend === 'cloudflare-browser-rendering') {
    return runHostedCloudflareBrowserFlow({
      baseUrl,
      browserBackend,
      forceOrderSync,
      orderId,
      purchaseRunnerToken,
      reportPath,
      store,
      syncConfirmedOrder,
      syncDeliveryCalendar,
      weekStart,
    });
  }

  const stageResults = {};
  const beginStage = (name, details = {}) => {
    stageResults[name] = {
      ok: false,
      status: 'running',
      startedAt: new Date().toISOString(),
      details,
    };
  };
  const finishStage = (name, ok, details = {}) => {
    stageResults[name] = {
      ...(stageResults[name] || {}),
      ok,
      status: ok ? 'completed' : 'failed',
      finishedAt: new Date().toISOString(),
      details: {
        ...(stageResults[name]?.details || {}),
        ...details,
      },
    };
  };

  let adapter = null;
  let result = null;
  let preserveRemoteSession = false;
  const exportItemCount = Array.isArray(exportData.items) ? exportData.items.length : 0;

  try {
    let loginReport = null;
    if (isBrowserUseBackend(browserBackend)) {
      beginStage('ensure_session', {
        browserBackend,
      });
      adapter =
        browserBackend === 'browser-use-cloud-cdp'
          ? await launchBrowserUseCloudCdpAdapter({
              apiBaseUrl: browserUseApiBaseUrl,
              apiKey: browserUseApiKey,
              profileId: browserUseProfileId,
              profileName: browserUseProfileName,
              proxyCountryCode: browserUseProxyCountryCode,
              sessionId: browserUseSessionId,
              timeoutMinutes: browserUseTimeoutMinutes,
            })
          : await launchBrowserUseLocalCdpAdapter({
              headless: credentialProvider === 'interactive' ? false : headless,
              useChrome,
              userDataDir,
              websocketUrl: browserUseWebSocketUrl,
            });
      finishStage('ensure_session', true, {
        accountLabel: retailerAccount,
        browserProvider: browserBackend === 'browser-use-cloud-cdp' ? 'browser-use-cloud' : 'browser-use-local',
        localSessionMode: adapter.localSessionMode ?? null,
        remoteRegion: adapter.remoteRegion ?? null,
        remoteSessionId: adapter.remoteSessionId ?? null,
        reusedSession: adapter.sessionReused === true,
      });

      beginStage('authenticate', {
        provider: credentialProvider,
      });
      loginReport = await voilaProfile.ensureAuthenticatedInBrowser(adapter, {
        allowManualVerification: browserBackend === 'browser-use-local-cdp',
        credentialProvider,
        gogAccount,
        loginTimeoutMs,
        retailerAccount,
        verificationCode,
        verificationEmail,
        verificationProvider,
      });
      finishStage('authenticate', Boolean(loginReport.authenticated), {
        authenticated: loginReport.authenticated ?? false,
        provider: loginReport.provider ?? credentialProvider,
        status: loginReport.status ?? null,
        totpUsed: loginReport.totpUsed ?? false,
        verificationCodeUsed: loginReport.verificationCodeUsed ?? false,
      });

      beginStage('handle_verification', {
        verificationProvider,
      });
      finishStage('handle_verification', true, {
        verificationProvider: loginReport.verificationProvider ?? verificationProvider,
        verificationStatus: loginReport.verificationStatus ?? 'not_needed',
      });
    } else {
      beginStage('ensure_session', {
        userDataDir,
        credentialProvider,
      });
      loginReport = await voilaProfile.ensureAuthenticated({
        credentialProvider,
        gogAccount,
        headless,
        loginTimeoutMs,
        retailerAccount,
        useChrome,
        userDataDir,
        verificationEmail,
        verificationProvider,
      });
      finishStage('ensure_session', true, {
        reusedSession: loginReport.reusedSession ?? false,
        accountLabel: loginReport.accountLabel ?? retailerAccount,
      });

      beginStage('authenticate', {
        provider: credentialProvider,
      });
      finishStage('authenticate', Boolean(loginReport.authenticated), {
        authenticated: loginReport.authenticated ?? false,
        provider: loginReport.provider ?? credentialProvider,
        status: loginReport.status ?? null,
        totpUsed: loginReport.totpUsed ?? false,
      });

      beginStage('handle_verification', {
        verificationProvider,
      });
      finishStage('handle_verification', true, {
        verificationProvider: loginReport.verificationProvider ?? verificationProvider,
        verificationStatus: loginReport.verificationStatus ?? 'not_needed',
      });

      adapter = await launchPlaywrightAdapter({
        headless: credentialProvider === 'interactive' ? false : headless,
        useChrome,
        userDataDir,
      });
    }

    beginStage('open_retailer', { retailerProfile: voilaProfile.name });
    const retailerState = await voilaProfile.openRetailer(adapter);
    finishStage('open_retailer', true, retailerState);

    beginStage('read_current_cart', {});
    const cartStart = await voilaProfile.readCartSummary(adapter);
    const cartItems = await voilaProfile.readCartItems(adapter);
    finishStage('read_current_cart', true, {
      cartItemCount: cartItems.length,
      summaryItemCount: cartStart.itemCount,
    });

    if (!accessToken) {
      throw new Error(
        'Browser ordering requires FLUENT_ACCESS_TOKEN or --access-token so Fluent can reconcile the current cart before adding items.',
      );
    }
    if (!weekStart) {
      throw new Error('Browser ordering could not determine the planning week for hosted order preflight.');
    }

    beginStage('reconcile_current_cart_state', {
      cartItemCount: cartItems.length,
      retailer: store,
      weekStart,
    });
    const currentCartSync = await syncCartStateToHosted({
      accessToken,
      baseUrl,
      cartItems,
      retailer: store,
      weekStart,
    });
    finishStage('reconcile_current_cart_state', currentCartSync.ok === true, currentCartSync);

    beginStage('prepare_order', {
      retailer: store,
      retailerCartItemCount: cartItems.length,
      weekStart,
    });
    const refreshedExport = await buildHostedGroceryExport({
      accessToken,
      baseUrl,
      generateIfMissing: true,
      outputPath: exportPath,
      retailerCartItems: cartItems,
      store,
      weekStart,
    });
    exportData = JSON.parse(await fs.readFile(exportPath, 'utf8'));
    finishStage('prepare_order', true, {
      remainingToBuyCount: refreshedExport.itemCount,
      safeToOrder: refreshedExport.preparedOrder?.safeToOrder ?? null,
      unresolvedCount: Array.isArray(refreshedExport.preparedOrder?.unresolvedItems)
        ? refreshedExport.preparedOrder.unresolvedItems.length
        : null,
    });

    beginStage('hydrate_export', { sourceExport: exportPath });
    const hydratedExport = voilaProfile.hydrateExport(exportData);
    finishStage('hydrate_export', hydratedExport.itemCount > 0, {
      itemCount: hydratedExport.itemCount,
      weekStart: exportData.planMetadata?.weekStart ?? null,
      groceryExportKind: exportData.source?.kind ?? null,
    });
    if (hydratedExport.itemCount <= 0) {
      throw new Error('Hosted grocery export did not include any items.');
    }

    beginStage('add_items', { itemCount: hydratedExport.itemCount });
    const itemRun = await voilaProfile.addItems(adapter, hydratedExport);
    finishStage('add_items', itemRun.summary.added > 0, {
      processedItemCount: itemRun.items.length,
      addedCount: itemRun.summary.added,
      failedCount: itemRun.summary.failed,
      partialQuantityCount: itemRun.summary.partialQuantity,
      quantityMatches: itemRun.summary.quantityMatches,
    });

    beginStage('reach_execution_ready_state', {});
    const readyState = await voilaProfile.reachExecutionReadyState(adapter, {
      cartStart,
      summary: itemRun.summary,
    });
    finishStage('reach_execution_ready_state', readyState.ok === true, readyState);

    beginStage('read_updated_cart', {});
    const updatedCartItems = await voilaProfile.readCartItems(adapter);
    finishStage('read_updated_cart', true, {
      cartItemCount: updatedCartItems.length,
    });

    beginStage('reconcile_updated_cart_state', {
      cartItemCount: updatedCartItems.length,
      retailer: store,
      weekStart,
    });
    const updatedCartSync = await syncCartStateToHosted({
      accessToken,
      baseUrl,
      cartItems: updatedCartItems,
      retailer: store,
      weekStart,
    });
    finishStage('reconcile_updated_cart_state', updatedCartSync.ok === true, updatedCartSync);

    beginStage('stop_before_checkout', {});
    finishStage('stop_before_checkout', true, {
      checkoutSubmitted: false,
      keepOpen,
    });

    let confirmedOrder = null;
      let confirmedOrderSync = null;
      let deliveryCalendarCandidate = null;
      if (syncConfirmedOrder) {
      beginStage('read_confirmed_order', {
        orderId,
        recoveryMode: orderId ? 'known_order_id' : 'latest_order_recovery',
      });
      confirmedOrder = await voilaProfile.readConfirmedOrderDetails(adapter, {
        orderId,
      });
      finishStage('read_confirmed_order', Boolean(confirmedOrder?.orderId), {
        confirmedAt: confirmedOrder?.confirmedAt ?? null,
        itemCount: Array.isArray(confirmedOrder?.items) ? confirmedOrder.items.length : 0,
        orderId: confirmedOrder?.orderId ?? null,
        recoveredViaOrdersPage: confirmedOrder?.recoveredViaOrdersPage ?? false,
        status: confirmedOrder?.status ?? null,
      });

      beginStage('sync_confirmed_order', {
        orderId: confirmedOrder?.orderId ?? orderId,
        weekStart,
      });
      confirmedOrderSync = await syncConfirmedOrderToHosted({
        accessToken,
        baseUrl,
        confirmedOrder,
        exportData,
        forceOrderSync,
        retailer: store,
        weekStart,
      });
      finishStage('sync_confirmed_order', confirmedOrderSync.ok === true, {
        explicitSkippedCount: confirmedOrderSync.explicitSkippedCount,
        matchedPurchasedCount: confirmedOrderSync.matchedPurchasedCount,
        missingPlannedCount: confirmedOrderSync.missingPlannedCount,
        noOp: confirmedOrderSync.noOp === true,
        orderedExtraCount: confirmedOrderSync.orderedExtraCount,
        orderId: confirmedOrderSync.orderId,
        syncStatus: confirmedOrderSync.syncStatus,
        unresolvedCount: confirmedOrderSync.unresolvedCount,
      });

      if (syncDeliveryCalendar && confirmedOrder?.orderId && confirmedOrder?.slotWindow) {
        beginStage('prepare_delivery_calendar_candidate', {
          orderId: confirmedOrder.orderId,
        });
        deliveryCalendarCandidate = buildDeliveryCalendarCandidate({
          confirmedOrder,
          retailer: store,
        });
        finishStage('prepare_delivery_calendar_candidate', true, {
          externalId: deliveryCalendarCandidate.externalId,
          orderId: deliveryCalendarCandidate.orderId,
          startsAt: deliveryCalendarCandidate.startsAt,
          endsAt: deliveryCalendarCandidate.endsAt,
        });
      }
    }

    result = {
      ok: readyState.executionReady === true,
      checkedAt: new Date().toISOString(),
      browserBackend: adapter.backend,
      browserProvider: isBrowserUseBackend(browserBackend)
        ? 'browser-use'
        : browserBackend === 'cloudflare-browser-rendering'
          ? 'cloudflare'
          : 'local',
      remoteSessionId: adapter.remoteSessionId ?? null,
      remoteRegion: adapter.remoteRegion ?? null,
      sessionReused: adapter.sessionReused === true,
      localSessionMode: adapter.localSessionMode ?? null,
      retailerProfile: voilaProfile.name,
      browserFlowMode: 'fluent_owned_workflow',
      executionReady: readyState.executionReady === true,
      exportItemCount: hydratedExport.itemCount,
      headless,
      keepOpen,
      loginMethod: credentialProvider,
      verificationMethod: loginReport.verificationProvider ?? verificationProvider ?? null,
      login: {
        authenticated: loginReport.authenticated ?? false,
        provider: loginReport.provider ?? credentialProvider,
        verificationProvider: loginReport.verificationProvider ?? verificationProvider ?? null,
        verificationStatus: loginReport.verificationStatus ?? 'not_needed',
        verificationCodeUsed: loginReport.verificationCodeUsed ?? false,
        gogAccount,
        accountLabel: loginReport.accountLabel ?? retailerAccount,
        headlessRequested: loginReport.headlessRequested ?? headless,
        headlessUsed: loginReport.headlessUsed ?? (credentialProvider === 'interactive' ? false : headless),
        reusedSession: loginReport.reusedSession ?? false,
        profileReset: loginReport.profileReset ?? false,
        archivedProfileDir: loginReport.archivedProfileDir ?? null,
        totpUsed: loginReport.totpUsed ?? false,
        status: loginReport.status ?? null,
        error: loginReport.error ?? null,
      },
      reportPath,
      sourceExport: exportPath,
      store,
      workflowStages: stageResults,
      summary: {
        added: itemRun.summary.added,
        failed: itemRun.summary.failed,
        partialQuantity: itemRun.summary.partialQuantity,
        quantityMatches: itemRun.summary.quantityMatches,
        total: itemRun.summary.total,
      },
      processedItemCount: itemRun.items.length,
      matchedOrAddedCount: itemRun.summary.added,
      cart: readyState.cart,
      confirmedOrder,
      confirmedOrderSync,
      deliveryCalendarCandidate,
      items: itemRun.items,
    };
  } catch (error) {
    if (isRetailerVerificationRequiredError(error) && isBrowserUseBackend(browserBackend) && adapter) {
      preserveRemoteSession = true;
      const failedStageName = Object.entries(stageResults).find(([, stage]) => stage?.status === 'running')?.[0];
      if (failedStageName) {
        finishStage(failedStageName, false, {
          error: error.message,
          verificationRequired: true,
        });
      }
      result = {
        ok: false,
        checkedAt: new Date().toISOString(),
        browserBackend: adapter.backend,
        browserProvider: 'browser-use',
        localSessionMode: adapter.localSessionMode ?? null,
        remoteSessionId: adapter.remoteSessionId ?? null,
        remoteRegion: adapter.remoteRegion ?? null,
        sessionReused: adapter.sessionReused === true,
        retailerProfile: voilaProfile.name,
        browserFlowMode: 'fluent_owned_workflow',
        executionReady: false,
        exportItemCount,
        headless,
        keepOpen: true,
        loginMethod: credentialProvider,
        verificationMethod: verificationProvider ?? null,
        waitingForVerification: true,
        verificationRequest: {
          codeLength: error.codeLength,
          deliveryHint: error.deliveryHint,
          provider: error.provider,
          requestedAt: error.requestedAt,
          verificationEmail: error.verificationEmail,
        },
        verificationResume: {
          browserBackend,
          browserUseSessionId: adapter.remoteSessionId ?? null,
          verificationFlag: '--verification-code',
        },
        login: {
          authenticated: false,
          provider: credentialProvider,
          verificationProvider: verificationProvider ?? null,
          gogAccount,
          accountLabel: retailerAccount,
          headlessRequested: headless,
          headlessUsed: headless,
          reusedSession: adapter.sessionReused === true,
          profileReset: false,
          archivedProfileDir: null,
          totpUsed: false,
          verificationCodeUsed: false,
          status: 'verification_required',
          error: null,
        },
        reportPath,
        sourceExport: exportPath,
        store,
        workflowStages: stageResults,
        summary: {
          added: 0,
          failed: exportItemCount,
          partialQuantity: 0,
          quantityMatches: 0,
          total: exportItemCount,
        },
        processedItemCount: 0,
        matchedOrAddedCount: 0,
        cart: {
          changed: false,
          start: null,
          end: null,
        },
      };
    } else {
    const failedStageName = Object.entries(stageResults).find(([, stage]) => stage?.status === 'running')?.[0];
    if (failedStageName) {
      finishStage(failedStageName, false, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    result = {
      ok: false,
      checkedAt: new Date().toISOString(),
      browserBackend: adapter?.backend ?? (browserBackend === 'local' ? 'playwright' : browserBackend),
      browserProvider: isBrowserUseBackend(browserBackend)
        ? 'browser-use'
        : browserBackend === 'cloudflare-browser-rendering'
          ? 'cloudflare'
          : 'local',
      remoteSessionId: adapter?.remoteSessionId ?? null,
      remoteRegion: adapter?.remoteRegion ?? null,
      sessionReused: adapter?.sessionReused === true,
      localSessionMode: adapter?.localSessionMode ?? null,
      retailerProfile: voilaProfile.name,
      browserFlowMode: 'fluent_owned_workflow',
      executionReady: false,
      exportItemCount,
      headless,
      keepOpen,
      loginMethod: credentialProvider,
      verificationMethod: verificationProvider ?? null,
      login: {
        authenticated: false,
        provider: credentialProvider,
        verificationProvider: verificationProvider ?? null,
        gogAccount,
        accountLabel: retailerAccount,
        headlessRequested: headless,
        headlessUsed: credentialProvider === 'interactive' ? false : headless,
        reusedSession: false,
        profileReset: false,
        archivedProfileDir: null,
        totpUsed: false,
        verificationCodeUsed: false,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      },
      reportPath,
      sourceExport: exportPath,
      store,
      workflowStages: stageResults,
      summary: {
        added: 0,
        failed: exportItemCount,
        partialQuantity: 0,
        quantityMatches: 0,
        total: exportItemCount,
      },
      processedItemCount: 0,
      matchedOrAddedCount: 0,
      cart: {
        changed: false,
        start: null,
        end: null,
      },
      error: {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack ?? null : null,
      },
    };
    }
  } finally {
    if (adapter && keepOpen !== true && preserveRemoteSession !== true) {
      await adapter.close('close').catch(() => {});
    }
  }

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

  return result;
}

async function syncConfirmedOrderToHosted(options) {
  const client = await createHostedClient(options.baseUrl, options.accessToken);
  try {
    const retailer = String(options.retailer || options.confirmedOrder?.retailer || 'voila').trim().toLowerCase();
    const retailerOrderId = String(options.confirmedOrder?.orderId || '').trim();
    if (!retailerOrderId) {
      throw new Error('Confirmed-order sync requires a retailer order id.');
    }

    const existingSync = await readHostedJsonResource(
      client,
      `fluent://meals/confirmed-order-sync/${encodeURIComponent(retailer)}/${encodeURIComponent(retailerOrderId)}`,
    );
    if (existingSync?.status === 'sync_completed' && options.forceOrderSync !== true) {
      return {
        ok: true,
        noOp: true,
        orderId: retailerOrderId,
        syncStatus: existingSync.status,
        matchedPurchasedCount: existingSync.matchedPurchasedCount ?? 0,
        orderedExtraCount: existingSync.orderedExtraCount ?? 0,
        explicitSkippedCount: existingSync.explicitSkippedCount ?? 0,
        missingPlannedCount: existingSync.missingPlannedCount ?? 0,
        unresolvedCount: existingSync.unresolvedCount ?? 0,
        existingSync,
      };
    }

    const groceryPlan = await callHostedTool(client, 'meals_get_grocery_plan', {
      week_start: options.weekStart,
      view: 'full',
    });
    const actions = await callHostedTool(client, 'meals_list_grocery_plan_actions', {
      week_start: options.weekStart,
    });
    const syncSummary = classifyConfirmedOrderSync({
      actions,
      confirmedOrder: options.confirmedOrder,
      exportData: options.exportData,
      groceryPlan,
    });
    const syncStatus = syncSummary.counts.unresolvedCount > 0 ? 'sync_partial' : 'sync_completed';
    const metadata = buildConfirmedOrderSyncMetadata({
      force: options.forceOrderSync === true,
      retailer,
      retailerOrderId,
      status: syncStatus,
      syncSummary,
      weekStart: options.weekStart,
    });
    const purchasedAt = options.confirmedOrder?.confirmedAt || new Date().toISOString();

    for (const line of syncSummary.matchedPurchased) {
      await client.callTool({
        name: 'meals_upsert_grocery_plan_action',
        arguments: {
          week_start: options.weekStart,
          item_key: line.itemKey,
          action_status: 'purchased',
          purchased_at: purchasedAt,
          metadata,
          response_mode: 'ack',
        },
      });
    }

    for (const extra of syncSummary.orderedExtras) {
      await client.callTool({
        name: 'meals_update_inventory',
        arguments: {
          name: extra.displayName,
          status: 'present',
          purchased_at: purchasedAt,
          source: 'confirmed_order_sync',
          metadata,
        },
      });
    }

    const persistedSync =
      syncSummary.matchedPurchased.length > 0 || syncSummary.orderedExtras.length > 0
        ? await readHostedJsonResource(
            client,
            `fluent://meals/confirmed-order-sync/${encodeURIComponent(retailer)}/${encodeURIComponent(retailerOrderId)}`,
          )
        : null;

    return {
      ok: true,
      noOp: false,
      orderId: retailerOrderId,
      syncStatus,
      matchedPurchasedCount: syncSummary.counts.matchedPurchasedCount,
      orderedExtraCount: syncSummary.counts.orderedExtraCount,
      explicitSkippedCount: syncSummary.counts.explicitSkippedCount,
      missingPlannedCount: syncSummary.counts.missingPlannedCount,
      unresolvedCount: syncSummary.counts.unresolvedCount,
      summary: syncSummary,
      persistedSync,
    };
  } finally {
    await client.close();
  }
}

async function syncCartStateToHosted(options) {
  const client = await createHostedClient(options.baseUrl, options.accessToken);
  try {
    const groceryPlan = await callHostedTool(client, 'meals_get_grocery_plan', {
      week_start: options.weekStart,
      view: 'full',
    });
    const actions = await callHostedTool(client, 'meals_list_grocery_plan_actions', {
      week_start: options.weekStart,
    });
    const plan = buildCartStateSyncPlan({
      actions,
      cartItems: options.cartItems,
      groceryPlan,
      retailer: options.retailer,
    });

    let deleteCount = 0;
    for (const deletion of plan.deletes) {
      await client.callTool({
        name: 'meals_delete_grocery_plan_action',
        arguments: {
          item_key: deletion.item_key,
          week_start: options.weekStart,
        },
      });
      deleteCount += 1;
    }

    let upsertCount = 0;
    for (const upsert of plan.upserts) {
      await client.callTool({
        name: 'meals_upsert_grocery_plan_action',
        arguments: {
          week_start: options.weekStart,
          ...upsert,
        },
      });
      upsertCount += 1;
    }

    return {
      ok: true,
      deleteCount,
      matchedPlanCount: plan.summary.matchedPlanCount,
      unmatchedCartCount: plan.summary.unmatchedCartCount,
      unmatchedCartItems: plan.unmatchedCartItems,
      upsertCount,
    };
  } catch (error) {
    return {
      ok: false,
      deleteCount: 0,
      error: error instanceof Error ? error.message : String(error),
      matchedPlanCount: 0,
      unmatchedCartCount: Array.isArray(options.cartItems) ? options.cartItems.length : 0,
      unmatchedCartItems: Array.isArray(options.cartItems)
        ? options.cartItems.map((item) => String(item?.title || '').trim()).filter(Boolean)
        : [],
      upsertCount: 0,
    };
  } finally {
    await client.close();
  }
}

async function createHostedClient(baseUrl, accessToken) {
  const client = new Client({ name: 'fluent-meals-confirmed-order-sync', version: '0.1.0' }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
  await client.connect(transport);
  return client;
}

async function callHostedTool(client, name, args) {
  return extractPayload(
    await client.callTool({
      name,
      arguments: args,
    }),
  );
}

async function readHostedJsonResource(client, uri) {
  const result = await client.readResource({ uri });
  const text = result?.contents?.[0]?.text;
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help === 'true') {
    printUsage();
    process.exit(0);
  }
  if (!args.file && !args.export) {
    throw new Error('Browser flow requires --file or --export pointing at a hosted grocery export JSON file.');
  }
  const result = await runGroceryBrowserFlow({
    accessToken: args.accessToken,
    baseUrl: args.baseUrl,
    browserBackend: args.browserBackend,
    weekStart: args.weekStart,
    exportPath: args.file || args.export,
    purchaseRunnerToken: args.purchaseRunnerToken,
    reportPath: args.report || args.output,
    store: args.store,
    headless: args.headless,
    keepOpen: args.keepOpen,
    credentialProvider: args.credentialProvider,
    verificationProvider: args.verificationProvider,
    gogAccount: args.gogAccount,
    loginTimeoutMs: args.loginTimeoutMs,
    retailerAccount: args.retailerAccount,
    browserUseApiBaseUrl: args.browserUseApiBaseUrl,
    browserUseApiKey: args.browserUseApiKey,
    browserUseProfileId: args.browserUseProfileId,
    browserUseProfileName: args.browserUseProfileName,
    browserUseProxyCountryCode: args.browserUseProxyCountryCode,
    browserUseSessionId: args.browserUseSessionId,
    browserUseTimeoutMinutes: args.browserUseTimeoutMinutes,
    browserUseWebSocketUrl: args.browserUseWebSocketUrl,
    orderId: args.orderId,
    syncConfirmedOrder: args.syncConfirmedOrder,
    forceOrderSync: args.forceOrderSync,
    useChrome: args.useChrome,
    userDataDir: args.userDataDir,
    verificationCode: args.verificationCode,
    verificationEmail: args.verificationEmail,
    syncDeliveryCalendar: args.syncDeliveryCalendar,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

function resolvePath(root, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.resolve(root, value);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      parsed[camelize(key)] = next;
      index += 1;
    } else {
      parsed[camelize(key)] = 'true';
    }
  }
  return parsed;
}

function camelize(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function todayDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function runHostedCloudflareBrowserFlow(options) {
  if (!options.purchaseRunnerToken) {
    throw new Error(
      'Cloudflare Browser Rendering backend requires FLUENT_PURCHASE_RUNNER_TOKEN or --purchase-runner-token.',
    );
  }
  if (!options.weekStart) {
    throw new Error('Cloudflare Browser Rendering backend requires a planning week.');
  }

  const createResponse = await fetch(`${options.baseUrl}/internal/purchase-runs`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-fluent-purchase-runner-token': options.purchaseRunnerToken,
    },
    body: JSON.stringify({
      browserBackendPreference: 'cloudflare_browser_rendering',
      forceOrderSync: options.forceOrderSync === true,
      orderId: options.orderId ?? null,
      retailer: options.store,
      syncConfirmedOrder: options.syncConfirmedOrder === true,
      syncDeliveryCalendar: options.syncDeliveryCalendar === true,
      weekStart: options.weekStart,
    }),
  });

  const createText = await createResponse.text();
  const createPayload = createText ? JSON.parse(createText) : null;
  if (!createResponse.ok) {
    throw new Error(createPayload?.error || `Hosted Cloudflare browser flow failed with ${createResponse.status}.`);
  }

  const runId = String(createPayload?.runId || '').trim();
  if (!runId) {
    throw new Error('Hosted Cloudflare browser flow did not return a purchase run id.');
  }

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    const statusResponse = await fetch(
      `${options.baseUrl}/internal/purchase-runs/${encodeURIComponent(runId)}`,
      {
        method: 'GET',
        headers: {
          'x-fluent-purchase-runner-token': options.purchaseRunnerToken,
        },
      },
    );
    const statusText = await statusResponse.text();
    const statusPayload = statusText ? JSON.parse(statusText) : null;
    if (!statusResponse.ok) {
      throw new Error(
        statusPayload?.error || `Hosted Cloudflare browser flow status check failed with ${statusResponse.status}.`,
      );
    }

    const stateStatus = String(statusPayload?.state?.status || '').trim().toLowerCase();
    const artifact = statusPayload?.artifact;
    if (artifact && ['complete', 'errored', 'needs_manual_recovery', 'cancelled'].includes(stateStatus)) {
      if (options.reportPath) {
        await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
        await fs.writeFile(options.reportPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
      }
      return artifact;
    }

    if (stateStatus === 'waiting') {
      const waitingResult = {
        ok: false,
        checkedAt: new Date().toISOString(),
        browserBackend: 'cloudflare-browser-rendering',
        browserFlowMode: 'fluent_hosted_worker',
        executionReady: false,
        store: options.store,
        runId,
        waitingForVerification: true,
        verificationRequest: statusPayload?.state?.verificationRequest ?? null,
        verificationSubmission: {
          endpoint: `${options.baseUrl}/internal/purchase-runs/${encodeURIComponent(runId)}/verification`,
          header: 'x-fluent-purchase-runner-token',
          method: 'POST',
        },
      };
      if (options.reportPath) {
        await fs.mkdir(path.dirname(options.reportPath), { recursive: true });
        await fs.writeFile(options.reportPath, `${JSON.stringify(waitingResult, null, 2)}\n`, 'utf8');
      }
      return waitingResult;
    }

    if (['complete', 'errored', 'needs_manual_recovery', 'cancelled'].includes(stateStatus)) {
      throw new Error(
        `Hosted Cloudflare browser flow ended with state "${stateStatus}" before it persisted an artifact.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }

  throw new Error(`Hosted Cloudflare browser flow timed out waiting for purchase run ${runId}.`);
}

function extractPayload(result) {
  const structured = result?.structuredContent;
  if (!structured || typeof structured !== 'object') {
    return null;
  }
  return Object.prototype.hasOwnProperty.call(structured, 'value') ? structured.value : structured;
}

function printUsage() {
  console.log(
    [
      'Usage: node run-grocery-browser-flow.mjs --file <hosted-export.json> [options]',
      '',
      'Options:',
      '  --base-url <url>                       Hosted Fluent base URL for order preflight',
      '  --access-token <token>                Hosted Fluent bearer token for order preflight',
      '  --browser-backend <mode>              local|browser-use-local-cdp|browser-use-cloud-cdp|cloudflare-browser-rendering',
      '  --browser-use-api-key <token>         Browser Use Cloud API key override',
      '  --browser-use-api-base-url <url>      Browser Use Cloud API base URL override',
      '  --browser-use-session-id <id>         Resume an existing Browser Use Cloud browser session',
      '  --browser-use-profile-id <id>         Browser Use Cloud profile id for remote session creation',
      '  --browser-use-profile-name <name>     Browser Use Cloud profile name for remote session creation',
      '  --browser-use-proxy-country-code <cc> Browser Use Cloud proxy country code or empty to disable',
      '  --browser-use-timeout-minutes <n>     Browser Use Cloud session timeout in minutes',
      '  --browser-use-web-socket-url <url>    Explicit local Browser Use/local CDP websocket URL',
      '  --purchase-runner-token <token>       Internal token for hosted Cloudflare purchase routes',
      '  --week-start <YYYY-MM-DD>             Override the planning week when the export file lacks it',
      '  --report <path>                         Write the execution report JSON to this path',
      '  --store voila                           Retailer profile (voila only in this phase)',
      '  --credential-provider <mode>           interactive|bitwarden|env',
      '  --verification-provider <mode>         gog|manual',
      '  --gog-account <email>                  Gmail account for Voila verification-code retrieval',
      '  --retailer-account <label-or-id>       Bitwarden item label/id for retailer credentials',
      '  --order-id <retailer-order-id>         Confirmed Voila order id to sync after checkout',
      '  --sync-confirmed-order <true|false>    Read a confirmed order and sync it back into Fluent',
      '  --force-order-sync <true|false>        Re-run sync even if Fluent already recorded it',
      '  --sync-delivery-calendar <true|false>  Emit a delivery-event candidate after confirmed-order sync',
      '  --headless <true|false>                Launch browser headless when possible',
      '  --keep-open <true|false>               Leave the browser open after reaching cart-ready state',
      '  --use-chrome <true|false>              Use the local Chrome channel instead of bundled Chromium',
      '  --verification-code <code>             Submit an already-fetched Voila email verification code',
      '  --verification-email <email>           Override the email used for Voila verification-code lookup',
    ].join('\n'),
  );
}

function isInvokedDirectly() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}
