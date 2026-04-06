import assert from 'node:assert/strict';
import { buildStyleImportBundle, buildStyleImportSql } from '../src/domains/style/import';

const bundle = buildStyleImportBundle({
  tables: {
    items: [
      {
        id: 42,
        brand: 'COS',
        name: 'Clean Shirt',
        category: 'TOP',
        subcategory: 'Shirt',
        field_evidence: JSON.stringify({ colorFamily: { value: 'blue' } }),
        technical_metadata: JSON.stringify({ aestheticLane: 'Minimal' }),
        llm_ratings: JSON.stringify({ overallScore10: 9.4 }),
      },
    ],
    photos: [
      {
        id: 7,
        imported_from: 'fluent-web',
        is_fit: false,
        is_primary: true,
        item_id: 42,
        url: 'https://cdn.example.com/items/42-front.jpg',
        view: 'FRONT',
      },
    ],
    item_profiles: [
      {
        id: 12,
        item_id: 42,
        raw_json: JSON.stringify({
          itemType: 'oxford shirt',
          tags: ['shirt', 'workhorse'],
        }),
      },
    ],
  },
});

assert.equal(bundle.items.length, 1);
assert.equal(bundle.items[0].id, 'style-item:fluent-web:42');
assert.equal(bundle.items[0].comparatorKey, 'oxford_shirt');
assert.equal(bundle.items[0].status, 'active');
assert.equal(bundle.provenance.length, 1);
assert.equal(bundle.photos.length, 1);
assert.equal(bundle.photos[0]?.kind, 'product');
assert.equal(bundle.photos[0]?.source, 'imported');
assert.equal(bundle.photos[0]?.view, 'front');
assert.equal(bundle.profile.onboardingPath, 'seeded');
assert.equal(bundle.profile.practicalCalibrationConfirmed, false);
assert.equal(bundle.profile.tasteCalibrationConfirmed, false);
assert.equal(bundle.summary.itemCount, 1);
assert.ok(!JSON.stringify(bundle.provenance[0].sourceSnapshot).includes('llm_ratings'));
const sql = buildStyleImportSql(bundle, {
  importSource: 'C:/tmp/wardrobe_d1.json',
  importedAt: '2026-03-28T00:00:00.000Z',
  runId: 'style-import:test',
});
assert.ok(sql.includes('style_import_runs'));
assert.ok(sql.includes('style-item:fluent-web:42'));
assert.ok(sql.includes('status'));
assert.ok(sql.includes('captured_at'));
assert.ok(sql.includes('comparator_key'));
assert.ok(sql.includes('kind'));
assert.ok(sql.includes('source'));
assert.ok(!sql.includes('llm_ratings'));

console.log('style import bundle ok');
