/**
 * AngelList (Wellfound) connector – startup jobs via RapidAPI.
 * Docs: https://rapidapi.com/search?term=angellist
 *
 * Required env vars:
 *   ANGELLIST_API_KEY   – your RapidAPI key
 *   ANGELLIST_API_HOST  – angellist-jobs.p.rapidapi.com
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE_URL = 'https://angellist-jobs.p.rapidapi.com/jobs';

/**
 * Fetch jobs from AngelList via RapidAPI.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const apiKey = process.env.ANGELLIST_API_KEY;
  const apiHost = process.env.ANGELLIST_API_HOST || 'angellist-jobs.p.rapidapi.com';

  if (!apiKey || apiKey === 'your_angellist_rapidapi_key_here') {
    logger.warn('AngelList: ANGELLIST_API_KEY not set – skipping');
    return [];
  }

  logger.info('AngelList: fetching jobs...');

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');

  let raw;
  try {
    raw = await httpGet(BASE_URL, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': apiHost,
      },
      params: { query, page: 1 },
      timeout: cfg.requestTimeoutMs,
      retries: cfg.retryAttempts,
      retryDelay: cfg.retryDelayMs,
      logger,
    });
  } catch (err) {
    logger.error(`AngelList: fetch failed – ${err.message}`);
    return [];
  }

  const jobs = raw && Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : []);
  logger.info(`AngelList: received ${jobs.length} listings`);

  return jobs.slice(0, cfg.maxResultsPerSource || 50).map(normalise);
}

/**
 * Map a raw AngelList listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  const salary = j.compensation
    ? `${j.compensation.currency || 'USD'} ${j.compensation.min || ''} - ${j.compensation.max || ''}`.trim()
    : '';

  return {
    jobId: `angellist-${j.id || ''}`,
    title: j.title || j.role || '',
    company: (j.startup && j.startup.name) || j.company_name || '',
    location: j.location_names ? j.location_names.join(', ') : (j.location || 'Remote'),
    jobType: j.job_type || 'Full-time',
    experienceRequired: '',
    salaryRaw: salary,
    description: (j.job_description || j.description || '').replace(/<[^>]*>/g, '').trim(),
    url: j.angellist_url || j.url || '',
    source: 'AngelList',
    postedDate: j.created_at ? j.created_at.split('T')[0] : '',
    tags: Array.isArray(j.tags) ? j.tags.map((t) => t.display_name || t).join(', ') : '',
  };
}

module.exports = { fetchJobs };
