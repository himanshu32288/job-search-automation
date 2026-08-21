const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getAnswerForQuestion, getLatestResumeFile } = require('../src/autoApply/linkedinEasyApply');

test('getAnswerForQuestion maps common LinkedIn question variants', () => {
  const answers = {
    noticePeriod: '30 days',
    currentSalary: '17 LPA',
    expectedSalary: '22 LPA',
    experience: '4 years',
    skills: 'Java, Spring Boot',
  };

  assert.equal(getAnswerForQuestion('What is your notice period?', answers), '30 days');
  assert.equal(getAnswerForQuestion('Current CTC', answers), '17 LPA');
  assert.equal(getAnswerForQuestion('Expected salary', answers), '22 LPA');
  assert.equal(getAnswerForQuestion('Total years of experience', answers), '4 years');
  assert.equal(getAnswerForQuestion('List your key skills', answers), 'Java, Spring Boot');
});

test('getLatestResumeFile picks most recently modified resume', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-test-'));
  const older = path.join(dir, 'resume-old.pdf');
  const latest = path.join(dir, 'resume-latest.docx');

  fs.writeFileSync(older, 'old');
  fs.writeFileSync(latest, 'new');

  const oldDate = new Date('2025-01-01T00:00:00Z');
  const newDate = new Date('2025-02-01T00:00:00Z');
  fs.utimesSync(older, oldDate, oldDate);
  fs.utimesSync(latest, newDate, newDate);

  assert.equal(getLatestResumeFile(dir), latest);
});
