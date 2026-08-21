/**
 * Salary utilities – convert salary values to INR for uniform comparison.
 * Exchange rates are rough static defaults; override via environment variables.
 */

'use strict';

// Rough exchange rates relative to INR.  Override with env vars if needed.
const RATES = {
  INR: 1,
  USD: parseFloat(process.env.RATE_USD_INR || '83'),
  EUR: parseFloat(process.env.RATE_EUR_INR || '90'),
  GBP: parseFloat(process.env.RATE_GBP_INR || '105'),
  SGD: parseFloat(process.env.RATE_SGD_INR || '62'),
  AED: parseFloat(process.env.RATE_AED_INR || '22.6'),
};

/**
 * Attempt to parse a salary value from a raw string/number.
 * Returns the numeric value and detected currency.
 *
 * @param {string|number} raw
 * @returns {{ value: number|null, currency: string }}
 */
function parseSalary(raw) {
  if (raw === null || raw === undefined || raw === '') {
    return { value: null, currency: 'INR' };
  }

  if (typeof raw === 'number') {
    return { value: raw, currency: 'INR' };
  }

  const str = String(raw).replace(/,/g, '').trim();

  let currency = 'INR';
  if (/\$|USD/i.test(str)) currency = 'USD';
  else if (/€|EUR/i.test(str)) currency = 'EUR';
  else if (/£|GBP/i.test(str)) currency = 'GBP';
  else if (/SGD/i.test(str)) currency = 'SGD';
  else if (/AED/i.test(str)) currency = 'AED';

  // Extract first number (handles ranges like "$120,000 - $150,000")
  const match = str.match(/[\d.]+/);
  if (!match) return { value: null, currency };

  let value = parseFloat(match[0]);

  // Heuristic: if the value looks like it's in thousands for USD (e.g. "120k")
  if (/k\b/i.test(str)) value *= 1000;

  return { value, currency };
}

/**
 * Convert a salary value to INR.
 * @param {number|null} value
 * @param {string}      currency
 * @returns {number|null}
 */
function toINR(value, currency = 'INR') {
  if (value === null || value === undefined) return null;
  const rate = RATES[currency.toUpperCase()] || 1;
  return Math.round(value * rate);
}

/**
 * Parse and convert a raw salary string/number directly to INR.
 * @param {string|number} raw
 * @returns {number|null}
 */
function salaryToINR(raw) {
  const { value, currency } = parseSalary(raw);
  return toINR(value, currency);
}

/**
 * Format an INR value for display.
 * @param {number|null} inr
 * @returns {string}
 */
function formatINR(inr) {
  if (inr === null || inr === undefined) return 'N/A';
  return `₹${inr.toLocaleString('en-IN')}`;
}

module.exports = { parseSalary, toINR, salaryToINR, formatINR };
