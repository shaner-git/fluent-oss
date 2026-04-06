import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { StyleService } from '../src/domains/style/service';
import { createLocalRuntime } from '../src/local/runtime';
import { maybeHandleStyleImageRequest } from '../src/style-image-handler';

const tempRoots: string[] = [];

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    while (tempRoots.length > 0) {
      const root = tempRoots.pop();
      if (root) {
        rmSync(root, { force: true, recursive: true });
      }
    }
  });

async function main() {
  await preservesProfileMerges();
  await preservesRichStyleProfilePreferences();
  await storesProvenanceOutsideCanonicalItemReads();
  await summarizesOnboardingReadyState();
  await tracksEvidenceGapCoverage();
  await treatsLegacyProfilesAsUsableEvidence();
  await filtersActionableEvidenceGaps();
  await prioritizesDescriptorBacklogByImpactAndPhotoSupport();
  await analyzesWardrobeFromDerivedSignals();
  await subclustersRedundancyByRoleIntent();
  await bootstrapsProfilesForNewItems();
  await analyzesPurchasesFromClosetAndCalibration();
  await doesNotMarkGapFillPurchaseAsCoveredLane();
  await enrichesPurchaseAnalysisWithDescriptorEvidence();
  await infersComparatorKeysForNewEdgeCategoryItems();
  await acceptsCandidateImageUrlsInPurchaseAnalysis();
  await rejectsHostedLocalUploadPathPhotos();
  await preservesExplicitSaveFlowWithoutGeneratedImages();
  await backfillsLegacyRelativePhotoPathsFromMountedRoot();
  await deliversOwnedStyleImagesFromLocalRuntime();
  await prefersDeliverablePhotosInVisualBundles();
  await authenticatesHostedStyleImages();
}

