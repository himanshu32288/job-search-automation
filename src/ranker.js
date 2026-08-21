function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function flattenSkills(skillsByCategory) {
  return Object.values(skillsByCategory).flat();
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function skillAliases(skill) {
  const aliases = new Set([skill]);
  const normalized = skill.toLowerCase();

  if (normalized === 'oracle (sql)') {
    aliases.add('oracle');
    aliases.add('sql');
    aliases.add('oracle sql');
  }

  if (normalized === 'low-level design') {
    aliases.add('lld');
    aliases.add('low level design');
  }

  if (normalized === 'high-level design') {
    aliases.add('hld');
    aliases.add('high level design');
  }

  if (normalized === 'rest api design') {
    aliases.add('rest api');
    aliases.add('restful api');
  }

  if (normalized === 'unit and integration testing') {
    aliases.add('unit testing');
    aliases.add('integration testing');
  }

  if (normalized === 'data structures and algorithms') {
    aliases.add('data structures');
    aliases.add('algorithms');
    aliases.add('dsa');
  }

  if (normalized === 'oop') {
    aliases.add('object oriented programming');
    aliases.add('object-oriented programming');
  }

  return [...aliases];
}

function matchSkills(job, skills) {
  const corpus = [job.title, job.description, job.location, ...(job.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const matchedSkills = skills.filter((skill) => {
    return skillAliases(skill).some((alias) => {
      const pattern = new RegExp(`(^|[^a-z0-9+])${escapeRegex(alias.toLowerCase())}([^a-z0-9+]|$)`);
      return pattern.test(corpus);
    });
  });

  const uniqueMatches = [...new Set(matchedSkills)];
  const percentage = skills.length === 0 ? 0 : Math.round((uniqueMatches.length / skills.length) * 100);

  return {
    matchedSkills: uniqueMatches,
    skillsMatchPercentage: percentage
  };
}

function extractExperienceYears(text) {
  const source = (text || '').toLowerCase();
  const matches = [...source.matchAll(/(\d+)\s*\+?\s*(?:years|year|yrs|yr)/g)];
  if (matches.length === 0) {
    return null;
  }

  return Math.max(...matches.map((match) => Number(match[1])));
}

function normalizeSalary(rawSalary, exchangeRate) {
  if (!rawSalary) {
    return null;
  }

  const min = rawSalary.min ?? null;
  const max = rawSalary.max ?? null;
  const currency = (rawSalary.currency || 'USD').toUpperCase();
  const midpoint = [min, max].filter((value) => Number.isFinite(value));

  if (midpoint.length === 0) {
    return null;
  }

  const average = midpoint.reduce((sum, value) => sum + value, 0) / midpoint.length;
  const annual = rawSalary.period === 'monthly' ? average * 12 : average;

  if (currency === 'INR') {
    return { amount: annual, currency };
  }

  if (currency === 'USD') {
    return { amount: annual * exchangeRate.usdToInr, currency };
  }

  return { amount: annual, currency };
}

function formatSalary(rawSalary) {
  if (!rawSalary) {
    return 'Not disclosed';
  }

  const min = rawSalary.min ? rawSalary.min.toLocaleString('en-US') : null;
  const max = rawSalary.max ? rawSalary.max.toLocaleString('en-US') : null;
  const currency = rawSalary.currency || 'USD';
  const period = rawSalary.period === 'monthly' ? '/month' : '/year';

  if (min && max) {
    return `${currency} ${min}-${max}${period}`;
  }

  if (min) {
    return `${currency} ${min}${period}`;
  }

  if (max) {
    return `${currency} ${max}${period}`;
  }

  return 'Not disclosed';
}

function isFullTime(job) {
  const jobType = (job.jobType || '').toLowerCase();
  const description = (job.description || '').toLowerCase();
  return jobType.includes('full') || description.includes('full-time') || description.includes('full time');
}

function withinRange(value, minimum, maximum) {
  return value >= minimum && value <= maximum;
}

function filterAndRankJobs(jobs, config) {
  const skills = flattenSkills(config.skills);
  const seen = new Set();

  return jobs
    .filter((job) => {
      const dedupeKey = (job.applicationUrl || `${job.title}|${job.companyName}|${job.location}`).toLowerCase();
      if (seen.has(dedupeKey)) {
        return false;
      }
      seen.add(dedupeKey);
      return true;
    })
    .filter((job) => isFullTime(job))
    .map((job) => {
      const experienceRequired = job.experienceRequired ?? extractExperienceYears(job.description);
      const normalizedSalary = normalizeSalary(job.salary, config.exchangeRate);
      const salaryInRange = !normalizedSalary
        ? config.filters.allowUnknownSalary
        : withinRange(normalizedSalary.amount, config.filters.minimumSalaryInr, config.filters.maximumSalaryInr);
      const experienceMatches = experienceRequired == null
        ? config.filters.allowUnknownExperience
        : experienceRequired >= config.filters.minimumExperienceYears;
      const skillMatch = matchSkills(job, skills);

      return {
        ...job,
        experienceRequired: experienceRequired == null ? 'Not specified' : `${experienceRequired}+ years`,
        salaryDisplay: formatSalary(job.salary),
        _salaryAccepted: salaryInRange,
        _experienceAccepted: experienceMatches,
        ...skillMatch
      };
    })
    .filter((job) => job._salaryAccepted && job._experienceAccepted)
    .sort((left, right) => right.skillsMatchPercentage - left.skillsMatchPercentage || left.title.localeCompare(right.title));
}

module.exports = {
  sleep,
  flattenSkills,
  matchSkills,
  extractExperienceYears,
  normalizeSalary,
  formatSalary,
  filterAndRankJobs
};
