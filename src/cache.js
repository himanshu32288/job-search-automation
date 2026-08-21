const fs = require('node:fs');
const path = require('node:path');

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readCache(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(filePath, cache) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}

async function withCache({ filePath, key, ttlMinutes, loader, logger }) {
  const cache = readCache(filePath);
  const entry = cache[key];
  const ttlMs = ttlMinutes * 60 * 1000;

  if (entry && Date.now() - entry.timestamp < ttlMs) {
    logger.info('Using cached API response', { key });
    return entry.value;
  }

  const value = await loader();
  cache[key] = { timestamp: Date.now(), value };
  writeCache(filePath, cache);
  return value;
}

module.exports = { withCache };