async function infersComparatorKeysForNewEdgeCategoryItems() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:camp-shirt',
        brand: 'Test',
        category: 'TOP',
        name: 'Relaxed Camp Shirt',
        subcategory: 'Camp Shirt',
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:henley',
        brand: 'Test',
        category: 'TOP',
        name: 'Waffle Henley',
        subcategory: 'Henley',
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:jersey',
        brand: 'Test',
        category: 'TOP',
        name: 'Basketball Jersey',
        subcategory: 'Basketball Jersey',
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:graphic-ls-tee',
        brand: 'Test',
        category: 'TOP',
        name: 'Graphic Long Sleeve Tee',
        subcategory: 'Long Sleeve',
      },
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:graphic-ls-tee',
      profile: {
        itemType: 'long sleeve tee',
        tags: ['graphic tee', 'tour tee'],
      },
      provenance,
      source: 'test',
    });
    await service.upsertItem({
      item: {
        id: 'style-item:jogger',
        brand: 'Test',
        category: 'BOTTOM',
        name: 'Technical Jogger',
        subcategory: 'Jogger',
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:basketball-shoe',
        brand: 'Test',
        category: 'SHOE',
        name: 'Basketball Shoe',
        subcategory: 'Basketball Shoe',
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:anorak',
        brand: 'Test',
        category: 'OUTERWEAR',
        name: 'Hooded Anorak',
        subcategory: 'Jacket',
      },
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:anorak',
      profile: {
        itemType: 'anorak jacket',
        tags: ['hooded', 'anorak', 'jacket'],
      },
      provenance,
      source: 'test',
    });

    assert.equal((await service.getItem('style-item:camp-shirt'))?.comparatorKey, 'camp_shirt');
    assert.equal((await service.getItem('style-item:henley'))?.comparatorKey, 'henley');
    assert.equal((await service.getItem('style-item:jersey'))?.comparatorKey, 'jersey');
    assert.equal((await service.getItem('style-item:graphic-ls-tee'))?.comparatorKey, 'tee');
    assert.equal((await service.getItem('style-item:jogger'))?.comparatorKey, 'jogger');
    assert.equal((await service.getItem('style-item:basketball-shoe'))?.comparatorKey, 'sneaker');
    assert.equal((await service.getItem('style-item:anorak'))?.comparatorKey, 'jacket');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function preservesRichStyleProfilePreferences() {
  const runtime = createTempRuntime();
  try {
    const service = new StyleService(runtime.env.db);
    const provenance = testProvenance();

    const updated = await service.updateProfile({
      profile: {
        brandAffinities: [{ brand: 'Sunspel', stance: 'prefer', note: 'clean knitwear' }],
        budgetProfile: { everydayTier: 'mid', investmentTier: 'premium', splurgeCategories: ['coat'] },
        colorPreferences: [{ value: 'navy', weight: 'strong', note: 'anchor neutral' }],
        exceptionRules: [{ when: 'summer', allows: ['washed pink'], note: 'soft accent' }],
        fitProfile: { legShapePreference: 'relaxed-straight', topLengthPreference: 'slightly cropped' },
        formalityPreferences: [{ context: 'work', targetRange: { min: 2, max: 4 }, note: 'avoid full suiting' }],
        occasionRules: [{ occasion: 'dinner', preferredLanes: ['loafer', 'trouser'], avoidLanes: ['running'], note: 'clean and easy' }],
        silhouettePreferences: [{ value: 'relaxed-straight', weight: 'strong', note: 'preferred overall line' }],
      },
      provenance,
    });

    assert.equal(updated.raw.brandAffinities[0]?.brand, 'Sunspel');
    assert.equal(updated.raw.brandAffinities[0]?.stance, 'prefer');
    assert.equal(updated.raw.budgetProfile?.investmentTier, 'premium');
    assert.equal(updated.raw.colorPreferences[0]?.value, 'navy');
    assert.equal(updated.raw.colorPreferences[0]?.weight, 'high');
    assert.equal(updated.raw.exceptionRules[0]?.when, 'summer');
    assert.equal(updated.raw.fitProfile?.legShapePreference, 'relaxed-straight');
    assert.deepEqual(updated.raw.formalityPreferences[0]?.targetRange, { min: 2, max: 4 });
    assert.equal(updated.raw.occasionRules[0]?.preferredLanes[0], 'loafer');
    assert.equal(updated.raw.silhouettePreferences[0]?.value, 'relaxed-straight');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function preservesProfileMerges() {
  const runtime = createTempRuntime();
  try {
    const service = new StyleService(runtime.env.db);
    const provenance = testProvenance();
    const profile = await service.getProfile();
    assert.equal(profile.raw.importedClosetConfirmed, false);

    await service.updateProfile({
      profile: {
        hardAvoids: ['wool'],
        preferredSilhouettes: ['relaxed'],
      },
      provenance,
    });

    const merged = await service.updateProfile({
      profile: {
        colorDirections: ['navy'],
      },
      provenance,
    });

    assert.deepEqual(merged.raw.hardAvoids, ['wool']);
    assert.deepEqual(merged.raw.preferredSilhouettes, ['relaxed']);
    assert.deepEqual(merged.raw.colorDirections, ['navy']);
    assert.equal(merged.raw.onboardingPath, null);
    assert.equal(merged.raw.practicalCalibrationConfirmed, false);
    assert.equal(merged.raw.tasteCalibrationConfirmed, false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function storesProvenanceOutsideCanonicalItemReads() {
  const runtime = createTempRuntime();
  try {
    const service = new StyleService(runtime.env.db);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:test-oxford',
        legacy_item_id: 12,
        brand: 'Test Brand',
        name: 'Oxford Shirt',
        category: 'TOP',
        subcategory: 'Shirt',
        size: 'M',
        color_family: 'blue',
        formality: 3,
        field_evidence: { category: { source: 'vision', value: 'TOP' } },
        technical_metadata: { fabric: 'cotton', weight: 'mid' },
        llm_ratings: { overall: 10 },
      },
      provenance,
      sourceSnapshot: { imported_from: 'fluent-web', legacy_item_id: 12 },
    });

    await service.upsertItemPhotos({
      itemId: 'style-item:test-oxford',
      photos: [
        {
          id: 'style-photo:test-oxford-1',
          url: 'https://example.com/oxford-front.jpg',
          is_primary: true,
          view: 'FRONT',
        },
      ],
      provenance,
    });

    await service.upsertItemProfile({
      itemId: 'style-item:test-oxford',
      profile: {
        itemType: 'oxford shirt',
        styleRole: 'core',
        tags: ['shirt', 'blue', 'workhorse'],
      },
      provenance,
      source: 'import:test',
    });

    const item = await service.getItem('style-item:test-oxford');
    assert(item);
    assert.equal(item.name, 'Oxford Shirt');
    assert.equal(item.comparatorKey, 'oxford_shirt');
    assert.equal(item.status, 'active');
    assert.equal(item.photos.length, 1);
    assert.equal(item.photos[0]?.kind, 'product');
    assert.equal(item.photos[0]?.source, 'user_upload');
    assert.equal(item.photos[0]?.view, 'front');
    assert.equal(item.profile?.raw.tags.includes('workhorse'), true);
    assert.equal(Object.prototype.hasOwnProperty.call(item as Record<string, unknown>, 'technicalMetadata'), false);

    const provenanceRow = await service.getItemProvenance('style-item:test-oxford');
    assert.deepEqual(provenanceRow?.technicalMetadata, { fabric: 'cotton', weight: 'mid' });
    assert.deepEqual(provenanceRow?.fieldEvidence, { category: { source: 'vision', value: 'TOP' } });
  } finally {
    runtime.sqliteDb.close();
  }
}

async function summarizesOnboardingReadyState() {
  const runtime = createTempRuntime();
  try {
    const service = new StyleService(runtime.env.db);
    const provenance = testProvenance();

    let context = await service.getContext();
    assert.equal(context.onboardingMode, 'fresh');
    assert.equal(context.seededClosetPresent, false);
    assert.equal(context.purchaseEvalReady, false);
    assert.equal(context.photoCount, 0);
    assert.equal(context.profileCount, 0);
    assert.equal(context.representativeItems.length, 0);

    await service.upsertItem({
      item: {
        id: 'style-item:test-anchor',
        brand: 'Studio Nicholson',
        name: 'Wide Pant',
        category: 'BOTTOM',
        subcategory: 'Trouser',
        color_family: 'black',
      },
      provenance,
    });

    await service.upsertItemPhotos({
      itemId: 'style-item:test-anchor',
      photos: [
        {
          id: 'style-photo:test-anchor-1',
          imported_from: 'wardrobe-os',
          is_fit: true,
          is_primary: true,
          url: '/images/u2/test-anchor-fit.jpg',
          view: 'fit side',
        },
      ],
      provenance,
    });

    context = await service.getContext();
    assert.equal(context.onboardingMode, 'seeded');
    assert.equal(context.seededClosetPresent, true);
    assert.equal(context.purchaseEvalReady, false);
    assert.equal(context.photoCount, 1);
    assert.equal(context.profileCount, 1);
    assert.equal(context.representativeItems.length, 1);
    assert.equal(context.representativeItems[0]?.status, 'active');
    assert.equal(context.representativeItems[0]?.photoCount, 1);
    assert.equal(context.representativeItems[0]?.primaryPhotoDelivery, null);
    assert.equal(context.representativeItems[0]?.comparatorKey, 'trouser');
    assert.equal('primaryPhotoUrl' in context.representativeItems[0]!, false);

    const item = await service.getItem('style-item:test-anchor');
    assert(item);
    assert.equal(item.photos[0]?.kind, 'fit');
    assert.equal(item.photos[0]?.source, 'legacy_reference');
    assert.equal(item.photos[0]?.view, 'fit_side');

    await service.updateProfile({
      profile: {
        closetCoverage: 'current',
        importedClosetConfirmed: true,
        onboardingPath: 'seeded',
        practicalCalibrationConfirmed: true,
        tasteCalibrationConfirmed: true,
      },
      provenance,
    });

    context = await service.getContext();
    assert.equal(context.purchaseEvalReady, true);
    assert.equal(context.profile.raw.importedClosetConfirmed, true);
    assert.equal(context.profile.raw.closetCoverage, 'current');
    assert.equal(context.profile.raw.onboardingPath, 'seeded');
    assert.equal(context.profile.raw.practicalCalibrationConfirmed, true);
    assert.equal(context.profile.raw.tasteCalibrationConfirmed, true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function tracksEvidenceGapCoverage() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:evidence-gap',
        brand: 'Test Brand',
        category: 'TOP',
        color_family: 'white',
        formality: 1,
        name: 'Evidence Gap Tee',
        subcategory: 'T-Shirt',
      },
      provenance,
    });

    let gaps = await service.listEvidenceGaps();
    assert.equal(gaps.items.length, 1);
    assert.equal(gaps.items[0]?.gapTypes.includes('missing_primary_photo_delivery'), true);
    assert.equal(gaps.items[0]?.gapTypes.includes('missing_typed_profile'), false);
    assert.equal(gaps.items[0]?.gapTypes.includes('weak_descriptor_coverage'), false);
    assert.equal(gaps.items[0]?.gapTypes.includes('weak_comparator_identity'), false);

    await service.upsertItemPhotos({
      itemId: 'style-item:evidence-gap',
      photos: [
        {
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
          id: 'style-photo:evidence-gap-1',
          is_primary: true,
          view: 'front',
        },
      ],
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:evidence-gap',
      profile: {
        descriptorConfidence: 0.9,
        fabricHand: 'smooth',
        itemType: 'tee',
        polishLevel: 'clean casual',
        qualityTier: 'core',
        structureLevel: 'soft',
        tags: ['tee'],
        texture: 'jersey',
        visualWeight: 'light',
      },
      provenance,
      source: 'test',
    });

    gaps = await service.listEvidenceGaps();
    assert.equal(gaps.items.length, 0);
    assert.equal(gaps.deliverablePhotoCoverage, 1);
    assert.equal(gaps.typedProfileCoverage, 1);
    assert.equal(gaps.descriptorCoverage, 1);
    assert.equal(gaps.stylistDescriptorCoverage, 1);
    assert.equal(gaps.usableProfileCoverage, 1);

    const context = await service.getContext();
    assert.equal(context.deliverablePhotoCoverage, 1);
    assert.equal(context.typedProfileCoverage, 1);
    assert.equal(context.descriptorCoverage, 1);
    assert.equal(context.stylistDescriptorCoverage, 1);
    assert.equal(context.usableProfileCoverage, 1);
    assert.equal(context.evidenceGapCount, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function treatsLegacyProfilesAsUsableEvidence() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:legacy-profile',
        brand: 'Legacy Brand',
        category: 'TOP',
        color_family: 'blue',
        formality: 3,
        name: 'Legacy Profile Shirt',
        subcategory: 'Shirt',
      },
      provenance,
    });
    await service.upsertItemPhotos({
      itemId: 'style-item:legacy-profile',
      photos: [
        {
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
          id: 'style-photo:legacy-profile-1',
          is_primary: true,
          view: 'front',
        },
      ],
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:legacy-profile',
      profile: {
        dressCode: { min: 2, max: 4 },
        itemType: 'shirt',
        pairingNotes: 'works with trousers and loafers',
        tags: ['blue', 'workhorse'],
      },
      provenance,
      source: 'test',
    });

    const allGaps = await service.listEvidenceGaps();
    assert.equal(allGaps.items.length, 0);
    assert.equal(allGaps.descriptorCoverage, 0);
    assert.equal(allGaps.usableProfileCoverage, 1);
    assert.equal(allGaps.stylistDescriptorCoverage, 0);

    const context = await service.getContext();
    assert.equal(context.descriptorCoverage, 0);
    assert.equal(context.usableProfileCoverage, 1);
    assert.equal(context.stylistDescriptorCoverage, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function analyzesWardrobeFromDerivedSignals() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.updateProfile({
      profile: {
        colorDirections: ['navy', 'white', 'brown'],
        preferredSilhouettes: ['relaxed-straight'],
      },
      provenance,
    });

    await service.upsertItem({
      item: { id: 'style-item:wardrobe-tee-1', brand: 'Test', category: 'TOP', name: 'White Tee 1', subcategory: 'T-Shirt', color_family: 'white', formality: 1 },
      provenance,
    });
    await service.upsertItem({
      item: { id: 'style-item:wardrobe-tee-2', brand: 'Test', category: 'TOP', name: 'White Tee 2', subcategory: 'T-Shirt', color_family: 'white', formality: 1 },
      provenance,
    });
    await service.upsertItem({
      item: { id: 'style-item:wardrobe-tee-3', brand: 'Test', category: 'TOP', name: 'White Tee 3', subcategory: 'T-Shirt', color_family: 'white', formality: 1 },
      provenance,
    });
    await service.upsertItem({
      item: { id: 'style-item:wardrobe-trouser', brand: 'Test', category: 'BOTTOM', name: 'Navy Trouser', subcategory: 'Trouser', color_family: 'navy', formality: 3 },
      provenance,
    });
    await service.upsertItem({
      item: { id: 'style-item:wardrobe-oxford', brand: 'Test', category: 'TOP', name: 'White Oxford', subcategory: 'OCBD', color_family: 'white', formality: 3 },
      provenance,
    });

    for (const itemId of ['style-item:wardrobe-tee-1', 'style-item:wardrobe-tee-2', 'style-item:wardrobe-tee-3', 'style-item:wardrobe-trouser', 'style-item:wardrobe-oxford']) {
      await service.upsertItemProfile({
        itemId,
        profile: {
          descriptorConfidence: 0.8,
          itemType: itemId.includes('oxford') ? 'oxford shirt' : itemId.includes('trouser') ? 'trouser' : 'tee',
          polishLevel: itemId.includes('tee') ? 'casual' : 'smart casual',
          qualityTier: itemId.endsWith('3') ? 'core' : 'premium',
          structureLevel: itemId.includes('tee') ? 'soft' : 'structured',
          tags: itemId.includes('tee') ? ['tee'] : ['workhorse'],
          texture: itemId.includes('tee') ? 'jersey' : 'smooth',
          visualWeight: itemId.includes('tee') ? 'light' : 'mid',
        },
        provenance,
        source: 'test',
      });
    }

    const analysis = await service.analyzeWardrobe({ focus: 'all' });
    assert.equal(analysis.gapLanes.some((entry) => entry.lane === 'loafer'), true);
    assert.equal(analysis.redundancyClusters.some((entry) => entry.lane === 'tee'), true);
    assert.equal(analysis.replacementCandidates.some((entry) => entry.itemId.startsWith('style-item:wardrobe-tee-')), true);
    assert.equal(analysis.buyNextCandidates.length > 0, true);
    assert.equal(analysis.buyNextCandidates.filter((entry) => entry.lane === 'loafer').length, 1);
    assert.equal(analysis.occasionCoverage.some((entry) => entry.occasion === 'smart_casual'), true);
    assert.equal(analysis.strengths.some((entry) => entry.lane === 'tee'), true);
    assert.equal(analysis.itemsById['style-item:wardrobe-trouser']?.name, 'Navy Trouser');

    const focused = await service.analyzeWardrobe({ focus: 'replacements' });
    assert.equal(focused.gapLanes.length, 0);
    assert.equal(focused.replacementCandidates.length > 0, true);

    const redundancyFocused = await service.analyzeWardrobe({ focus: 'redundancy' });
    assert.equal(redundancyFocused.weakSpots.some((entry) => entry.lane === 'loafer'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function subclustersRedundancyByRoleIntent() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    const items = [
      ['style-item:tee-basic-1', 'Black Tee 1'],
      ['style-item:tee-basic-2', 'Black Tee 2'],
      ['style-item:tee-basic-3', 'Black Tee 3'],
      ['style-item:tee-basic-4', 'Black Tee 4'],
      ['style-item:tee-training', 'Black Training Tee'],
      ['style-item:tee-graphic', 'Black Graphic Long Sleeve Tee'],
    ] as const;

    for (const [itemId, name] of items) {
      await service.upsertItem({
        item: {
          id: itemId,
          brand: 'Test',
          category: 'TOP',
          name,
          subcategory: 'Tee',
          color_family: 'black',
          formality: 1,
        },
        provenance,
      });
    }

    for (const itemId of ['style-item:tee-basic-1', 'style-item:tee-basic-2', 'style-item:tee-basic-3', 'style-item:tee-basic-4']) {
      await service.upsertItemProfile({
        itemId,
        profile: {
          bestOccasions: ['casual'],
          dressCode: { min: 1, max: 3 },
          itemType: 'tee',
          styleRole: 'workhorse',
          tags: ['tee'],
        },
        provenance,
        source: 'test',
      });
    }

    await service.upsertItemProfile({
      itemId: 'style-item:tee-training',
      profile: {
        bestOccasions: ['athletic'],
        dressCode: { min: 1, max: 1 },
        itemType: 'tee',
        styleRole: 'workhorse',
        tags: ['training', 'tee'],
      },
      provenance,
      source: 'test',
    });

    await service.upsertItemProfile({
      itemId: 'style-item:tee-graphic',
      profile: {
        bestOccasions: ['casual'],
        dressCode: { min: 1, max: 2 },
        itemType: 'long sleeve tee',
        styleRole: 'statement',
        tags: ['graphic tee', 'streetwear'],
      },
      provenance,
      source: 'test',
    });

    const analysis = await service.analyzeWardrobe({ focus: 'redundancy' });
    const teeClusters = analysis.redundancyClusters.filter((entry) => entry.lane === 'tee');
    assert.equal(teeClusters.length, 1);
    assert.equal(teeClusters[0]?.itemIds.length, 4);
    assert.equal(teeClusters[0]?.label.includes('casual basics lane'), true);
    assert.equal(teeClusters[0]?.notes.includes('visual inspection recommended before concluding true redundancy'), true);
    assert.equal(teeClusters[0]?.itemIds.includes('style-item:tee-training'), false);
    assert.equal(teeClusters[0]?.itemIds.includes('style-item:tee-graphic'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function bootstrapsProfilesForNewItems() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:auto-profile',
        brand: 'Test',
        category: 'TOP',
        name: 'Relaxed Linen Camp Shirt',
        subcategory: 'Shirt',
        color_family: 'beige',
        formality: 2,
      },
      provenance,
    });

    const item = await service.getItem('style-item:auto-profile');
    assert.equal(item?.comparatorKey, 'camp_shirt');
    assert.equal(item?.profile?.method, 'heuristic_bootstrap');
    assert.equal(item?.profile?.raw.itemType, 'camp shirt');
    assert.equal(item?.profile?.raw.styleRole, null);
    assert.equal(item?.profile?.raw.tags.includes('camp shirt'), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function analyzesPurchasesFromClosetAndCalibration() {
  const runtime = createTempRuntime();
  try {
    const service = new StyleService(runtime.env.db);
    const provenance = testProvenance();

    await service.updateProfile({
      profile: {
        hardAvoids: ['wool'],
        colorDirections: ['navy'],
        preferredSilhouettes: ['relaxed'],
        formalityTendency: 'smart casual',
      },
      provenance,
    });

    await service.upsertItem({
      item: {
        id: 'style-item:test-trouser',
        brand: 'Test Brand',
        name: 'Relaxed Trouser',
        category: 'BOTTOM',
        subcategory: 'Trouser',
        color_family: 'navy',
        formality: 3,
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:test-oxford-white',
        brand: 'Test Brand',
        name: 'White Oxford',
        category: 'TOP',
        subcategory: 'OCBD',
        color_family: 'white',
        formality: 3,
      },
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:test-oxford-white',
      profile: {
        itemType: 'oxford shirt',
        tags: ['shirt', 'white'],
      },
      provenance,
      source: 'test',
    });
    await service.upsertItem({
      item: {
        id: 'style-item:test-loafer',
        brand: 'Test Brand',
        name: 'Brown Loafer',
        category: 'SHOE',
        subcategory: 'Loafer',
        color_family: 'brown',
        formality: 4,
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:test-formal-oxford',
        brand: 'Test Brand',
        name: 'Black Cap Toe Oxford',
        category: 'SHOE',
        subcategory: 'Oxford/Derby',
        color_family: 'black',
        formality: 5,
      },
      provenance,
    });

    const extension = await service.analyzePurchase({
      candidate: {
        category: 'OUTERWEAR',
        colorFamily: 'navy',
        imageUrls: ['https://example.com/navy-jacket.jpg'],
        silhouette: 'relaxed',
        formality: 3,
        name: 'Relaxed Jacket',
      },
    });
    assert.equal(extension.alignmentSignals.matchedSignals.includes('preferred color direction (navy)'), true);
    assert.equal(extension.alignmentSignals.matchedSignals.includes('preferred silhouette (relaxed)'), true);
    assert.equal(extension.candidateSummary.hasCandidateImages, true);
    assert.equal(extension.candidateSummary.comparatorKey, 'jacket');
    assert.equal(extension.comparatorCoverage.mode, 'sparse');
    assert.equal(extension.tensionSignals.hardAvoid, null);
    assert.equal(extension.contextBuckets.exactComparatorItems.length, 0);
    assert.equal(extension.contextBuckets.pairingCandidates.some((entry) => entry.itemId === 'style-item:test-trouser'), true);
    assert.equal(extension.itemsById['style-item:test-trouser']?.name, 'Relaxed Trouser');
    assert.equal('exactSubcategoryItems' in extension.contextBuckets, false);

    const hardAvoid = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        notes: 'heavy wool knit',
        formality: 3,
        name: 'Wool Crewneck',
      },
    });
    assert.equal(hardAvoid.tensionSignals.hardAvoid, 'wool');
    assert.equal(hardAvoid.evidenceQuality.notes.includes('no candidate image provided; analysis relies on text attributes and closet state'), true);
    assert.equal(hardAvoid.comparatorCoverage.mode, 'category_fallback');
    assert.equal('similarItems' in hardAvoid, false);

    const adjacent = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        comparatorKey: 'oxford_shirt',
        colorFamily: 'pink',
        formality: 3,
        name: 'Soft Pink Oxford',
        subcategory: 'Oxford Shirt',
      },
    });
    assert.equal(adjacent.tensionSignals.paletteMismatch, true);
    assert.equal(adjacent.comparatorCoverage.mode, 'exact_comparator');
    assert.equal(adjacent.contextBuckets.exactComparatorItems.some((entry) => entry.itemId === 'style-item:test-oxford-white'), true);
    assert.equal(adjacent.contextBuckets.typedRoleItems.some((entry) => entry.itemId === 'style-item:test-oxford-white'), true);
    assert.equal(adjacent.contextBuckets.pairingCandidates.some((entry) => entry.itemId === 'style-item:test-trouser'), true);
    assert.equal(adjacent.itemsById['style-item:test-oxford-white']?.subcategory, 'OCBD');
    assert.equal('relatedItems' in adjacent, false);

    const casualShirt = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        colorFamily: 'beige',
        formality: 2,
        name: 'Relaxed Linen Shirt',
        notes: 'relaxed linen button-up for summer',
        subcategory: 'Shirt',
      },
    });
    assert.equal(casualShirt.candidateSummary.comparatorKey, 'camp_shirt');

    await service.upsertItem({
      item: {
        id: 'style-item:test-pants-role',
        brand: 'AG',
        category: 'BOTTOM',
        name: 'Everett Slim Straight',
        subcategory: 'Pants',
        color_family: 'beige',
        formality: 3,
      },
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:test-pants-role',
      profile: {
        itemType: 'pants',
        tags: ['pants'],
      },
      provenance,
      source: 'test',
    });
    await service.upsertItem({
      item: {
        id: 'style-item:test-athletic-jogger',
        brand: 'Adidas',
        category: 'BOTTOM',
        name: 'Training Jogger',
        subcategory: 'Jogger',
        color_family: 'black',
        formality: 1,
      },
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:test-athletic-jogger',
      profile: {
        bestOccasions: ['athletic'],
        dressCode: { min: 1, max: 1 },
        itemType: 'jogger',
        tags: ['training', 'jogger'],
      },
      provenance,
      source: 'test',
    });
    const typedRoleFallback = await service.analyzePurchase({
      candidate: {
        category: 'BOTTOM',
        colorFamily: 'beige',
        formality: 3,
        name: 'Summer Trouser',
        subcategory: 'Trouser',
      },
    });
    assert.equal(typedRoleFallback.contextBuckets.typedRoleItems.some((entry) => entry.itemId === 'style-item:test-pants-role'), true);

    const exactShoe = await service.analyzePurchase({
      candidate: {
        category: 'SHOE',
        colorFamily: 'brown',
        comparatorKey: 'loafer',
        formality: 4,
        name: 'Dark Brown Suede Loafer',
        subcategory: 'Loafer',
      },
    });
    assert.equal(exactShoe.comparatorCoverage.mode, 'exact_comparator');
    assert.equal(exactShoe.contextBuckets.exactComparatorItems.some((entry) => entry.itemId === 'style-item:test-loafer'), true);
    assert.equal(exactShoe.coverageImpact.strengthensWeakArea, false);
    assert.equal(exactShoe.coverageImpact.pilesIntoCoveredLane, false);

    const campShirt = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        comparatorKey: 'camp_shirt',
        colorFamily: 'navy',
        formality: 2,
        name: 'Camp Collar Shirt',
        subcategory: 'Short Sleeve Button-Up',
      },
    });
    assert.equal(campShirt.contextBuckets.pairingCandidates.some((entry) => entry.itemId === 'style-item:test-athletic-jogger'), false);

    const formalOxford = await service.getItem('style-item:test-formal-oxford');
    assert.equal(formalOxford?.comparatorKey, 'oxford');

    const sportUtility = await service.analyzePurchase({
      candidate: {
        category: 'OUTERWEAR',
        colorFamily: 'neon',
        name: 'Technical Running Shell',
        notes: 'technical running shell for wet weather',
      },
    });
    assert.equal(
      sportUtility.tensionSignals.notes.includes('reads as sport or utility gear rather than a core wardrobe lane piece'),
      true,
    );
    assert.equal(sportUtility.tensionSignals.sportUtilityException, true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function filtersActionableEvidenceGaps() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:unknown-comparator',
        brand: 'Test',
        category: 'ACCESSORY',
        color_family: 'blue',
        formality: 2,
        name: 'Mystery Accessory',
        subcategory: 'Unknown',
      },
      provenance,
    });
    await service.upsertItemPhotos({
      itemId: 'style-item:unknown-comparator',
      photos: [
        {
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
          id: 'style-photo:unknown-comparator-1',
          is_primary: true,
          view: 'front',
        },
      ],
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:unknown-comparator',
      profile: {
        itemType: 'mystery top',
        tags: ['odd'],
      },
      provenance,
      source: 'test',
    });

    const actionable = await service.listEvidenceGaps({ priorityFilter: 'actionable' });
    assert.equal(actionable.items.length, 1);
    assert.equal(actionable.items[0]?.gapTypes.includes('weak_comparator_identity'), true);
    assert.equal(actionable.appliedPriorityFilter, 'actionable');

    const lowOnly = await service.listEvidenceGaps({ priorityFilter: 'low' });
    assert.equal(lowOnly.items.length, 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function prioritizesDescriptorBacklogByImpactAndPhotoSupport() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    for (const itemId of ['style-item:backlog-tee-1', 'style-item:backlog-tee-2', 'style-item:backlog-tee-3']) {
      await service.upsertItem({
        item: {
          id: itemId,
          brand: 'Test',
          category: 'TOP',
          name: itemId.replace('style-item:', ''),
          subcategory: 'T-Shirt',
          color_family: 'black',
          formality: 1,
        },
        provenance,
      });
      await service.upsertItemPhotos({
        itemId,
        photos: [
          {
            data_url:
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
            id: `${itemId}:fit-photo`,
            is_primary: true,
            kind: 'fit',
            view: 'fit_front',
          },
        ],
        provenance,
      });
      await service.upsertItemProfile({
        itemId,
        profile: {
          bestOccasions: ['casual'],
          dressCode: { min: 1, max: 2 },
          itemType: 'tee',
          styleRole: 'workhorse',
          tags: ['tee'],
        },
        provenance,
        source: 'test',
      });
    }

    await service.upsertItem({
      item: {
        id: 'style-item:backlog-trouser',
        brand: 'Test',
        category: 'BOTTOM',
        name: 'Backlog Trouser',
        subcategory: 'Trouser',
        color_family: 'navy',
        formality: 3,
      },
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:backlog-trouser',
      profile: {
        dressCode: { min: 2, max: 4 },
        itemType: 'trouser',
        pairingNotes: 'works with loafers and oxfords',
        tags: ['trouser'],
      },
      provenance,
      source: 'test',
    });

    const priorityBacklog = await service.listDescriptorBacklog({ focus: 'priority', maxItems: 10 });
    assert.equal(priorityBacklog.entries.some((entry) => entry.itemId === 'style-item:backlog-trouser'), false);
    const teeEntry = priorityBacklog.entries.find((entry) => entry.itemId === 'style-item:backlog-tee-1');
    assert.equal(Boolean(teeEntry), true);
    assert.equal(teeEntry?.photoSupport.deliverableFitPhoto, true);
    assert.equal(teeEntry?.missingDescriptorFields.includes('fitObservations'), true);
    assert.equal(teeEntry?.missingDescriptorFields.includes('silhouette'), true);
    assert.equal(teeEntry?.productSafeFields.includes('texture'), true);
    assert.equal(teeEntry?.sourceSignals.includes('redundancy_cluster'), true);

    const blockedBacklog = await service.listDescriptorBacklog({ focus: 'blocked', maxItems: 10 });
    const trouserEntry = blockedBacklog.entries.find((entry) => entry.itemId === 'style-item:backlog-trouser');
    assert.equal(Boolean(trouserEntry), true);
    assert.equal(trouserEntry?.blockedByPhoto, true);
    assert.equal(trouserEntry?.reasons.some((reason) => reason.includes('blocked')), true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function doesNotMarkGapFillPurchaseAsCoveredLane() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:test-sneaker',
        brand: 'Test Brand',
        category: 'SHOE',
        name: 'White Sneaker',
        subcategory: 'Sneaker',
        color_family: 'white',
        formality: 2,
      },
      provenance,
    });
    await service.upsertItem({
      item: {
        id: 'style-item:test-derby',
        brand: 'Test Brand',
        category: 'SHOE',
        name: 'Black Derby',
        subcategory: 'Oxford/Derby',
        color_family: 'black',
        formality: 5,
      },
      provenance,
    });

    const analysis = await service.analyzePurchase({
      candidate: {
        category: 'SHOE',
        colorFamily: 'brown',
        comparatorKey: 'loafer',
        formality: 3,
        name: 'Brown Suede Loafer',
        subcategory: 'Loafer',
      },
    });

    assert.equal(analysis.coverageImpact.strengthensWeakArea, true);
    assert.equal(analysis.coverageImpact.pilesIntoCoveredLane, false);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function enrichesPurchaseAnalysisWithDescriptorEvidence() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:descriptor-sweater',
        brand: 'Gap',
        category: 'TOP',
        color_family: 'navy',
        formality: 3,
        name: 'CashSoft Crew',
        subcategory: 'Sweater',
      },
      provenance,
    });
    await service.upsertItemProfile({
      itemId: 'style-item:descriptor-sweater',
      profile: {
        descriptorConfidence: 0.8,
        fabricHand: 'fuzzy',
        itemType: 'sweater',
        polishLevel: 'casual-soft',
        qualityTier: 'core',
        structureLevel: 'soft',
        tags: ['sweater'],
        texture: 'brushed',
        useCases: ['weekend', 'casual office'],
        visualWeight: 'mid',
      },
      provenance,
      source: 'test',
    });

    const withImage = await service.analyzePurchase({
      candidate: {
        brand: 'Sunspel',
        category: 'TOP',
        colorFamily: 'navy',
        comparatorKey: 'sweater',
        descriptorConfidence: 0.95,
        fabricHand: 'smooth',
        formality: 3,
        imageUrl: 'https://example.com/sunspel-navy-sweater.jpg',
        name: 'Cashmere Crew',
        polishLevel: 'refined',
        qualityTier: 'investment',
        structureLevel: 'structured',
        subcategory: 'Sweater',
        texture: 'fine gauge',
        useCases: ['smart casual', 'dinner'],
        visualWeight: 'light',
      },
    });

    assert.equal(withImage.candidateDescriptorSummary?.qualityTier, 'investment');
    assert.equal(withImage.candidateSummary.hasCandidateImages, true);
    assert.equal(withImage.comparatorDescriptorSummaries['style-item:descriptor-sweater']?.fabricHand, 'fuzzy');
    assert.equal(Array.isArray(withImage.descriptorDeltas), true);
    assert.equal(Array.isArray(withImage.coverageImpact.notes), true);
    assert.equal(Array.isArray(withImage.laneAssessment.notes), true);

    const withoutImage = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        colorFamily: 'navy',
        comparatorKey: 'sweater',
        formality: 3,
        name: 'Text Only Sweater',
        subcategory: 'Sweater',
      },
    });
    assert.equal(withoutImage.candidateSummary.hasCandidateImages, false);
    assert.equal(withoutImage.confidenceNotes.length > 0, true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function preservesExplicitSaveFlowWithoutGeneratedImages() {
  const runtime = createTempRuntime();
  try {
    const service = new StyleService(runtime.env.db);
    const provenance = testProvenance();

    const initialCount = await countItems(service);
    const analyzedOnly = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        colorFamily: 'navy',
        name: 'Navy Polo',
        subcategory: 'Polo',
      },
    });
    assert.equal(analyzedOnly.candidateSummary.comparatorKey, 'polo');
    assert.equal(await countItems(service), initialCount);

    const keepNoAnalysis = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        colorFamily: 'white',
        name: 'White Hoodie',
        subcategory: 'Hoodie',
      },
    });
    assert.equal(keepNoAnalysis.candidateSummary.comparatorKey, 'hoodie');
    assert.equal(await countItems(service), initialCount);

    await service.upsertItem({
      item: {
        id: 'style-item:test-save-listing',
        brand: 'Test Brand',
        category: 'TOP',
        name: 'Navy Polo',
        subcategory: 'Polo',
        color_family: 'navy',
        formality: 2,
      },
      provenance,
    });
    await service.upsertItemPhotos({
      itemId: 'style-item:test-save-listing',
      photos: [
        {
          id: 'style-photo:test-save-listing-front',
          is_primary: true,
          url: 'https://example.com/navy-polo-front.jpg',
          view: 'FRONT',
        },
      ],
      provenance,
    });

    const listingSaved = await service.getItem('style-item:test-save-listing');
    assert(listingSaved);
    assert.equal(await countItems(service), initialCount + 1);
    assert.equal(listingSaved.status, 'active');
    assert.equal(listingSaved.comparatorKey, 'polo');
    assert.equal(listingSaved.category, 'TOP');
    assert.equal(listingSaved.subcategory, 'Polo');
    assert.equal(listingSaved.photos.length, 1);
    assert.equal(listingSaved.photos[0]?.kind, 'product');
    assert.equal(listingSaved.photos[0]?.source, 'user_upload');
    assert.equal(listingSaved.photos[0]?.isPrimary, true);

    await service.upsertItem({
      item: {
        id: 'style-item:test-save-user-photo',
        brand: 'Test Brand',
        category: 'TOP',
        name: 'Heather Gray Hoodie',
        subcategory: 'Hoodie',
        color_family: 'gray',
        formality: 1,
      },
      provenance,
    });
    await service.upsertItemPhotos({
      itemId: 'style-item:test-save-user-photo',
      photos: [
        {
          id: 'style-photo:test-save-user-photo-1',
          is_primary: true,
          url: 'https://example.com/user-hoodie-photo.jpg',
          view: 'unknown',
        },
      ],
      provenance,
    });

    const userPhotoSaved = await service.getItem('style-item:test-save-user-photo');
    assert(userPhotoSaved);
    assert.equal(await countItems(service), initialCount + 2);
    assert.equal(userPhotoSaved.status, 'active');
    assert.equal(userPhotoSaved.comparatorKey, 'hoodie');
    assert.equal(userPhotoSaved.photos.length, 1);
    assert.equal(userPhotoSaved.photos[0]?.source, 'user_upload');
    assert.equal(userPhotoSaved.photos[0]?.kind, 'unknown');

    await service.upsertItem({
      item: {
        id: 'style-item:test-save-fit-only',
        brand: 'Test Brand',
        category: 'BOTTOM',
        name: 'Relaxed Black Trouser',
        subcategory: 'Trouser',
        color_family: 'black',
        formality: 3,
      },
      provenance,
    });
    await service.upsertItemPhotos({
      itemId: 'style-item:test-save-fit-only',
      photos: [
        {
          id: 'style-photo:test-save-fit-only-1',
          is_fit: true,
          is_primary: true,
          url: 'https://example.com/fit-trouser-photo.jpg',
          view: 'fit side',
        },
      ],
      provenance,
    });

    const fitOnlySaved = await service.getItem('style-item:test-save-fit-only');
    assert(fitOnlySaved);
    assert.equal(await countItems(service), initialCount + 3);
    assert.equal(fitOnlySaved.status, 'active');
    assert.equal(fitOnlySaved.comparatorKey, 'trouser');
    assert.equal(fitOnlySaved.photos.length, 1);
    assert.equal(fitOnlySaved.photos[0]?.kind, 'fit');
    assert.equal(fitOnlySaved.photos[0]?.source, 'user_upload');
    assert.equal(fitOnlySaved.photos[0]?.isFit, true);

    await service.upsertItemPhotos({
      itemId: 'style-item:test-save-fit-only',
      photos: [
        {
          id: 'style-photo:test-save-fit-only-1',
          is_fit: true,
          is_primary: false,
          url: 'https://example.com/fit-trouser-photo.jpg',
          view: 'fit side',
        },
        {
          id: 'style-photo:test-save-fit-only-2',
          is_primary: true,
          url: 'https://example.com/trouser-front.jpg',
          view: 'front',
        },
      ],
      provenance,
    });

    const followUpSaved = await service.getItem('style-item:test-save-fit-only');
    assert(followUpSaved);
    assert.equal(await countItems(service), initialCount + 3);
    assert.equal(followUpSaved.photos.length, 2);
    assert.equal(followUpSaved.photos.filter((photo) => photo.kind === 'fit').length, 1);
    assert.equal(followUpSaved.photos.filter((photo) => photo.kind === 'product').length, 1);
    assert.equal(followUpSaved.photos.some((photo) => photo.id === 'style-photo:test-save-fit-only-2'), true);
    assert.equal(followUpSaved.photos.find((photo) => photo.id === 'style-photo:test-save-fit-only-2')?.isPrimary, true);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function acceptsCandidateImageUrlsInPurchaseAnalysis() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const candidateImageUrl = 'https://example.com/cos-merino-navy.jpg';

    const analysis = await service.analyzePurchase({
      candidate: {
        category: 'TOP',
        colorFamily: 'navy',
        formality: 3,
        imageUrl: candidateImageUrl,
        name: 'Merino Crew Neck Sweater',
        subcategory: 'Sweater',
      },
    });
    assert.deepEqual(analysis.candidate.imageUrls, [candidateImageUrl]);
    assert.equal(analysis.candidateSummary.hasCandidateImages, true);
    assert.equal(analysis.evidenceQuality.candidateImageCount, 1);
    assert.equal(
      analysis.evidenceQuality.notes.includes('no candidate image provided; analysis relies on text attributes and closet state'),
      false,
    );

    const bundle = await service.getVisualBundle({
      candidate: {
        category: 'TOP',
        colorFamily: 'navy',
        formality: 3,
        image_url: candidateImageUrl,
        name: 'Merino Crew Neck Sweater',
        subcategory: 'Sweater',
      },
      includeComparators: false,
      maxImages: 1,
    });
    assert.equal(bundle.assets.length, 1);
    assert.equal(bundle.assets[0]?.role, 'candidate');
    assert.equal(bundle.assets[0]?.sourceUrl, candidateImageUrl);
    assert.equal(bundle.assets[0]?.authenticatedOriginalUrl, null);
    assert.equal(bundle.assets[0]?.fallbackSignedOriginalUrl, null);
    assert.equal(
      bundle.evidenceWarnings.includes('Candidate did not include an image, so the visual bundle cannot inspect it directly.'),
      false,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function rejectsHostedLocalUploadPathPhotos() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:local-upload-reject',
        brand: 'Test',
        category: 'TOP',
        name: 'Upload Reject Tee',
        subcategory: 'Tee',
      },
      provenance,
    });

    await assert.rejects(
      () =>
        service.upsertItemPhotos({
          itemId: 'style-item:local-upload-reject',
          photos: [
            {
              id: 'style-photo:local-upload-reject-1',
              is_primary: true,
              url: '/mnt/user-data/uploads/IMG_9999.jpeg',
            },
          ],
          provenance,
        }),
      /cannot ingest local upload paths directly/i,
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function deliversOwnedStyleImagesFromLocalRuntime() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:test-owned-photo',
        brand: 'Test Brand',
        category: 'TOP',
        name: 'Owned Photo Tee',
        subcategory: 'T-Shirt',
        color_family: 'white',
        formality: 1,
      },
      provenance,
    });

    await service.upsertItemPhotos({
      itemId: 'style-item:test-owned-photo',
      photos: [
        {
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
          id: 'style-photo:test-owned-photo-1',
          is_primary: true,
          view: 'front',
        },
      ],
      provenance,
    });

    const item = await service.getItem('style-item:test-owned-photo');
    assert(item);
    assert.equal(item.photos.length, 1);
    assert.equal(item.photos[0]?.artifactId?.startsWith('artifact:style-photo:'), true);
    assert.equal(item.photos[0]?.delivery?.auth, 'oauth_bearer');
    assert.equal(item.photos[0]?.mimeType, 'image/png');
    assert.equal(item.photos[0]?.url.startsWith('artifact:'), true);

    const unauthenticated = await maybeHandleStyleImageRequest(
      new Request(item.photos[0]!.delivery!.originalUrl),
      runtime.env,
    );
    assert(unauthenticated);
    assert.equal(unauthenticated.status, 401);

    const response = await maybeHandleStyleImageRequest(
      new Request(item.photos[0]!.delivery!.originalUrl, {
        headers: { authorization: `Bearer ${runtime.env.IMAGE_DELIVERY_SECRET!}` },
      }),
      runtime.env,
    );
    assert(response);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert((await response.arrayBuffer()).byteLength > 0);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function backfillsLegacyRelativePhotoPathsFromMountedRoot() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();
    const legacyRoot = path.join(runtime.paths.rootDir, 'legacy-source');
    const legacyFile = path.join(legacyRoot, 'images', 'u2', 'photos', 'legacy-tee.png');
    mkdirSync(path.dirname(legacyFile), { recursive: true });
    writeFileSync(
      legacyFile,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=', 'base64'),
    );

    await service.upsertItem({
      item: {
        id: 'style-item:test-legacy-backfill',
        brand: 'Test Brand',
        category: 'TOP',
        name: 'Legacy Tee',
        subcategory: 'T-Shirt',
        color_family: 'white',
        formality: 1,
      },
      provenance,
    });

    await service.upsertItemPhotos({
      itemId: 'style-item:test-legacy-backfill',
      photos: [
        {
          id: 'style-photo:test-legacy-backfill-1',
          is_primary: true,
          url: '/images/u2/photos/legacy-tee.png',
          view: 'front',
        },
      ],
      provenance,
    });

    const before = await service.getItem('style-item:test-legacy-backfill');
    assert(before);
    assert.equal(before.photos[0]?.artifactId, null);

    const result = await service.backfillOwnedPhotoAssets({
      legacyImageRoot: legacyRoot,
    });

    assert.equal(result.backfilled, 1);
    assert.equal(result.failed.length, 0);

    const after = await service.getItem('style-item:test-legacy-backfill');
    assert(after);
    assert.equal(after.photos[0]?.artifactId?.startsWith('artifact:style-photo:'), true);
    assert.equal(after.photos[0]?.delivery?.auth, 'oauth_bearer');
    assert.equal(after.photos[0]?.mimeType, 'image/png');
  } finally {
    runtime.sqliteDb.close();
  }
}

