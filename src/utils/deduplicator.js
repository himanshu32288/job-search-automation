/**
 * Deduplication – filters out duplicate job listings.
 *
 * A job is considered a duplicate if:
 *   1. Its jobId has already been seen, OR
 *   2. The normalised "title + company" pair already exists.
 */

'use strict';

/**
 * Normalise a string for comparison (lowercase, collapse whitespace, strip punctuation).
 * @param {string} str
 * @returns {string}
 */
function normalise(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normaliseUrl(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .trim();
}

/**
 * Filter duplicates from an array of job objects.
 * @param {object[]} jobs  array of normalised job objects
 * @returns {object[]}     deduplicated jobs
 */
function deduplicate(jobs) {
  const seenIds = new Set();
  const seenUrls = new Set();
  const seenPairs = new Set();
  const result = [];

  for (const job of jobs) {
    const id = job.jobId ? String(job.jobId).trim() : null;
    const url = normaliseUrl(job.url);
    const source = normalise(job.source);
    const pair = `${normalise(job.title)}|${normalise(job.company)}|${normalise(job.location)}`;
    const fallbackPair = `${source}|${normalise(job.title)}|${normalise(job.company)}`;

    if (id && seenIds.has(id)) continue;
    if (url && seenUrls.has(url)) continue;
    if (seenPairs.has(pair) || seenPairs.has(fallbackPair)) continue;

    if (id) seenIds.add(id);
    if (url) seenUrls.add(url);
    seenPairs.add(pair);
    seenPairs.add(fallbackPair);
    result.push(job);
  }

  return result;
}

module.exports = { deduplicate, normalise, normaliseUrl };
