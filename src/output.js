/**
 * Output module – writes processed job data to CSV and/or JSON.
 * Supports incremental merge with an existing CSV file.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const { formatINR, salaryToINR } = require('./utils/salary');

/**
 * Extract the last field from a single CSV line, handling RFC-4180 quoted fields.
 * @param {string} line
 * @returns {string}
 */
function parseLastCsvField(line) {
  // Walk backwards through the fields
  let i = line.length - 1;
  // Strip trailing \r
  if (line[i] === '\r') i--;

  if (i < 0) return '';

  if (line[i] === '"') {
    // Quoted field – find the matching opening quote
    const end = i;
    i--;
    while (i >= 0 && !(line[i] === '"' && (i === 0 || line[i - 1] === ','))) {
      i--;
    }
    return line.substring(i + 1, end).replace(/""/g, '"');
  }

  // Unquoted field – find the preceding comma
  while (i >= 0 && line[i] !== ',') i--;
  return line.substring(i + 1).trim();
}

/** CSV column definitions */
const CSV_HEADERS = [
  { id: 'title',              title: 'Job Title' },
  { id: 'company',            title: 'Company Name' },
  { id: 'location',           title: 'Location' },
  { id: 'jobType',            title: 'Job Type' },
  { id: 'experienceRequired', title: 'Experience Required' },
  { id: 'salaryINR',          title: 'Salary (INR)' },
  { id: 'matchPercentage',    title: 'Skills Match (%)' },
  { id: 'matchedSkills',      title: 'Matched Skills' },
  { id: 'descriptionShort',   title: 'Job Description (first 500 chars)' },
  { id: 'url',                title: 'Application URL' },
  { id: 'source',             title: 'Source Portal' },
  { id: 'postedDate',         title: 'Posted Date' },
  { id: 'jobId',              title: 'Job ID' },
];

/**
 * Prepare a job object for CSV/JSON output.
 * @param {object} job
 * @param {number} maxDescLen
 * @returns {object}
 */
function prepareRow(job, maxDescLen = 500) {
  const inr = salaryToINR(job.salaryRaw);
  return {
    jobId: job.jobId || '',
    title: job.title || '',
    company: job.company || '',
    location: job.location || '',
    jobType: job.jobType || '',
    experienceRequired: job.experienceRequired || '',
    salaryINR: formatINR(inr),
    matchPercentage: job.matchPercentage || 0,
    matchedSkills: Array.isArray(job.matchedSkills) ? job.matchedSkills.join(', ') : '',
    descriptionShort: (job.description || '').substring(0, maxDescLen),
    url: job.url || '',
    source: job.source || '',
    postedDate: job.postedDate || '',
  };
}

/**
 * Write jobs to a CSV file.
 * If incrementalMerge is true and the file already exists, existing job IDs
 * are loaded and only new jobs are appended.
 *
 * @param {object[]} jobs
 * @param {object}   outputCfg   config.output section
 * @param {object}   logger
 */
async function writeCsv(jobs, outputCfg = {}, logger = console) {
  const csvPath = outputCfg.csvFile || 'output/jobs.csv';
  const maxDescLen = outputCfg.maxDescriptionLength || 500;
  const incremental = outputCfg.incrementalMerge !== false;

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });

  let existingIds = new Set();
  let appendMode = false;

  if (incremental && fs.existsSync(csvPath)) {
    // Parse existing CSV properly to extract Job IDs (last column).
    // A simple RFC-4180 aware extractor for the last quoted/unquoted field.
    const existing = fs.readFileSync(csvPath, 'utf8').split('\n');
    // Header is first line – skip it
    for (let i = 1; i < existing.length; i++) {
      const line = existing[i].trim();
      if (!line) continue;
      // Extract the last field from a CSV line, handling quoted fields.
      const lastField = parseLastCsvField(line);
      if (lastField) existingIds.add(lastField);
    }
    appendMode = true;
  }

  const newJobs = incremental
    ? jobs.filter((j) => !existingIds.has(String(j.jobId || '')))
    : jobs;

  if (newJobs.length === 0) {
    logger.info('Output: no new jobs to write to CSV');
    return;
  }

  const writer = createObjectCsvWriter({
    path: csvPath,
    header: CSV_HEADERS,
    append: appendMode,
  });

  await writer.writeRecords(newJobs.map((j) => prepareRow(j, maxDescLen)));
  logger.info(`Output: wrote ${newJobs.length} job(s) to ${csvPath}`);
}

/**
 * Write jobs to a JSON file.
 * @param {object[]} jobs
 * @param {object}   outputCfg
 * @param {object}   logger
 */
function writeJson(jobs, outputCfg = {}, logger = console) {
  const jsonPath = outputCfg.jsonFile || 'output/jobs.json';
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(jobs, null, 2), 'utf8');
  logger.info(`Output: wrote ${jobs.length} job(s) to ${jsonPath}`);
}

/**
 * Print a summary table to the console.
 * @param {object[]} jobs  top-ranked jobs (already sorted)
 * @param {number}   limit number of jobs to show
 */
function printSummary(jobs, limit = 10) {
  console.log('\n');
  console.log('═'.repeat(100));
  console.log('  TOP JOB MATCHES');
  console.log('═'.repeat(100));
  console.log(
    `${'#'.padEnd(4)} ${'Title'.padEnd(35)} ${'Company'.padEnd(25)} ${'Match'.padEnd(7)} ${'Source'.padEnd(15)} URL`
  );
  console.log('─'.repeat(100));

  jobs.slice(0, limit).forEach((job, i) => {
    const idx = String(i + 1).padEnd(4);
    const title = (job.title || '').substring(0, 33).padEnd(35);
    const company = (job.company || '').substring(0, 23).padEnd(25);
    const match = `${job.matchPercentage || 0}%`.padEnd(7);
    const source = (job.source || '').substring(0, 13).padEnd(15);
    const url = (job.url || '').substring(0, 60);
    console.log(`${idx} ${title} ${company} ${match} ${source} ${url}`);
  });

  console.log('═'.repeat(100));
  console.log(`  Total jobs found: ${jobs.length}`);
  console.log('═'.repeat(100));
  console.log('\n');
}

module.exports = { writeCsv, writeJson, printSummary };
