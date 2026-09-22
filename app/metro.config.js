// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

/**
 * Metro config for the monorepo. Expo's Metro bundler needs two extra hints
 * to resolve workspace packages (like @autobody/shared) that live outside
 * app/node_modules:
 *   1. watchFolders — include the monorepo root so Metro sees the workspace.
 *   2. nodeModulesPaths — also look up the tree for hoisted node_modules.
 */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// IMPORTANT: do NOT set watchFolders to the whole monorepo root. Metro's
// NodeWatcher calls fs.watch() on every crawled directory, and the root
// also contains backend/ (its own node_modules + uploads/, which grows
// with every submission's photos) and docs/ and .git — none of which the
// app needs, and watching all of it blows past macOS's per-process
// FSEvents descriptor limit (EMFILE). Only watch what's actually needed to
// resolve app code + the shared workspace package + hoisted deps.
config.watchFolders = [
  projectRoot,
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'packages/shared'),
];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;