async function authenticatesHostedStyleImages() {
  const runtime = createTempRuntime();
  try {
    const hostedEnv = createHostedStyleEnv(runtime, 'https://hosted-fluent.example.com');
    const service = new StyleService(hostedEnv.DB, {
      artifacts: hostedEnv.ARTIFACTS,
      imageDeliverySecret: hostedEnv.IMAGE_DELIVERY_SECRET,
      origin: hostedEnv.PUBLIC_BASE_URL,
    });
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:test-hosted-photo',
        brand: 'Test Brand',
        category: 'TOP',
        name: 'Hosted Photo Tee',
        subcategory: 'T-Shirt',
        color_family: 'white',
        formality: 1,
      },
      provenance,
    });
    await service.upsertItemPhotos({
      itemId: 'style-item:test-hosted-photo',
      photos: [
        {
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
          id: 'style-photo:test-hosted-photo-1',
          is_primary: true,
          view: 'front',
        },
      ],
      provenance,
    });

    const item = await service.getItem('style-item:test-hosted-photo');
    assert(item?.photos[0]?.delivery?.originalUrl);
    assert.equal(item.photos[0]?.delivery?.auth, 'oauth_bearer');

    const missingAuth = await maybeHandleStyleImageRequest(new Request(item.photos[0]!.delivery!.originalUrl), hostedEnv);
    assert(missingAuth);
    assert.equal(missingAuth.status, 401);

    const goodAuth = await maybeHandleStyleImageRequest(
      new Request(item.photos[0]!.delivery!.originalUrl, {
        headers: { authorization: 'Bearer good-token' },
      }),
      hostedEnv,
    );
    assert(goodAuth);
    assert.equal(goodAuth.status, 200);

    const wrongAudience = await maybeHandleStyleImageRequest(
      new Request(item.photos[0]!.delivery!.originalUrl, {
        headers: { authorization: 'Bearer wrong-audience-token' },
      }),
      hostedEnv,
    );
    assert(wrongAudience);
    assert.equal(wrongAudience.status, 401);

    const insufficientScope = await maybeHandleStyleImageRequest(
      new Request(item.photos[0]!.delivery!.originalUrl, {
        headers: { authorization: 'Bearer no-style-scope-token' },
      }),
      hostedEnv,
    );
    assert(insufficientScope);
    assert.equal(insufficientScope.status, 403);

    const visualBundle = await service.getVisualBundle({
      deliveryMode: 'authenticated_with_signed_fallback',
      itemIds: ['style-item:test-hosted-photo'],
      maxImages: 1,
    });
    assert.equal(visualBundle.assets.length, 1);
    assert(visualBundle.assets[0]?.fallbackSignedOriginalUrl);

    const signedOk = await maybeHandleStyleImageRequest(
      new Request(visualBundle.assets[0]!.fallbackSignedOriginalUrl!),
      hostedEnv,
    );
    assert(signedOk);
    assert.equal(signedOk.status, 200);

    const expiredSigned = new URL(visualBundle.assets[0]!.fallbackSignedOriginalUrl!);
    expiredSigned.searchParams.set('exp', '2020-01-01T00:00:00.000Z');
    const expiredResponse = await maybeHandleStyleImageRequest(new Request(expiredSigned.toString()), hostedEnv);
    assert(expiredResponse);
    assert.equal(expiredResponse.status, 401);

    const tamperedSigned = new URL(visualBundle.assets[0]!.fallbackSignedOriginalUrl!);
    tamperedSigned.searchParams.set('sig', 'deadbeef');
    const tamperedResponse = await maybeHandleStyleImageRequest(new Request(tamperedSigned.toString()), hostedEnv);
    assert(tamperedResponse);
    assert.equal(tamperedResponse.status, 403);
  } finally {
    runtime.sqliteDb.close();
  }
}

