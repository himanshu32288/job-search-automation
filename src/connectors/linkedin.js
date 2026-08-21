/**
 * LinkedIn connector – job listings via LinkedIn Jobs Search RapidAPI.
 * Docs: https://rapidapi.com/jaypat87/api/linkedin-jobs-search
 *
 * Required env vars:
 *   LINKEDIN_API_KEY   – your RapidAPI key
 *   LINKEDIN_API_HOST  – linkedin-jobs-search.p.rapidapi.com
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE_URL = 'https://linkedin-jobs-search.p.rapidapi.com/';

/**
 * Fetch jobs from LinkedIn via RapidAPI.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const apiKey = process.env.LINKEDIN_API_KEY;
  const apiHost = process.env.LINKEDIN_API_HOST || 'linkedin-jobs-search.p.rapidapi.com';

  if (!apiKey || apiKey === 'your_linkedin_rapidapi_key_here') {
    logger.warn('LinkedIn: LINKEDIN_API_KEY not set – skipping');
    return [];
  }

  logger.info('LinkedIn: fetching jobs...');

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');
  const location = cfg.location || 'India';

  let raw;
  try {
    raw = await httpGet(BASE_URL, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': apiHost,
      },
      params: {
        keywords: query,
        location_id: 'india',
        dateSincePosted: 'past Month',
        jobType: 'full time',
        onsiteRemote: 'remote',
        start: '0',
      },
      timeout: cfg.requestTimeoutMs,
      retries: cfg.retryAttempts,
      retryDelay: cfg.retryDelayMs,
      logger,
    });
  } catch (err) {
    logger.error(`LinkedIn: fetch failed – ${err.message}`);
    return [];
  }

  const jobs = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : []);
  logger.info(`LinkedIn: received ${jobs.length} listings`);

  return jobs.slice(0, cfg.maxResultsPerSource || 50).map(normalise);
}

/**
 * Map a raw LinkedIn listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  return {
    jobId: `linkedin-${j.id || j.job_id || ''}`,
    title: j.title || j.job_title || '',
    company: j.company || j.company_name || '',
    location: j.location || '',
    jobType: j.jobType || 'Full-time',
    experienceRequired: '',
    salaryRaw: j.salary || '',
    description: (j.description || '').replace(/<[^>]*>/g, '').trim(),
    url: j.job_url || j.url || '',
    source: 'LinkedIn',
    postedDate: j.postedAt || j.date || '',
    tags: '',
  };
}

module.exports = { fetchJobs };
