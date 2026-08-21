'use strict';

const fs = require('fs');
const path = require('path');

const EASY_APPLY_SOURCE = 'LinkedIn';
const EASY_APPLY_CLICK_TIMEOUT_MS = 10000;
const STEP_WAIT_MS = 800;
const SUBMIT_WAIT_MS = 1200;

function getChromium() {
  try {
    return require('playwright').chromium;
  } catch (error) {
    throw new Error('Playwright is required for auto-apply. Run: npm install playwright && npx playwright install chromium');
  }
}

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getLatestResumeFile(resumeDirectory, allowedExtensions = ['.pdf', '.doc', '.docx']) {
  const absoluteDirectory = path.resolve(resumeDirectory || 'resumes');
  if (!fs.existsSync(absoluteDirectory)) return null;

  const extensions = new Set(allowedExtensions.map((ext) => String(ext || '').toLowerCase()));
  const files = fs
    .readdirSync(absoluteDirectory)
    .map((name) => {
      const filePath = path.join(absoluteDirectory, name);
      const stats = fs.statSync(filePath);
      return { name, filePath, stats };
    })
    .filter((entry) => entry.stats.isFile())
    .filter((entry) => extensions.has(path.extname(entry.name).toLowerCase()))
    .sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);

  return files[0] ? files[0].filePath : null;
}

function getAnswerForQuestion(questionText, answers = {}) {
  const text = normalise(questionText);
  if (!text) return '';

  const baseAnswers = {
    noticePeriod: answers.noticePeriod || '',
    currentSalary: answers.currentSalary || '',
    expectedSalary: answers.expectedSalary || '',
    experience: answers.experience || '',
    skills: answers.skills || '',
  };

  if (text.includes('notice period')) return baseAnswers.noticePeriod;
  if (text.includes('current') && (text.includes('salary') || text.includes('ctc'))) return baseAnswers.currentSalary;
  if ((text.includes('expected') || text.includes('required')) && (text.includes('salary') || text.includes('ctc'))) {
    return baseAnswers.expectedSalary;
  }
  if (text.includes('experience')) return baseAnswers.experience;
  if (text.includes('skill') || text.includes('technology') || text.includes('stack')) return baseAnswers.skills;

  const additionalAnswers = answers.additional && typeof answers.additional === 'object' ? answers.additional : {};
  const additionalMatch = Object.entries(additionalAnswers).find(([key]) => text.includes(normalise(key)));
  return additionalMatch ? String(additionalMatch[1] || '') : '';
}

async function closeEasyApplyModal(page) {
  const dismissButtons = [
    page.getByRole('button', { name: /discard/i }).first(),
    page.getByRole('button', { name: /done/i }).first(),
    page.getByRole('button', { name: /close/i }).first(),
  ];
  for (const button of dismissButtons) {
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      return;
    }
  }
}

/**
 * Detects the LinkedIn Easy Apply resume-selection step (where resumes stored in
 * your LinkedIn profile are listed) and selects the first/top option.
 *
 * LinkedIn renders saved resumes as a list of radio-button-like cards inside the
 * Easy Apply modal.  The typical DOM shape is:
 *   <div role="radiogroup" aria-label="Choose a resume"> (or similar)
 *     <div role="radio" ...>  ← first stored resume (most recently uploaded)
 *     ...
 *   </div>
 *
 * Returns true when a stored resume was successfully selected, false otherwise.
 */
async function selectLinkedInStoredResume(page) {
  // Look for a radio-group that LinkedIn uses for stored resumes.
  const resumeGroupSelectors = [
    '[role="radiogroup"][aria-label*="resume" i]',
    '[role="radiogroup"][aria-label*="cv" i]',
    '.jobs-resume-picker__resume-list',
    '[data-test-resume-picker-modal]',
  ];

  for (const selector of resumeGroupSelectors) {
    const group = page.locator(selector).first();
    if (!(await group.isVisible().catch(() => false))) continue;

    // Try to click the first resume card/radio option inside the group.
    const firstOption = group.locator('[role="radio"], input[type="radio"]').first();
    if (await firstOption.isVisible().catch(() => false)) {
      const isAlreadySelected = await firstOption.getAttribute('aria-checked').catch(() => null);
      if (isAlreadySelected !== 'true') {
        await firstOption.click().catch(() => {});
      }
      return true;
    }

    // Fallback: click the first child element of the group.
    const firstChild = group.locator('> *').first();
    if (await firstChild.isVisible().catch(() => false)) {
      await firstChild.click().catch(() => {});
      return true;
    }
  }

  // Also handle the case where LinkedIn shows a heading like "Choose resume"
  // followed by resume items that are not wrapped in a role="radiogroup".
  const resumeHeading = page.locator(
    'h3:has-text("resume"), legend:has-text("resume")'
  ).first();
  if (await resumeHeading.isVisible().catch(() => false)) {
    // Scope the radio search to the heading's closest ancestor section/div.
    const nearbyRadio = resumeHeading
      .locator('xpath=ancestor::div[1]//input[@type="radio"]')
      .first();
    if (await nearbyRadio.isVisible().catch(() => false)) {
      const isAlreadyChecked = await nearbyRadio.isChecked().catch(() => false);
      if (!isAlreadyChecked) {
        await nearbyRadio.click().catch(() => {});
      }
      return true;
    }
  }

  return false;
}

