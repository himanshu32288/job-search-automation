/**
 * LinkedIn connector – job listings via LinkedIn Jobs Search RapidAPI.
 * Docs: https://rapidapi.com/jaypat87/api/linkedin-jobs-search
 *
 * Required env vars:
 *   LINKEDIN_API_KEY   – your RapidAPI key
 *   LINKEDIN_API_HOST  – linkedin-jobs-search.p.rapidapi.com
 */

'use strict';

const cheerio = require('cheerio');
const { httpGet } = require('../utils/http');
const { getRapidApiCredentials, runWithFallback } = require('../utils/providerConfig');

const BASE_URL = 'https://linkedin-jobs-search.p.rapidapi.com/';
const GUEST_BASE_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

/**
 * Fetch jobs from LinkedIn via RapidAPI.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const credentials = getRapidApiCredentials({
    keyName: 'LINKEDIN_API_KEY',
    keysName: 'LINKEDIN_API_KEYS',
    hostName: 'LINKEDIN_API_HOST',
    defaultHost: 'linkedin-jobs-search.p.rapidapi.com',
    placeholder: 'your_linkedin_rapidapi_key_here',
  });

  if (credentials.length === 0) {
    logger.warn('LinkedIn: LINKEDIN_API_KEY not set – using public guest endpoint fallback');
    return fetchGuestJobs(cfg, logger);
  }

  logger.info(`LinkedIn: fetching jobs for ${cfg.location || 'India'}...`);

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');
  const location = cfg.location || 'India';
  const locationId = location.toLowerCase().replace(/\s+/g, '-');

  let raw;
  try {
    raw = await runWithFallback({
      label: 'LinkedIn',
      candidates: credentials,
      logger,
      runner: ({ apiKey, apiHost }) => httpGet(BASE_URL, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': apiHost,
        },
        params: {
          keywords: query,
          location_id: locationId,
          dateSincePosted: 'past Month',
          jobType: 'full time',
          onsiteRemote: 'remote',
          start: '0',
        },
        timeout: cfg.requestTimeoutMs,
        retries: cfg.retryAttempts,
        retryDelay: cfg.retryDelayMs,
        logger,
      }),
    });
  } catch (err) {
    logger.warn(`LinkedIn: RapidAPI fetch failed – ${err.message}; using public guest endpoint fallback`);
    return fetchGuestJobs(cfg, logger);
  }

  const jobs = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : []);
  if (jobs.length === 0) {
    logger.warn('LinkedIn: RapidAPI returned 0 listings; using public guest endpoint fallback');
    return fetchGuestJobs(cfg, logger);
  }
  logger.info(`LinkedIn: received ${jobs.length} listings for ${cfg.location || 'India'}`);

  return jobs.slice(0, cfg.maxResultsPerSource || 50).map(normalise);
}

async function fetchGuestJobs(cfg, logger) {
  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');
  const location = cfg.location || 'India';
  const maxResults = cfg.maxResultsPerSource || 50;
  const pageSize = 25;
  const results = [];

  logger.info(`LinkedIn (guest): fetching jobs for ${location}...`);

  for (let start = 0; start < maxResults; start += pageSize) {
    let html = '';
    try {
      html = await httpGet(GUEST_BASE_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        },
        params: {
          keywords: query,
          location,
          start,
        },
        timeout: cfg.requestTimeoutMs,
        retries: cfg.retryAttempts,
        retryDelay: cfg.retryDelayMs,
        logger,
      });
    } catch (err) {
      logger.warn(`LinkedIn (guest): fetch failed at start=${start} – ${err.message}`);
      break;
    }

    if (typeof html !== 'string' || html.trim().length === 0) {
      break;
    }

    const pageJobs = parseGuestHtml(html);
    if (pageJobs.length === 0) {
      break;
    }

    results.push(...pageJobs);
    if (pageJobs.length < pageSize) {
      break;
    }
  }

  logger.info(`LinkedIn (guest): received ${results.length} listings for ${location}`);
  return results.slice(0, maxResults);
}

function parseGuestHtml(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  $('.base-card').each((_, card) => {
    const node = $(card);
    const urn = node.attr('data-entity-urn') || '';
    const jobUrl = node.find('a.base-card__full-link').attr('href') || '';
    const idMatch = urn.match(/(\d+)\s*$/) || jobUrl.match(/currentJobId=(\d+)/);
    const title = node.find('.base-search-card__title').text().trim();
    const company = node.find('.base-search-card__subtitle').text().trim();
    const jobLocation = node.find('.job-search-card__location').text().trim();
    const fallbackId = [title, company, jobLocation, jobUrl]
      .join('-')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    jobs.push({
      jobId: `linkedin-${idMatch ? idMatch[1] : fallbackId}`,
      title,
      company,
      location: jobLocation,
      jobType: '',
      experienceRequired: '',
      salaryRaw: '',
      description: '',
      url: jobUrl,
      source: 'LinkedIn',
      postedDate: node.find('time').attr('datetime') || '',
      tags: '',
    });
  });

  return jobs.filter((job) => job.title && job.url && job.jobId.length > 'linkedin-'.length);
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
