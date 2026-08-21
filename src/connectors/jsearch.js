/**
 * JSearch connector – comprehensive job listings via RapidAPI.
 * Docs: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 *
 * Required env vars:
 *   JSEARCH_API_KEY   – your RapidAPI key
 *   JSEARCH_API_HOST  – jsearch.p.rapidapi.com
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE_URL = 'https://jsearch.p.rapidapi.com/search';

/**
 * Fetch jobs from JSearch.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  const apiKey = process.env.JSEARCH_API_KEY;
  const apiHost = process.env.JSEARCH_API_HOST || 'jsearch.p.rapidapi.com';

  if (!apiKey || apiKey === 'your_jsearch_api_key_here') {
    logger.warn('JSearch: JSEARCH_API_KEY not set – skipping');
    return [];
  }

  logger.info('JSearch: fetching jobs...');

  const query = (cfg.keywords || ['Java Spring Boot']).join(' ');
  const location = cfg.location || 'India';
  const maxPages = Math.ceil((cfg.maxResultsPerSource || 50) / 10);

  const allJobs = [];

  for (let page = 1; page <= Math.min(maxPages, 5); page++) {
    try {
      const data = await httpGet(BASE_URL, {
        headers: {
          'X-RapidAPI-Key': apiKey,
          'X-RapidAPI-Host': apiHost,
        },
        params: {
          query: `${query} ${location}`,
          page,
          num_pages: 1,
          employment_types: 'FULLTIME',
        },
        timeout: cfg.requestTimeoutMs,
        retries: cfg.retryAttempts,
        retryDelay: cfg.retryDelayMs,
        logger,
      });

      const jobs = data && Array.isArray(data.data) ? data.data : [];
      if (jobs.length === 0) break;
      allJobs.push(...jobs.map(normalise));
    } catch (err) {
      logger.error(`JSearch: page ${page} failed – ${err.message}`);
      break;
    }
  }

  logger.info(`JSearch: received ${allJobs.length} listings`);
  return allJobs;
}

/**
 * Map a raw JSearch listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  const salaryMin = j.job_min_salary;
  const salaryMax = j.job_max_salary;
  const salaryCurrency = j.job_salary_currency || 'USD';
  let salaryRaw = '';
  if (salaryMin || salaryMax) {
    salaryRaw = `${salaryCurrency} ${salaryMin || ''}${salaryMax ? ` - ${salaryMax}` : ''}`.trim();
  }

  return {
    jobId: `jsearch-${j.job_id || ''}`,
    title: j.job_title || '',
    company: j.employer_name || '',
    location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ') || 'N/A',
    jobType: j.job_employment_type || 'Full-time',
    experienceRequired: (() => {
      const months = j.job_required_experience && j.job_required_experience.required_experience_in_months;
      if (!months) return '';
      return `${Math.round(months / 12)} years`;
    })(),
    salaryRaw,
    description: (j.job_description || '').trim(),
    url: j.job_apply_link || j.job_google_link || '',
    source: 'JSearch',
    postedDate: j.job_posted_at_datetime_utc
      ? j.job_posted_at_datetime_utc.split('T')[0]
      : '',
    tags: Array.isArray(j.job_required_skills) ? j.job_required_skills.join(', ') : '',
  };
}

module.exports = { fetchJobs };
