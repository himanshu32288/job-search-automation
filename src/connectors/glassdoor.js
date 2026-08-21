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
const { getRapidApiCredentials, runWithFallback } = require('../utils/providerConfig');

const BASE_URL = 'https://glassdoor.p.rapidapi.com/jobs/search';

/**
 * Fetch jobs from Glassdoor via RapidAPI.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const credentials = getRapidApiCredentials({
    keyName: 'GLASSDOOR_API_KEY',
    keysName: 'GLASSDOOR_API_KEYS',
    hostName: 'GLASSDOOR_API_HOST',
    defaultHost: 'glassdoor.p.rapidapi.com',
    placeholder: 'your_glassdoor_rapidapi_key_here',
  });

  if (credentials.length === 0) {
    logger.warn('Glassdoor: GLASSDOOR_API_KEY not set – skipping');
    return [];
  }

  logger.info(`Glassdoor: fetching jobs for ${cfg.location || 'India'}...`);

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');
  const location = cfg.location || 'India';

  let raw;
  try {
    raw = await runWithFallback({
      label: 'Glassdoor',
      candidates: credentials,
      logger,
      runner: ({ apiKey, apiHost }) => httpGet(BASE_URL, {
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
      }),
    });
  } catch (err) {
    logger.error(`Glassdoor: fetch failed – ${err.message}`);
    return [];
  }

  const jobs = raw && Array.isArray(raw.data) ? raw.data
    : (raw && Array.isArray(raw.results) ? raw.results : []);
  logger.info(`Glassdoor: received ${jobs.length} listings for ${cfg.location || 'India'}`);

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
