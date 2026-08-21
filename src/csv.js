const fs = require('node:fs');
const path = require('node:path');

const HEADERS = [
  'Job Title',
  'Company Name',
  'Location',
  'Job Type',
  'Experience Required',
  'Salary',
  'Skills Match (%)',
  'Matched Skills',
  'Application URL',
  'Source API'
];

function escapeCsv(value) {
  const stringValue = value == null ? '' : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function writeCsv(filePath, jobs) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const rows = jobs.map((job) => [
    job.title,
    job.companyName,
    job.location,
    job.jobType,
    job.experienceRequired,
    job.salaryDisplay,
    job.skillsMatchPercentage,
    job.matchedSkills.join(', '),
    job.applicationUrl,
    job.sourceApi
  ]);

  const csv = [HEADERS, ...rows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\n');

  fs.writeFileSync(filePath, `${csv}\n`);
}

module.exports = { writeCsv };
