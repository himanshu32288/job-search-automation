const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { filterAndRankJobs } = require('../src/ranker');
const { writeCsv } = require('../src/csv');

const config = {
  filters: {
    jobType: 'Full-time',
    minimumExperienceYears: 3,
    minimumSalaryInr: 2000000,
    maximumSalaryInr: 5000000,
    allowUnknownSalary: true,
    allowUnknownExperience: true
  },
  exchangeRate: { usdToInr: 83 },
  skills: {
    Languages: ['Java', 'C++'],
    Frameworks: ['Spring Boot', 'Hibernate'],
    Systems: ['Kafka', 'Microservices'],
    Practices: ['REST API Design', 'OOP']
  }
};

test('filterAndRankJobs keeps full-time jobs, removes duplicates, and ranks by skill match', () => {
  const jobs = [
    {
      title: 'Senior Backend Engineer',
      companyName: 'Acme',
      location: 'Remote',
      jobType: 'Full-time',
      description: '3+ years Java Spring Boot Hibernate Kafka Microservices REST API OOP',
      experienceRequired: 3,
      salary: { min: 25000, max: 40000, currency: 'USD', period: 'yearly' },
      tags: ['Java', 'Kafka'],
      applicationUrl: 'https://example.com/job-1',
      sourceApi: 'RemoteOK'
    },
    {
      title: 'Duplicate Backend Engineer',
      companyName: 'Acme',
      location: 'Remote',
      jobType: 'Full-time',
      description: '5 years Java Spring Boot',
      experienceRequired: 5,
      salary: { min: 25000, max: 40000, currency: 'USD', period: 'yearly' },
      tags: ['Java'],
      applicationUrl: 'https://example.com/job-1',
      sourceApi: 'JSearch'
    },
    {
      title: 'Contract Engineer',
      companyName: 'Beta',
      location: 'Bengaluru',
      jobType: 'Contract',
      description: '5 years Java',
      experienceRequired: 5,
      salary: { min: 3000000, max: 3500000, currency: 'INR', period: 'yearly' },
      tags: ['Java'],
      applicationUrl: 'https://example.com/job-2',
      sourceApi: 'JSearch'
    },
    {
      title: 'Staff Engineer',
      companyName: 'Gamma',
      location: 'Remote',
      jobType: 'Full-time',
      description: '6 years Java Spring Boot',
      experienceRequired: 6,
      salary: { min: 70000, max: 90000, currency: 'USD', period: 'yearly' },
      tags: ['Java'],
      applicationUrl: 'https://example.com/job-3',
      sourceApi: 'GitHub Jobs'
    }
  ];

  const ranked = filterAndRankJobs(jobs, config);

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].title, 'Senior Backend Engineer');
  assert.equal(ranked[0].skillsMatchPercentage, 88);
  assert.deepEqual(ranked[0].matchedSkills.sort(), ['Hibernate', 'Java', 'Kafka', 'Microservices', 'OOP', 'REST API Design', 'Spring Boot'].sort());
});

test('writeCsv writes expected headers and values', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-search-'));
  const filePath = path.join(tempDir, 'jobs.csv');

  writeCsv(filePath, [{
    title: 'Senior Backend Engineer',
    companyName: 'Acme',
    location: 'Remote',
    jobType: 'Full-time',
    experienceRequired: '3+ years',
    salaryDisplay: 'USD 25,000-40,000/year',
    skillsMatchPercentage: 75,
    matchedSkills: ['Java', 'Spring Boot'],
    applicationUrl: 'https://example.com/job-1',
    sourceApi: 'RemoteOK'
  }]);

  const content = fs.readFileSync(filePath, 'utf8');
  assert.match(content, /Job Title,Company Name,Location,Job Type/);
  assert.match(content, /Senior Backend Engineer,Acme,Remote,Full-time/);
  assert.match(content, /Java, Spring Boot/);
});
