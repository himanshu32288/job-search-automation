/**
 * Naukri.com connector – Indian job portal via RapidAPI.
 * Docs: https://rapidapi.com/search?term=naukri
 *
 * Required env vars:
 *   NAUKRI_API_KEY   – your RapidAPI key
 *   NAUKRI_API_HOST  – naukri-com-jobs.p.rapidapi.com
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE_URL = 'https://naukri-com-jobs.p.rapidapi.com/';

/**
 * Fetch jobs from Naukri via RapidAPI.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const apiKey = process.env.NAUKRI_API_KEY;
  const apiHost = process.env.NAUKRI_API_HOST || 'naukri-com-jobs.p.rapidapi.com';

  if (!apiKey || apiKey === 'your_naukri_rapidapi_key_here') {
    logger.warn('Naukri: NAUKRI_API_KEY not set – skipping');
    return [];
  }

  logger.info('Naukri: fetching jobs...');

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');

  let raw;
  try {
    raw = await httpGet(BASE_URL, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': apiHost,
      },
      params: {
        keyword: query,
        location: cfg.location || 'India',
        experience: String(cfg.experienceMin || 3),
        salary: String(cfg.salaryMinINR || 2000000),
      },
      timeout: cfg.requestTimeoutMs,
      retries: cfg.retryAttempts,
      retryDelay: cfg.retryDelayMs,
      logger,
    });
  } catch (err) {
    logger.error(`Naukri: fetch failed – ${err.message}`);
    return [];
  }

  const jobs = raw && Array.isArray(raw.jobDetails)
    ? raw.jobDetails
    : (Array.isArray(raw) ? raw : []);
  logger.info(`Naukri: received ${jobs.length} listings`);

  return jobs.slice(0, cfg.maxResultsPerSource || 50).map(normalise);
}

/**
 * Map a raw Naukri listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  return {
    jobId: `naukri-${j.jobId || j.id || ''}`,
    title: j.title || j.designationName || '',
    company: j.companyName || j.company || '',
    location: Array.isArray(j.placeholders)
      ? j.placeholders.find((p) => p.type === 'location')?.label || ''
      : (j.location || ''),
    jobType: 'Full-time',
    experienceRequired: Array.isArray(j.placeholders)
      ? j.placeholders.find((p) => p.type === 'experience')?.label || ''
      : (j.experience || ''),
    salaryRaw: Array.isArray(j.placeholders)
      ? j.placeholders.find((p) => p.type === 'salary')?.label || ''
      : (j.salary || ''),
    description: (j.jobDescription || j.description || '').replace(/<[^>]*>/g, '').trim(),
    url: j.jdURL || j.jobUrl || `https://www.naukri.com${j.jdURL || ''}`,
    source: 'Naukri',
    postedDate: j.footerPlaceholderLabel || j.postedDate || '',
    tags: Array.isArray(j.tagsAndSkills) ? j.tagsAndSkills.join(', ') : '',
  };
}

module.exports = { fetchJobs };
