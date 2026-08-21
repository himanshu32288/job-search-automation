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

/**
 * Filter duplicates from an array of job objects.
 * @param {object[]} jobs  array of normalised job objects
 * @returns {object[]}     deduplicated jobs
 */
function deduplicate(jobs) {
  const seenIds = new Set();
  const seenPairs = new Set();
  const result = [];

  for (const job of jobs) {
    const id = job.jobId ? String(job.jobId).trim() : null;
    const pair = `${normalise(job.title)}|${normalise(job.company)}`;

    if (id && seenIds.has(id)) continue;
    if (seenPairs.has(pair)) continue;

    if (id) seenIds.add(id);
    seenPairs.add(pair);
    result.push(job);
  }

  return result;
}

module.exports = { deduplicate, normalise };
