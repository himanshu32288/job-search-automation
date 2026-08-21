const path = require('node:path');
const { parseArgs, loadConfig } = require('./config');
const logger = require('./logger');
const { fetchJobsFromProviders } = require('./providers');
const { filterAndRankJobs } = require('./ranker');
const { writeCsv } = require('./csv');

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadConfig(args.configPath);

  logger.info('Starting job search automation');
  const jobs = await fetchJobsFromProviders(config, logger);
  logger.info('Total jobs fetched before filtering', { count: jobs.length });

  const rankedJobs = filterAndRankJobs(jobs, config);
  const outputFile = path.resolve(config.output.file);
  writeCsv(outputFile, rankedJobs);

  logger.info('Job search complete', {
    exportedJobs: rankedJobs.length,
    outputFile
  });
}

if (require.main === module) {
  run().catch((error) => {
    logger.error('Job search failed', { message: error.message });
    process.exitCode = 1;
  });
}

module.exports = { run };
