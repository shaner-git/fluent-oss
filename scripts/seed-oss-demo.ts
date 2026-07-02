import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runWithFluentAuthProps, type MutationProvenance } from '../src/auth';
import { BudgetsService, type BudgetCategory } from '../src/domains/budgets/service';
import { MealsService } from '../src/domains/meals/service';
import { StyleService } from '../src/domains/style/service';
import { FLUENT_OWNER_PROFILE_ID, FLUENT_PRIMARY_TENANT_ID } from '../src/fluent-identity';
import { cliString, parseCliArgs, resolveCliRoot } from '../src/local/cli';
import { defaultLocalScopes } from '../src/local/auth';
import { createLocalRuntime, LOCAL_DEFAULT_HOST, LOCAL_DEFAULT_PORT } from '../src/local/runtime';

const args = parseCliArgs(process.argv.slice(2));
const cwd = path.resolve(cliString(args, 'cwd') ?? process.cwd());
const fixturePath = path.resolve(cwd, cliString(args, 'fixture') ?? 'tests/fixtures/oss-demo-profile.json');
const rootDir = resolveCliRoot({ args, cwd });
const origin = cliString(args, 'origin') ?? `http://${LOCAL_DEFAULT_HOST}:${LOCAL_DEFAULT_PORT}`;

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main(): Promise<void> {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as DemoFixture;
  const runtime = createLocalRuntime({ origin, rootDir });

  try {
    const result = await runWithFluentAuthProps(
      {
        accessToken: 'oss-demo-seed',
        email: 'oss-demo@fluent.local',
        name: 'Fluent OSS Demo Seeder',
        oauthClientId: 'fluent-oss-demo-seed',
        oauthClientName: 'Fluent OSS Demo Seeder',
        profileId: FLUENT_OWNER_PROFILE_ID,
        scope: defaultLocalScopes(),
        tenantId: FLUENT_PRIMARY_TENANT_ID,
      },
      async () => {
        const provenance = buildProvenance(fixture.id);
        const style = new StyleService(runtime.env.db, {
          artifacts: runtime.env.artifacts,
          imageDeliverySecret: runtime.env.imageDeliverySecret,
          origin,
        });
        const budgets = new BudgetsService(runtime.env.db);
        const meals = new MealsService(runtime.env.db);

        const styleResult = await seedStyle(style, fixture.style, provenance);
        const budgetResult = await seedBudgets(budgets, fixture.budgets, provenance);
        const mealsResult = await seedMeals(meals, fixture.meals, provenance);

        return {
          budgets: budgetResult,
          meals: mealsResult,
          style: styleResult,
        };
      },
    );

    console.log(
      JSON.stringify(
        {
          ...result,
          fixtureId: fixture.id,
          fixturePath,
          idempotency: 'safe-rerunnable: stable style, recipe, plan, inventory, and budget records are updated; budget spend is only topped up to the fixture target.',
          ok: true,
          root: runtime.paths.rootDir,
          sqliteDb: runtime.paths.dbPath,
        },
        null,
        2,
      ),
    );
  } finally {
    runtime.sqliteDb.close();
  }
}

async function seedStyle(style: StyleService, fixture: DemoFixture['style'], provenance: MutationProvenance) {
  await style.updateProfile({ profile: fixture.profile, provenance });

  const items = [];
  for (const entry of fixture.items) {
    const item = await style.upsertItem({
      item: entry.item,
      provenance,
      sourceSnapshot: { fixture: 'oss-demo', fixtureItemId: entry.item.id },
    });
    const fieldEvidence = Object.fromEntries(
      Object.keys(entry.profile).map((field) => [
        field,
        {
          confidence: provenance.confidence,
          source: 'host_text',
        },
      ]),
    );
    const profile = await style.upsertItemProfile({
      fieldEvidence,
      hasImage: false,
      itemId: item.id,
      method: 'host_text',
      profile: entry.profile,
      provenance,
      source: 'host_text',
      sourceSnapshot: { fixture: 'oss-demo', fixtureItemId: entry.item.id },
    });
    items.push({ id: item.id, name: item.name, profileSource: profile.source });
  }

  return {
    itemCount: items.length,
    items,
  };
}

