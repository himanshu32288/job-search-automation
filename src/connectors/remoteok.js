/**
 * RemoteOK connector – fetches remote tech jobs from the free RemoteOK public API.
 * Docs: https://remoteok.com/api
 */

'use strict';

const { httpGet } = require('../utils/http');

const BASE_URL = 'https://remoteok.com/api';

/**
 * Fetch jobs from RemoteOK.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger) {
  logger.info('RemoteOK: fetching jobs...');

  let raw;
  try {
    raw = await httpGet(BASE_URL, {
      headers: { 'User-Agent': 'JobSearchAutomation/1.0' },
      timeout: cfg.requestTimeoutMs,
      retries: cfg.retryAttempts,
      retryDelay: cfg.retryDelayMs,
      logger,
    });
  } catch (err) {
    logger.error(`RemoteOK: fetch failed – ${err.message}`);
    return [];
  }

  // First element is a legal notice object – skip it.
  const jobs = Array.isArray(raw) ? raw.slice(1) : [];

  logger.info(`RemoteOK: received ${jobs.length} raw listings`);

  // Filter by keywords
  const keywords = (cfg.keywords || []).map((k) => k.toLowerCase());
  const filtered = jobs.filter((j) => {
    const text = `${j.position || ''} ${(j.tags || []).join(' ')} ${j.description || ''}`.toLowerCase();
    return keywords.length === 0 || keywords.some((k) => text.includes(k));
  });

  return filtered.slice(0, cfg.maxResultsPerSource || 50).map((j) => normalise(j));
}

/**
 * Map a raw RemoteOK listing to the standard job schema.
 * @param {object} j
 * @returns {object}
 */
function normalise(j) {
  return {
    jobId: `remoteok-${j.id || j.slug || ''}`,
    title: j.position || '',
    company: j.company || '',
    location: 'Remote',
    jobType: 'Full-time',
    experienceRequired: '',
    salaryRaw: j.salary || '',
    description: (j.description || '').replace(/<[^>]*>/g, '').trim(),
    url: j.url || `https://remoteok.com/remote-jobs/${j.slug}`,
    source: 'RemoteOK',
    postedDate: j.date ? new Date(j.date * 1000).toISOString().split('T')[0] : '',
    tags: Array.isArray(j.tags) ? j.tags.join(', ') : '',
  };
}

module.exports = { fetchJobs };
