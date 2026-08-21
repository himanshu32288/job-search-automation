/**
 * HTTP helper – wraps axios with retry logic, timeout, and rate-limiting.
 */

'use strict';

const axios = require('axios');

/**
 * Sleep for `ms` milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Make an HTTP GET request with retry support.
 *
 * @param {string}  url
 * @param {object}  options
 * @param {object}  [options.headers]
 * @param {object}  [options.params]
 * @param {number}  [options.timeout]       ms (default 15 000)
 * @param {number}  [options.retries]       number of attempts (default 3)
 * @param {number}  [options.retryDelay]    ms between retries (default 2 000)
 * @param {object}  [options.logger]
 * @returns {Promise<any>}  response data
 */
async function httpGet(url, options = {}) {
  const {
    headers = {},
    params = {},
    timeout = 15000,
    retries = 3,
    retryDelay = 2000,
    logger = console,
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, { headers, params, timeout });
      return response.data;
    } catch (err) {
      lastError = err;
      const status = err.response ? err.response.status : 'network';
      logger.warn && logger.warn(
        `HTTP GET ${url} failed (attempt ${attempt}/${retries}, status ${status}): ${err.message}`
      );
      const isClientError = typeof status === 'number' && status >= 400 && status < 500;
      if (isClientError && status !== 429) {
        break;
      }
      if (attempt < retries) {
        await sleep(retryDelay * attempt);
      }
    }
  }
  throw lastError;
}

module.exports = { httpGet, sleep };
