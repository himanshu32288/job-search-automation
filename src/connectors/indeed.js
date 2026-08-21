/**
 * Indeed connector – job listings via Indeed12 RapidAPI.
 * Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/indeed12
 *
 * Required env vars:
 *   INDEED_API_KEY   – your RapidAPI key
 *   INDEED_API_HOST  – indeed12.p.rapidapi.com
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE_URL = 'https://indeed12.p.rapidapi.com/jobs/search';

/**
 * Fetch jobs from Indeed via RapidAPI.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const apiKey = process.env.INDEED_API_KEY;
  const apiHost = process.env.INDEED_API_HOST || 'indeed12.p.rapidapi.com';

  if (!apiKey || apiKey === 'your_indeed_rapidapi_key_here') {
    logger.warn('Indeed: INDEED_API_KEY not set – skipping');
    return [];
  }

  logger.info('Indeed: fetching jobs...');

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');
  const location = cfg.location || 'India';
  // Derive country code: default to 'in' (India) unless config overrides
  const country = cfg.countryCode || 'in';

  let raw;
  try {
    raw = await httpGet(BASE_URL, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': apiHost,
      },
      params: {
        query,
        location,
        page_id: '1',
        country: country,
        fromage: '30',
      },
      timeout: cfg.requestTimeoutMs,
      retries: cfg.retryAttempts,
      retryDelay: cfg.retryDelayMs,
      logger,
    });
  } catch (err) {
    logger.error(`Indeed: fetch failed – ${err.message}`);
    return [];
  }

  const jobs = (raw && Array.isArray(raw.hits)) ? raw.hits : [];
  logger.info(`Indeed: received ${jobs.length} listings`);

  return jobs.slice(0, cfg.maxResultsPerSource || 50).map(normalise);
}

/**
 * Map a raw Indeed listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  return {
    jobId: `indeed-${j.id || j.job_id || ''}`,
    title: j.title || j.job_title || '',
    company: j.company_name || j.company || '',
    location: j.location || j.jobLocation || '',
    jobType: j.jobType || 'Full-time',
    experienceRequired: '',
    salaryRaw: j.salary || j.formattedRelativeTime || '',
    description: (j.description || j.snippet || '').replace(/<[^>]*>/g, '').trim(),
    url: j.link || j.url || '',
    source: 'Indeed',
    postedDate: j.pub_date_ts_milli
      ? new Date(j.pub_date_ts_milli).toISOString().split('T')[0]
      : '',
    tags: '',
  };
}

module.exports = { fetchJobs };