async function prefersDeliverablePhotosInVisualBundles() {
  const runtime = createTempRuntime();
  try {
    const service = createStyleService(runtime);
    const provenance = testProvenance();

    await service.upsertItem({
      item: {
        id: 'style-item:test-bundle-photo-choice',
        brand: 'Test Brand',
        category: 'SHOE',
        name: 'Bundle Photo Choice Sneaker',
        subcategory: 'Sneaker',
        color_family: 'white',
        formality: 2,
      },
      provenance,
    });

    await service.upsertItemPhotos({
      itemId: 'style-item:test-bundle-photo-choice',
      photos: [
        {
          id: 'style-photo:test-bundle-photo-choice-primary',
          is_primary: true,
          url: '/images/u2/photos/non-deliverable-primary.jpg',
          view: 'front',
        },
        {
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
          id: 'style-photo:test-bundle-photo-choice-secondary',
          is_primary: false,
          view: 'side',
        },
        {
          data_url:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2G8kAAAAASUVORK5CYII=',
          id: 'style-photo:test-bundle-photo-choice-fit',
          is_fit: true,
          is_primary: false,
          view: 'fit side',
        },
      ],
      provenance,
    });

    const item = await service.getItem('style-item:test-bundle-photo-choice');
    assert(item);
    assert.equal(item.photos.find((photo) => photo.id === 'style-photo:test-bundle-photo-choice-primary')?.delivery, null);
    assert.equal(
      item.photos.find((photo) => photo.id === 'style-photo:test-bundle-photo-choice-secondary')?.delivery?.auth,
      'oauth_bearer',
    );

    const bundle = await service.getVisualBundle({
      deliveryMode: 'authenticated_with_signed_fallback',
      itemIds: ['style-item:test-bundle-photo-choice'],
      maxImages: 1,
    });

    assert.equal(bundle.assets.length, 1);
    assert.equal(bundle.assets[0]?.photoId, 'style-photo:test-bundle-photo-choice-fit');
    assert.equal(bundle.assets[0]?.authenticatedOriginalUrl?.includes('/images/style/style-photo%3Atest-bundle-photo-choice-fit/original'), true);
    assert.equal(bundle.assets[0]?.fallbackSignedOriginalUrl?.includes('sig='), true);
    assert.equal(bundle.evidenceWarnings.includes('Bundle Photo Choice Sneaker does not have an owned Fluent image delivery route yet.'), false);
  } finally {
    runtime.sqliteDb.close();
  }
}

