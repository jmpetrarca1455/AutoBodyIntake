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

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;

