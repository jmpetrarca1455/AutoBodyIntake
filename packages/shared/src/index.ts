/**
 * @autobody/shared — single source of truth for contracts shared between
 * the backend API and every client app (customer intake app today; shop
 * dashboard, adjuster tools, etc. in later phases).
 *
 * Convention: as the business expands into new verticals (mechanics,
 * dealerships, towing…), add a new `<domain>.contracts.ts` file here rather
 * than duplicating types in each consumer.
 */
export * from './shop.contracts.js';
export * from './intake.contracts.js';
export * from './auth.contracts.js';
export * from './ai.contracts.js';


