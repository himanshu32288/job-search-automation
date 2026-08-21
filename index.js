/**
 * Job Search Automation – main entry point.
 *
 * Orchestrates all API connectors, deduplication, skills matching,
 * filtering, and output generation.
 *
 * Usage:
 *   node index.js [--config path/to/config.json] [--no-cache] [--clear-cache]
 */

'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const _pLimitModule = require('p-limit');
const pLimit = _pLimitModule.default || _pLimitModule;

const { getLogger } = require('./src/utils/logger');
const Cache = require('./src/utils/cache');
const { buildSkillsList, matchSkills } = require('./src/utils/matcher');
const { deduplicate } = require('./src/utils/deduplicator');
const { salaryToINR } = require('./src/utils/salary');
const { getSearchLocations, toSlug, withSearchLocation } = require('./src/utils/providerConfig');
const { writeCsv, writeJson, printSummary } = require('./src/output');

// ── Connectors ──────────────────────────────────────────────
const remoteok = require('./src/connectors/remoteok');
const jsearch = require('./src/connectors/jsearch');
const linkedin = require('./src/connectors/linkedin');
const indeed = require('./src/connectors/indeed');
const glassdoor = require('./src/connectors/glassdoor');
const naukri = require('./src/connectors/naukri');
const angellist = require('./src/connectors/angellist');
const adzuna = require('./src/connectors/adzuna');
const companyPortals = require('./src/connectors/companyPortals');

// ── Parse CLI arguments ─────────────────────────────────────
const args = process.argv.slice(2);
const configPath = (() => {
  const idx = args.indexOf('--config');
  return idx !== -1 ? args[idx + 1] : 'config.json';
})();
const noCache = args.includes('--no-cache');
const clearCache = args.includes('--clear-cache');

// ── Load config ─────────────────────────────────────────────
let config;
try {
  config = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));
} catch (err) {
  console.error(`Failed to load config from ${configPath}: ${err.message}`);
  process.exit(1);
}

const searchCfg = config.search || {};
const outputCfg = config.output || {};
const cacheCfg = noCache ? { enabled: false } : (config.cache || {});
const sources = config.sources || {};

// ── Initialise logger & cache ────────────────────────────────
const logger = getLogger(config.logging || {});
const cache = new Cache(cacheCfg, logger);

if (clearCache) {
  cache.clear();
  logger.info('Cache cleared per --clear-cache flag');
}

// ── Build skills list ────────────────────────────────────────
const skillsList = buildSkillsList(config.skills || {});
logger.info(`Loaded ${skillsList.length} skills for matching`);

// ── Helper: fetch with cache ─────────────────────────────────
async function fetchWithCache(key, fetchFn) {
  const cached = cache.get(key);
  if (cached) {
    logger.info(`Using cached results for: ${key}`);
    return cached;
  }
  const result = await fetchFn();
  cache.set(key, result);
  return result;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  logger.info('═'.repeat(60));
  logger.info('  Job Search Automation – Starting');
  logger.info('═'.repeat(60));

  const limit = pLimit(searchCfg.concurrency || 3);
  const searchLocations = getSearchLocations(searchCfg);

  // Build fetch tasks based on enabled sources
  const tasks = [];
  const locationScopedSources = [
    ['jsearch', jsearch.fetchJobs],
    ['linkedin', linkedin.fetchJobs],
    ['indeed', indeed.fetchJobs],
    ['glassdoor', glassdoor.fetchJobs],
    ['naukri', naukri.fetchJobs],
    ['adzuna', adzuna.fetchJobs],
    ['companyPortals', (cfg, activeLogger) => companyPortals.fetchJobs(cfg, activeLogger, config.companyPortals || [])],
  ];

  function addTask(cacheKey, label, fetchFn, scopedCfg) {
    tasks.push(limit(() => fetchWithCache(cacheKey, async () => {
      logger.info(`${label}: starting fetch`);
      return fetchFn(scopedCfg, logger);
    })));
  }

  if (sources.remoteok !== false) {
    addTask('remoteok', 'RemoteOK', remoteok.fetchJobs, searchCfg);
  }

  if (sources.angellist !== false) {
    addTask('angellist', 'AngelList', angellist.fetchJobs, searchCfg);
  }

  locationScopedSources.forEach(([sourceKey, fetchFn]) => {
    if (sources[sourceKey] === false) return;
    searchLocations.forEach((location) => {
      const scopedCfg = withSearchLocation(searchCfg, location);
      const locationSlug = toSlug(location);
      addTask(`${sourceKey}:${locationSlug}`, `${sourceKey}:${location}`, fetchFn, scopedCfg);
    });
  });

  // Run all fetch tasks in parallel (limited by concurrency setting)
  logger.info(`Fetching from ${tasks.length} source(s) across ${searchLocations.length} location(s) with concurrency=${searchCfg.concurrency || 3}...`);
  const results = await Promise.allSettled(tasks);

  // Flatten results
  let allJobs = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      allJobs.push(...r.value);
    } else if (r.status === 'rejected') {
      logger.error(`Source fetch error: ${r.reason}`);
    }
  });

  logger.info(`Total raw listings collected: ${allJobs.length}`);

  // ── Deduplicate ────────────────────────────────────────────
  allJobs = deduplicate(allJobs);
  logger.info(`After deduplication: ${allJobs.length} unique listings`);

  // ── Skills matching & scoring ──────────────────────────────
  allJobs = allJobs.map((job) => {
    const text = [job.title, job.description, job.tags].filter(Boolean).join(' ');
    const { percentage, matched } = matchSkills(text, skillsList);
    return { ...job, matchPercentage: percentage, matchedSkills: matched };
  });

  // ── Filter by experience ───────────────────────────────────
  const minExp = searchCfg.experienceMin || 0;
  if (minExp > 0) {
    allJobs = allJobs.filter((job) => {
      if (!job.experienceRequired) return true; // no info – keep
      const match = String(job.experienceRequired).match(/(\d+)/);
      if (!match) return true;
      return parseInt(match[1], 10) >= minExp;
    });
    logger.info(`After experience filter (>=${minExp} years): ${allJobs.length} listings`);
  }

  // ── Filter by salary (if available) ───────────────────────
  const minSalary = searchCfg.salaryMinINR;
  const maxSalary = searchCfg.salaryMaxINR;
  if (minSalary || maxSalary) {
    allJobs = allJobs.filter((job) => {
      const inr = salaryToINR(job.salaryRaw);
      if (inr === null) return true; // keep jobs without salary info
      if (minSalary && inr < minSalary) return false;
      if (maxSalary && inr > maxSalary) return false;
      return true;
    });
    logger.info(`After salary filter: ${allJobs.length} listings`);
  }

  // ── Sort by skills match percentage (descending) ───────────
  allJobs.sort((a, b) => (b.matchPercentage || 0) - (a.matchPercentage || 0));

  // ── Output ─────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(outputCfg.csvFile || 'output/jobs.csv'), { recursive: true });

  await writeCsv(allJobs, outputCfg, logger);

  if (outputCfg.saveJson) {
    writeJson(allJobs, outputCfg, logger);
  }

  printSummary(allJobs, 15);

  logger.info(`✔  Done. ${allJobs.length} jobs written to ${outputCfg.csvFile || 'output/jobs.csv'}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
