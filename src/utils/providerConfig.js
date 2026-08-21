'use strict';

function splitValues(raw) {
  return String(raw || '')
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getEnvValues({ singleName, multiName, placeholder }) {
  const values = [];

  if (multiName && process.env[multiName]) {
    values.push(...splitValues(process.env[multiName]));
  }

  if (process.env[singleName]) {
    values.push(...splitValues(process.env[singleName]));
  }

  Object.keys(process.env)
    .filter((name) => new RegExp(`^${singleName}_\\d+$`).test(name))
    .sort()
    .forEach((name) => {
      values.push(...splitValues(process.env[name]));
    });

  return unique(values).filter((value) => value !== placeholder);
}

function getRapidApiCredentials({ keyName, keysName, hostName, defaultHost, placeholder }) {
  const apiKeys = getEnvValues({
    singleName: keyName,
    multiName: keysName,
    placeholder,
  });
  const apiHost = process.env[hostName] || defaultHost;

  return apiKeys.map((apiKey) => ({ apiKey, apiHost }));
}

function getAdzunaCredentials() {
  const appIds = getEnvValues({
    singleName: 'ADZUNA_APP_ID',
    multiName: 'ADZUNA_APP_IDS',
    placeholder: 'your_adzuna_app_id_here',
  });
  const apiKeys = getEnvValues({
    singleName: 'ADZUNA_API_KEY',
    multiName: 'ADZUNA_API_KEYS',
    placeholder: 'your_adzuna_api_key_here',
  });

  return appIds
    .map((appId, index) => ({
      appId,
      apiKey: apiKeys[index] || apiKeys[0] || '',
    }))
    .filter((entry) => entry.appId && entry.apiKey);
}

async function runWithFallback({ label, candidates, logger, runner }) {
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    try {
      if (candidates.length > 1) {
        logger.info(`${label}: trying credential ${index + 1}/${candidates.length}`);
      }
      return await runner(candidates[index], index);
    } catch (error) {
      lastError = error;
      logger.warn(`${label}: credential ${index + 1}/${candidates.length} failed – ${error.message}`);
    }
  }

  throw lastError || new Error(`${label}: no usable credentials`);
}

function getSearchLocations(searchCfg = {}) {
  const explicitLocations = Array.isArray(searchCfg.locations)
    ? unique(searchCfg.locations.map((location) => String(location || '').trim()).filter(Boolean))
    : [];

  if (explicitLocations.length > 0) {
    return explicitLocations;
  }

  const fallback = String(searchCfg.location || '').trim();
  return [fallback || 'India'];
}

function withSearchLocation(searchCfg = {}, location) {
  return {
    ...searchCfg,
    location,
  };
}

function toSlug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'india';
}

module.exports = {
  getAdzunaCredentials,
  getEnvValues,
  getRapidApiCredentials,
  getSearchLocations,
  runWithFallback,
  toSlug,
  withSearchLocation,
};