async function fillCurrentStep(page, answers, resumePath) {
  const textInputs = page.locator('input[type="text"], input[type="number"], textarea');
  const textInputCount = await textInputs.count();
  for (let index = 0; index < textInputCount; index += 1) {
    const field = textInputs.nth(index);
    if (!(await field.isVisible().catch(() => false))) continue;

    const currentValue = await field.inputValue().catch(() => '');
    if (currentValue) continue;

    const question = [
      await field.getAttribute('aria-label').catch(() => ''),
      await field.getAttribute('name').catch(() => ''),
      await field.getAttribute('id').catch(() => ''),
      await field.getAttribute('placeholder').catch(() => ''),
    ].join(' ');

    const answer = getAnswerForQuestion(question, answers);
    if (!answer) continue;
    await field.fill(answer).catch(() => {});
  }

  const selects = page.locator('select');
  const selectCount = await selects.count();
  for (let index = 0; index < selectCount; index += 1) {
    const field = selects.nth(index);
    if (!(await field.isVisible().catch(() => false))) continue;
    const question = [
      await field.getAttribute('aria-label').catch(() => ''),
      await field.getAttribute('name').catch(() => ''),
      await field.getAttribute('id').catch(() => ''),
    ].join(' ');
    const answer = getAnswerForQuestion(question, answers);
    if (!answer) continue;
    await field.selectOption({ label: answer }).catch(() => {});
  }

  // Try to select a resume already stored in the LinkedIn profile first.
  const storedResumeSelected = await selectLinkedInStoredResume(page);

  // Fall back to uploading a local file only when no stored resume was selected.
  if (!storedResumeSelected) {
    if (!resumePath) return;
    const fileInputs = page.locator('input[type="file"]');
    const fileInputCount = await fileInputs.count();
    for (let index = 0; index < fileInputCount; index += 1) {
      const field = fileInputs.nth(index);
      const metadata = [
        await field.getAttribute('aria-label').catch(() => ''),
        await field.getAttribute('name').catch(() => ''),
        await field.getAttribute('id').catch(() => ''),
        await field.getAttribute('accept').catch(() => ''),
      ].join(' ');
      const normalisedMetadata = normalise(metadata);
      const shouldUploadResume = fileInputCount === 1
        || normalisedMetadata.includes('resume')
        || normalisedMetadata.includes('cv');

      if (!shouldUploadResume) continue;
      await field.setInputFiles(resumePath).catch(() => {});
    }
  }
}

async function applyToJob(page, job, cfg, resumePath, logger) {
  await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: cfg.navigationTimeoutMs || 45000 });

  const easyApplyButton = page.locator('button.jobs-apply-button, button[aria-label*="Easy Apply"]').first();
  if (!(await easyApplyButton.isVisible().catch(() => false))) {
    return { status: 'skipped', reason: 'easy-apply-not-found', url: job.url };
  }

  await easyApplyButton.click({ timeout: EASY_APPLY_CLICK_TIMEOUT_MS }).catch(() => {});
  await page.waitForTimeout(STEP_WAIT_MS);

  let submitted = false;
  const maxSteps = cfg.maxStepsPerApplication || 10;

  for (let step = 0; step < maxSteps; step += 1) {
    await fillCurrentStep(page, cfg.answers || {}, resumePath);

    const submitButton = page.getByRole('button', { name: /submit application/i }).first();
    if (await submitButton.isVisible().catch(() => false)) {
      if (cfg.submitApplications === false) {
        await closeEasyApplyModal(page);
        return { status: 'prepared', url: job.url };
      }
      await submitButton.click().catch(() => {});
      submitted = true;
      await page.waitForTimeout(SUBMIT_WAIT_MS);
      break;
    }

    const continueButtons = [
      page.getByRole('button', { name: /^Next$/i }).first(),
      page.getByRole('button', { name: /^Review$/i }).first(),
      page.getByRole('button', { name: /^Review your application$/i }).first(),
    ];
    let advanced = false;
    for (const continueButton of continueButtons) {
      if (await continueButton.isVisible().catch(() => false)) {
        await continueButton.click().catch(() => {});
        await page.waitForTimeout(STEP_WAIT_MS);
        advanced = true;
        break;
      }
    }
    if (advanced) continue;

    break;
  }

  await closeEasyApplyModal(page);

  if (submitted) {
    logger.info(`LinkedIn auto-apply: submitted application for ${job.title} at ${job.company}`);
    return { status: 'submitted', url: job.url };
  }

  return { status: 'skipped', reason: 'unable-to-complete-form', url: job.url };
}

