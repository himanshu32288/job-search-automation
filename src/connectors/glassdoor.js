/**
 * Glassdoor connector – job listings via Glassdoor RapidAPI.
 * Docs: https://rapidapi.com/Pat92/api/glassdoor
 *
 * Required env vars:
 *   GLASSDOOR_API_KEY   – your RapidAPI key
 *   GLASSDOOR_API_HOST  – glassdoor.p.rapidapi.com
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE_URL = 'https://glassdoor.p.rapidapi.com/jobs/search';

/**
 * Fetch jobs from Glassdoor via RapidAPI.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const apiKey = process.env.GLASSDOOR_API_KEY;
  const apiHost = process.env.GLASSDOOR_API_HOST || 'glassdoor.p.rapidapi.com';

  if (!apiKey || apiKey === 'your_glassdoor_rapidapi_key_here') {
    logger.warn('Glassdoor: GLASSDOOR_API_KEY not set – skipping');
    return [];
  }

  logger.info('Glassdoor: fetching jobs...');

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
        keyword: query,
        location,
        page: 1,
      },
      timeout: cfg.requestTimeoutMs,
      retries: cfg.retryAttempts,
      retryDelay: cfg.retryDelayMs,
      logger,
    });
  } catch (err) {
    logger.error(`Glassdoor: fetch failed – ${err.message}`);
    return [];
  }

  const jobs = raw && Array.isArray(raw.data) ? raw.data
    : (raw && Array.isArray(raw.results) ? raw.results : []);
  logger.info(`Glassdoor: received ${jobs.length} listings`);

  return jobs.slice(0, cfg.maxResultsPerSource || 50).map(normalise);
}

/**
 * Map a raw Glassdoor listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  return {
    jobId: `glassdoor-${j.jobListingId || j.id || ''}`,
    title: j.jobTitleText || j.title || '',
    company: j.employerName || j.company || '',
    location: j.locationName || j.location || '',
    jobType: 'Full-time',
    experienceRequired: '',
    salaryRaw: j.salary || (j.salaryEstimate ? `${j.salaryEstimate.currency || ''} ${j.salaryEstimate.compAnnualLow || ''} - ${j.salaryEstimate.compAnnualHigh || ''}`.trim() : ''),
    description: (j.jobDescriptionText || j.description || '').replace(/<[^>]*>/g, '').trim(),
    url: j.jobListingPageUrl || j.url || '',
    source: 'Glassdoor',
    postedDate: j.listingDateText || '',
    tags: '',
  };
}

module.exports = { fetchJobs };
