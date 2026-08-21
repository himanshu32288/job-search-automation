/**
 * Adzuna connector – job listings via the free Adzuna public API.
 * Docs: https://developer.adzuna.com/
 *
 * Required env vars:
 *   ADZUNA_APP_ID   – Adzuna application ID
 *   ADZUNA_API_KEY  – Adzuna API key
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE = 'https://api.adzuna.com/v1/api/jobs';

/**
 * Fetch jobs from Adzuna.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const appId = process.env.ADZUNA_APP_ID;
  const apiKey = process.env.ADZUNA_API_KEY;

  if (!appId || appId === 'your_adzuna_app_id_here' || !apiKey || apiKey === 'your_adzuna_api_key_here') {
    logger.warn('Adzuna: ADZUNA_APP_ID/ADZUNA_API_KEY not set – skipping');
    return [];
  }

  logger.info('Adzuna: fetching jobs...');

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');
  const country = 'in'; // India
  const url = `${BASE}/${country}/search/1`;

  let raw;
  try {
    raw = await httpGet(url, {
      params: {
        app_id: appId,
        app_key: apiKey,
        results_per_page: Math.min(cfg.maxResultsPerSource || 50, 50),
        what: query,
        where: cfg.location || '',
        full_time: 1,
        salary_min: cfg.salaryMinINR ? Math.round(cfg.salaryMinINR / 83) : undefined,
      },
      timeout: cfg.requestTimeoutMs,
      retries: cfg.retryAttempts,
      retryDelay: cfg.retryDelayMs,
      logger,
    });
  } catch (err) {
    logger.error(`Adzuna: fetch failed – ${err.message}`);
    return [];
  }

  const jobs = raw && Array.isArray(raw.results) ? raw.results : [];
  logger.info(`Adzuna: received ${jobs.length} listings`);

  return jobs.map(normalise);
}

/**
 * Map a raw Adzuna listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  return {
    jobId: `adzuna-${j.id || ''}`,
    title: j.title || '',
    company: (j.company && j.company.display_name) || '',
    location: (j.location && j.location.display_name) || '',
    jobType: j.contract_time === 'full_time' ? 'Full-time' : (j.contract_time || ''),
    experienceRequired: '',
    salaryRaw: j.salary_min
      ? `INR ${j.salary_min}${j.salary_max ? ` - ${j.salary_max}` : ''}`.trim()
      : '',
    description: (j.description || '').replace(/<[^>]*>/g, '').trim(),
    url: j.redirect_url || j.url || '',
    source: 'Adzuna',
    postedDate: j.created ? j.created.split('T')[0] : '',
    tags: Array.isArray(j.category) ? j.category.label || '' : '',
  };
}

module.exports = { fetchJobs };