function createTempRuntime() {
  const root = mkdtempSync(path.join(tmpdir(), 'fluent-style-phase1-'));
  tempRoots.push(root);
  return createLocalRuntime({
    origin: 'http://127.0.0.1:8788',
    rootDir: root,
  });
}

function createStyleService(runtime: ReturnType<typeof createTempRuntime>) {
  return new StyleService(runtime.env.db, {
    artifacts: runtime.env.ARTIFACTS,
    imageDeliverySecret: runtime.env.IMAGE_DELIVERY_SECRET,
    origin: runtime.env.PUBLIC_BASE_URL,
  });
}

function createHostedStyleEnv(runtime: ReturnType<typeof createTempRuntime>, origin: string) {
  return {
    ...runtime.env,
    IMAGE_DELIVERY_SECRET: 'hosted-image-secret',
    OAUTH_PROVIDER: {
      async unwrapToken(token: string) {
        if (token === 'good-token') {
          return {
            audience: origin,
            grant: {
              props: {
                oauthClientId: 'test-client',
                oauthClientName: 'Test Client',
                scope: ['style:read'],
              },
            },
            scope: ['style:read'],
          };
        }
        if (token === 'wrong-audience-token') {
          return {
            audience: 'https://other.example.com',
            grant: {
              props: {
                oauthClientId: 'test-client',
                oauthClientName: 'Test Client',
                scope: ['style:read'],
              },
            },
            scope: ['style:read'],
          };
        }
        if (token === 'no-style-scope-token') {
          return {
            audience: origin,
            grant: {
              props: {
                oauthClientId: 'test-client',
                oauthClientName: 'Test Client',
                scope: ['health:read'],
              },
            },
            scope: ['health:read'],
          };
        }
        return null;
      },
    },
    PUBLIC_BASE_URL: origin,
  };
}

function testProvenance() {
  return {
    actorEmail: 'tester@example.com',
    actorName: 'Shane Rodness',
    confidence: 1,
    scopes: ['style:write'],
    sessionId: 'style-phase2-test',
    sourceAgent: 'codex-test',
    sourceSkill: 'fluent-style',
    sourceType: 'test',
  };
}

async function countItems(service: StyleService) {
  return (await service.listItems()).length;
}
