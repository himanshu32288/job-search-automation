const { withCache } = require('./cache');
const { sleep } = require('./ranker');

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 20000);

  try {
    const response = await fetch(url, {
      headers: options.headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function buildQuery(config) {
  return encodeURIComponent(config.queryTerms.join(' OR '));
}

async function loadWithCache({ key, url, options, config, logger }) {
  return withCache({
    filePath: config.cache.file,
    key,
    ttlMinutes: config.cache.ttlMinutes,
    logger,
    loader: () => fetchJson(url, options)
  });
}

function normalizeRemoteOk(job) {
  return {
    title: job.position || 'Unknown title',
    companyName: job.company || 'Unknown company',
    location: job.location || 'Remote',
    jobType: job.tags?.includes('full-time') ? 'Full-time' : 'Unknown',
    description: job.description || '',
    experienceRequired: null,
    salary: job.salary_min || job.salary_max ? {
      min: Number(job.salary_min) || null,
      max: Number(job.salary_max) || null,
      currency: 'USD',
      period: 'yearly'
    } : null,
    tags: job.tags || [],
    applicationUrl: job.url || job.apply_url || '',
    sourceApi: 'RemoteOK'
  };
}

function normalizeJSearch(job) {
  const requiredMonths = job.job_required_experience?.required_experience_in_months;
  const experienceRequired = Number.isFinite(requiredMonths) ? Math.floor(requiredMonths / 12) : null;

  return {
    title: job.job_title || 'Unknown title',
    companyName: job.employer_name || 'Unknown company',
    location: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', ') || 'Remote',
    jobType: job.job_employment_type || 'Unknown',
    description: job.job_description || '',
    experienceRequired,
    salary: job.job_min_salary || job.job_max_salary ? {
      min: Number(job.job_min_salary) || null,
      max: Number(job.job_max_salary) || null,
      currency: job.job_salary_currency || 'USD',
      period: 'yearly'
    } : null,
    tags: job.job_highlights?.Qualifications || [],
    applicationUrl: job.job_apply_link || job.job_google_link || '',
    sourceApi: 'JSearch'
  };
}

function normalizeGitHubJob(job) {
  return {
    title: job.title || 'Unknown title',
    companyName: job.company || 'Unknown company',
    location: job.location || 'Remote',
    jobType: job.type || 'Unknown',
    description: job.description || '',
    experienceRequired: null,
    salary: null,
    tags: [],
    applicationUrl: job.url || job.company_url || '',
    sourceApi: 'GitHub Jobs'
  };
}

async function fetchRemoteOk(config, logger) {
  if (!config.apis.remoteOk.enabled) {
    return [];
  }

  const data = await loadWithCache({
    key: 'remoteok',
    url: config.apis.remoteOk.baseUrl,
    config,
    logger
  });

  return (Array.isArray(data) ? data : []).filter((item) => item && item.position).map(normalizeRemoteOk);
}

async function fetchJSearch(config, logger) {
  if (!config.apis.jsearch.enabled) {
    return [];
  }

  if (!config.apiKeys.rapidApi) {
    logger.warn('Skipping JSearch because RAPIDAPI_KEY is not configured');
    return [];
  }

  const query = buildQuery(config);
  const url = `${config.apis.jsearch.baseUrl}?query=${query}&page=1&num_pages=1`;
  const data = await loadWithCache({
    key: `jsearch:${query}`,
    url,
    options: {
      headers: {
        'X-RapidAPI-Key': config.apiKeys.rapidApi,
        'X-RapidAPI-Host': config.apis.jsearch.host
      }
    },
    config,
    logger
  });

  return (data.data || []).map(normalizeJSearch);
}

async function fetchGitHubJobs(config, logger) {
  if (!config.apis.githubJobs.enabled) {
    return [];
  }

  const query = buildQuery(config);
  const url = `${config.apis.githubJobs.baseUrl}?description=${query}`;
  const data = await loadWithCache({
    key: `githubjobs:${query}`,
    url,
    config,
    logger
  });

  return (Array.isArray(data) ? data : []).map(normalizeGitHubJob);
}

async function fetchJobsFromProviders(config, logger) {
  const providers = [
    ['RemoteOK', fetchRemoteOk],
    ['JSearch', fetchJSearch],
    ['GitHub Jobs', fetchGitHubJobs]
  ];
  const allJobs = [];

  for (const [name, provider] of providers) {
    try {
      logger.info(`Fetching jobs from ${name}`);
      const jobs = await provider(config, logger);
      logger.info(`Fetched jobs from ${name}`, { count: jobs.length });
      allJobs.push(...jobs);
    } catch (error) {
      logger.error(`Failed to fetch jobs from ${name}`, { message: error.message });
    }

    await sleep(config.rateLimit.delayMs);
  }

  return allJobs;
}

module.exports = { fetchJobsFromProviders };