async function seedBudgets(budgets: BudgetsService, fixture: DemoFixture['budgets'], provenance: MutationProvenance) {
  const envelopes = [];
  for (const envelope of fixture.envelopes) {
    await budgets.setBudgetEnvelope({
      category: envelope.category,
      currency: envelope.currency,
      monthlyAmount: envelope.monthlyAmount,
      provenance,
    });
    const beforeSpend = await budgets.getPurchaseContext({ category: envelope.category });
    const currentSpend = beforeSpend.targetSetup?.spentThisPeriod ?? 0;
    const spendDelta = Number((envelope.targetSpent - currentSpend).toFixed(2));
    let loggedSpend = 0;
    if (spendDelta > 0) {
      await budgets.logBudgetSpend({
        amount: spendDelta,
        category: envelope.category,
        note: envelope.spendNote,
        provenance,
      });
      loggedSpend = spendDelta;
    }
    const after = await budgets.getPurchaseContext({ category: envelope.category });
    envelopes.push({
      category: envelope.category,
      loggedSpend,
      monthlyAmount: after.targetSetup?.monthlyAmount ?? null,
      spentThisPeriod: after.targetSetup?.spentThisPeriod ?? null,
    });
  }
  return { envelopes };
}

async function seedMeals(meals: MealsService, fixture: DemoFixture['meals'], provenance: MutationProvenance) {
  const recipeIds = [];
  for (const recipe of fixture.recipes) {
    const existing = await meals.getRecipe(recipe.id);
    if (existing) {
      await meals.patchRecipe({
        operations: [{ op: 'replace', path: '', value: recipe }],
        provenance,
        recipeId: recipe.id,
      });
    } else {
      await meals.createRecipe({ recipe, provenance });
    }
    recipeIds.push(recipe.id);
  }

  const weekStart = currentWeekStartIso();
  const weekEnd = addDaysIso(weekStart, 6);
  const plan = {
    ...fixture.plan,
    weekStart,
    weekEnd,
    entries: fixture.plan.entries.map((entry, index) => ({
      ...entry,
      date: addDaysIso(weekStart, entry.dayOffset),
      id: `${fixture.plan.id}:entry:${index + 1}`,
      instructionsSnapshot: [],
      notes: { demo: true },
    })),
    sourceSnapshot: {
      fixture: 'oss-demo',
      weekStart,
    },
  };
  await meals.upsertPlan({ plan, provenance });

  const inventory = [];
  for (const item of fixture.inventory) {
    const record = await meals.updateInventory({ ...item, provenance });
    inventory.push({ name: record.name, status: record.status });
  }

  return {
    inventoryCount: inventory.length,
    planId: fixture.plan.id,
    recipeCount: recipeIds.length,
    recipeIds,
    weekStart,
  };
}

function buildProvenance(fixtureId: string): MutationProvenance {
  return {
    actorEmail: 'oss-demo@fluent.local',
    actorName: 'Fluent OSS Demo Seeder',
    confidence: 0.86,
    scopes: defaultLocalScopes(),
    sessionId: fixtureId,
    sourceAgent: 'fluent-oss-demo-seed',
    sourceSkill: 'fluent-oss',
    sourceType: 'oss_demo_fixture',
  };
}

function currentWeekStartIso(): string {
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utcMidnight.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  utcMidnight.setUTCDate(utcMidnight.getUTCDate() + offset);
  return utcMidnight.toISOString().slice(0, 10);
}

function addDaysIso(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

interface DemoFixture {
  budgets: {
    envelopes: Array<{
      category: BudgetCategory;
      currency: string;
      monthlyAmount: number;
      spendNote: string;
      targetSpent: number;
    }>;
  };
  id: string;
  meals: {
    inventory: Array<{
      location?: string | null;
      name: string;
      quantity?: number | null;
      status?: string;
      unit?: string | null;
    }>;
    plan: {
      entries: Array<{
        dayLabel: string;
        dayOffset: number;
        leftoversExpected?: boolean;
        mealType: string;
        prepMinutes?: number | null;
        recipeId: string;
        recipeNameSnapshot: string;
        serves?: number | null;
        totalMinutes?: number | null;
      }>;
      id: string;
      requirements?: unknown;
      status?: string;
      summary?: unknown;
    };
    recipes: Array<Record<string, unknown> & { id: string }>;
  };
  style: {
    items: Array<{
      item: Record<string, unknown> & { id: string };
      profile: Record<string, unknown>;
    }>;
    profile: Record<string, unknown>;
  };
}