async function runLinkedInEasyApply(jobs, cfg = {}, logger = console) {
  const effectiveCfg = {
    enabled: false,
    headless: false,
    submitApplications: false,
    maxApplicationsPerRun: 10,
    maxStepsPerApplication: 10,
    userDataDir: '.linkedin-session',
    resumeDirectory: 'resumes',
    resumeExtensions: ['.pdf', '.doc', '.docx'],
    loginWaitMs: 0,
    navigationTimeoutMs: 45000,
    openLinkedInHomeFirst: true,
    answers: {},
    ...cfg,
  };
  const enabled = effectiveCfg.enabled === true;
  if (!enabled) return null;

  const candidateJobs = (jobs || [])
    .filter((job) => job.source === EASY_APPLY_SOURCE)
    .filter((job) => String(job.url || '').includes('linkedin.com/jobs/view'))
    .slice(0, effectiveCfg.maxApplicationsPerRun);

  if (candidateJobs.length === 0) {
    logger.info('LinkedIn auto-apply: no LinkedIn jobs available for applying');
    return { attempted: 0, submitted: 0, skipped: 0, prepared: 0, appliedUrls: new Set() };
  }

  const resumePath = getLatestResumeFile(effectiveCfg.resumeDirectory, effectiveCfg.resumeExtensions);
  if (!resumePath) {
    logger.info('LinkedIn auto-apply: no local resume found; will use LinkedIn stored resume if available');
  } else {
    logger.info(`LinkedIn auto-apply: local resume available at ${resumePath} (used as fallback when no stored resume is found)`);
  }

  const chromium = getChromium();
  let context;
  try {
    context = await chromium.launchPersistentContext(path.resolve(effectiveCfg.userDataDir), {
      headless: effectiveCfg.headless === true,
      viewport: { width: 1366, height: 900 },
    });
  } catch (error) {
    throw new Error(`Failed to launch Chromium for LinkedIn auto-apply - ${error.message}`);
  }

  const summary = { attempted: 0, submitted: 0, skipped: 0, prepared: 0, appliedUrls: new Set() };

  try {
    const page = context.pages()[0] || await context.newPage();

    if (effectiveCfg.openLinkedInHomeFirst !== false) {
      await page.goto('https://www.linkedin.com/feed/', { waitUntil: 'domcontentloaded', timeout: effectiveCfg.navigationTimeoutMs });
      if (effectiveCfg.loginWaitMs) {
        logger.info(`LinkedIn auto-apply: waiting ${effectiveCfg.loginWaitMs}ms for manual login checks`);
        await page.waitForTimeout(effectiveCfg.loginWaitMs);
      }
    }

    for (const job of candidateJobs) {
      summary.attempted += 1;
      try {
        const result = await applyToJob(page, job, effectiveCfg, resumePath, logger);
        if (result.status === 'submitted') {
          summary.submitted += 1;
          summary.appliedUrls.add(result.url);
        } else if (result.status === 'prepared') {
          summary.prepared += 1;
          summary.appliedUrls.add(result.url);
        } else {
          summary.skipped += 1;
        }
      } catch (error) {
        summary.skipped += 1;
        logger.warn(`LinkedIn auto-apply: failed for ${job.url} - ${error.message}`);
      }
    }
  } finally {
    await context.close();
  }

  logger.info(`LinkedIn auto-apply summary: attempted=${summary.attempted}, submitted=${summary.submitted}, prepared=${summary.prepared}, skipped=${summary.skipped}`);
  return summary;
}

module.exports = {
  getAnswerForQuestion,
  getLatestResumeFile,
  selectLinkedInStoredResume,
  runLinkedInEasyApply,
};
