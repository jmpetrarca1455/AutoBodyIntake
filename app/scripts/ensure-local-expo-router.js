#!/usr/bin/env node
/**
 * Guarantees `expo-router` physically exists at app/node_modules/expo-router.
 *
 * Why this is needed: Expo CLI's web dev server computes the entry bundle
 * URL (e.g. "/node_modules/expo-router/entry.bundle") as a literal file path
 * relative to the app's projectRoot — it does NOT go through Metro's normal
 * package-resolution algorithm (which respects our metro.config.js
 * `resolver.nodeModulesPaths`). Since this is an npm workspaces monorepo,
 * npm hoists the single shared copy of `expo-router` up to the repo root's
 * node_modules instead of duplicating it into app/node_modules — which
 * breaks that literal path lookup with a 404 / "Unable to resolve module"
 * error and a blank web app.
 *
 * The fix: after every install, make sure a symlink exists at
 * app/node_modules/expo-router pointing at the real (hoisted) package. This
 * runs automatically via the `postinstall` script in app/package.json. If
 * you ever run `npm install --ignore-scripts` at the repo root (e.g. to
 * work around an unrelated native-module build failure), re-run this
 * manually: `node app/scripts/ensure-local-expo-router.js`.
 */
const fs = require('fs');
const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(appRoot, '..');

const target = path.join(appRoot, 'node_modules', 'expo-router');
const source = path.join(workspaceRoot, 'node_modules', 'expo-router');

if (fs.existsSync(target)) {
  // Already local (either a real install or our symlink from a prior run).
  process.exit(0);
}

if (!fs.existsSync(source)) {
  console.warn('[ensure-local-expo-router] expo-router not found at workspace root either — skipping.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.symlinkSync(source, target, 'dir');
console.log('[ensure-local-expo-router] Linked app/node_modules/expo-router -> ' + source);


