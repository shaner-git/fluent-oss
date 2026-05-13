import os from 'node:os';
import path from 'node:path';

export const FLUENT_MEALS_RUNTIME_ROOT = path.join(os.homedir(), '.fluent-meals');
export const FLUENT_MEALS_BROWSER_DATA_DIR = path.join(FLUENT_MEALS_RUNTIME_ROOT, 'browser-data');
export const FLUENT_MEALS_GROCERY_EXPORT_DIR = path.join(FLUENT_MEALS_RUNTIME_ROOT, 'grocery-exports');
export const FLUENT_MEALS_OVERNIGHT_REPORT_DIR = path.join(FLUENT_MEALS_RUNTIME_ROOT, 'overnight-reports');
