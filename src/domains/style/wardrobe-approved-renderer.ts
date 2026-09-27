import { wardrobeCss, wardrobeScript } from './wardrobe-approved-bundle';

/** Shared Wardrobe renderer for the current resource and the published-app v7 alias. */
export function getApprovedWardrobeWidgetHtml(bundle = {script:wardrobeScript,css:wardrobeCss}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Wardrobe</title><style>${bundle.css.replace(/<\/style/gi,'<\\/style')}</style></head><body><div id="wardrobe-root"></div><script>${bundle.script.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
}
