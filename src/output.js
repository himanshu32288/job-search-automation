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

/**
 * Parse the Nth (0-based) field from a single RFC-4180 CSV line.
 * @param {string} line
 * @param {number} index
 * @returns {string}
 */
function parseNthCsvField(line, index) {
  let fieldIndex = 0;
  let i = 0;
  // Strip trailing \r
  const src = line.endsWith('\r') ? line.slice(0, -1) : line;

  while (i <= src.length) {
    let value = '';
    if (src[i] === '"') {
      i++; // skip opening quote
      while (i < src.length) {
        if (src[i] === '"' && src[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (src[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          value += src[i];
          i++;
        }
      }
    } else {
      while (i < src.length && src[i] !== ',') {
        value += src[i];
        i++;
      }
    }
    if (fieldIndex === index) return value.trim();
    fieldIndex++;
    i++; // skip comma
  }
  return '';
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
  { id: 'appliedStatus',      title: 'Applied Status' },
  { id: 'notes',              title: 'Notes' },
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
    appliedStatus: job.appliedStatus || 'Not Applied',
    notes: job.notes || '',
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
  // Map of jobId -> { appliedStatus, notes } from existing CSV
  let existingMeta = new Map();
  let appendMode = false;

  if (incremental && fs.existsSync(csvPath)) {
    const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
    // Parse header to find column indices
    const headerLine = lines[0] || '';
    const headers = headerLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
    const idxJobId = headers.indexOf('Job ID');
    const idxApplied = headers.indexOf('Applied Status');
    const idxNotes = headers.indexOf('Notes');

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const lastField = parseLastCsvField(line);
      if (!lastField) continue;
      // Extract jobId from the correct column position if possible
      const jobId = idxJobId >= 0 ? parseNthCsvField(line, idxJobId) : lastField;
      if (jobId) {
        existingIds.add(jobId);
        const appliedStatus = idxApplied >= 0 ? parseNthCsvField(line, idxApplied) : '';
        const notes = idxNotes >= 0 ? parseNthCsvField(line, idxNotes) : '';
        existingMeta.set(jobId, { appliedStatus, notes });
      }
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

/**
 * Update the Applied Status column in an existing CSV for a set of applied job URLs.
 * @param {Set<string>} appliedUrls  URLs of jobs that were successfully applied to
 * @param {object}      outputCfg
 * @param {object}      logger
 */
async function updateAppliedStatus(appliedUrls, outputCfg = {}, logger = console) {
  if (!appliedUrls || appliedUrls.size === 0) return;

  const csvPath = outputCfg.csvFile || 'output/jobs.csv';
  if (!fs.existsSync(csvPath)) return;

  const lines = fs.readFileSync(csvPath, 'utf8').split('\n');
  if (lines.length < 2) return;

  const headerLine = lines[0].endsWith('\r') ? lines[0].slice(0, -1) : lines[0];
  const headers = headerLine.split(',').map((h) => h.replace(/^"|"$/g, '').trim());
  const idxUrl = headers.indexOf('Application URL');
  const idxApplied = headers.indexOf('Applied Status');

  if (idxUrl < 0 || idxApplied < 0) return;

  const updated = lines.map((line, lineIndex) => {
    if (lineIndex === 0 || !line.trim()) return line;
    const url = parseNthCsvField(line, idxUrl);
    if (!url || !appliedUrls.has(url)) return line;

    // Replace the Applied Status field value in-place by reconstructing the line
    const fields = [];
    let fi = 0;
    let i = 0;
    const hasCarriageReturn = line.endsWith('\r');
    const src = hasCarriageReturn ? line.slice(0, -1) : line;
    while (i <= src.length) {
      let raw = '';
      let quoted = false;
      if (src[i] === '"') {
        quoted = true;
        raw += '"';
        i++;
        while (i < src.length) {
          raw += src[i];
          if (src[i] === '"' && src[i + 1] === '"') {
            raw += src[i + 1];
            i += 2;
          } else if (src[i] === '"') {
            i++;
            break;
          } else {
            i++;
          }
        }
      } else {
        while (i < src.length && src[i] !== ',') {
          raw += src[i];
          i++;
        }
      }
      if (fi === idxApplied) {
        fields.push('Applied');
      } else {
        fields.push(raw);
      }
      fi++;
      i++; // skip comma
    }
    const rebuilt = fields.join(',');
    return hasCarriageReturn ? rebuilt + '\r' : rebuilt;
  });

  fs.writeFileSync(csvPath, updated.join('\n'), 'utf8');
  logger.info(`Output: marked ${appliedUrls.size} job(s) as Applied in ${csvPath}`);
}

module.exports = { writeCsv, writeJson, printSummary, updateAppliedStatus };
