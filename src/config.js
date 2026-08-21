const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');

dotenv.config();

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--config' && argv[index + 1]) {
      options.configPath = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

function loadConfig(configPath) {
  const absolutePath = path.resolve(configPath || 'config/default.json');
  const fileConfig = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));

  if (process.env.OUTPUT_FILE) {
    fileConfig.output.file = process.env.OUTPUT_FILE;
  }

  if (process.env.CACHE_TTL_MINUTES) {
    fileConfig.cache.ttlMinutes = Number(process.env.CACHE_TTL_MINUTES);
  }

  if (process.env.RATE_LIMIT_DELAY_MS) {
    fileConfig.rateLimit.delayMs = Number(process.env.RATE_LIMIT_DELAY_MS);
  }

  if (process.env.USD_TO_INR_RATE) {
    fileConfig.exchangeRate = { usdToInr: Number(process.env.USD_TO_INR_RATE) };
  }

  fileConfig.apiKeys = {
    remoteOk: process.env.REMOTEOK_API_KEY || '',
    rapidApi: process.env.RAPIDAPI_KEY || ''
  };

  if (!fileConfig.exchangeRate) {
    fileConfig.exchangeRate = { usdToInr: 83 };
  }

  return fileConfig;
}

module.exports = { parseArgs, loadConfig };
