/**
 * Company Portals connector – fetches job links from well-known company career pages.
 *
 * This connector simply provides curated, pre-configured links to company career pages
 * filtered by the user's keywords.  Web-scraping is avoided to respect ToS; instead
 * we generate direct search URLs that the user can open.
 *
 * When API-based career portals are available (e.g., Greenhouse, Lever, Workday),
 * actual API calls are made.
 */

'use strict';

const { httpGet } = require('../utils/http');

/**
 * Fetch jobs from company career portals.
 *
 * @param {object} cfg    search config section
 * @param {object} logger
 * @param {Array}  portals  array of portal objects from config.companyPortals
 * @returns {Promise<object[]>}  normalised job objects
 */
async function fetchJobs(cfg, logger, portals = []) {
  logger.info('Company Portals: generating career page links...');

  const keywords = (cfg.keywords || ['Java', 'Spring Boot']).join('+');
  const results = [];
  let idx = 0;

  // --- Greenhouse API (many tech companies use this) ---
  const greenhouseCompanies = [
    { slug: 'gojek', name: 'Gojek' },
    { slug: 'razorpay', name: 'Razorpay' },
    { slug: 'swiggy', name: 'Swiggy' },
    { slug: 'meesho', name: 'Meesho' },
    { slug: 'cred', name: 'CRED' },
    { slug: 'zepto', name: 'Zepto' },
    { slug: 'browserstack', name: 'BrowserStack' },
    { slug: 'postman', name: 'Postman' },
  ];

  for (const co of greenhouseCompanies) {
    try {
      const data = await httpGet(
        `https://boards-api.greenhouse.io/v1/boards/${co.slug}/jobs`,
        { params: { content: true }, timeout: cfg.requestTimeoutMs, logger }
      );

      if (data && Array.isArray(data.jobs)) {
        const kwLower = (cfg.keywords || []).map((k) => k.toLowerCase());
        const filtered = data.jobs.filter((j) => {
          const text = `${j.title} ${j.location ? j.location.name : ''}`.toLowerCase();
          return kwLower.length === 0 || kwLower.some((k) => text.includes(k));
        });

        filtered.slice(0, 10).forEach((j) => {
          results.push(normaliseGreenhouse(j, co.name));
        });
      }
    } catch (err) {
      logger.warn(`Company Portals [Greenhouse/${co.name}]: ${err.message}`);
    }
  }

  // --- Lever API ---
  const leverCompanies = [
    { slug: 'freshworks', name: 'Freshworks' },
    { slug: 'zoho', name: 'Zoho' },
    { slug: 'chargebee', name: 'Chargebee' },
  ];

  for (const co of leverCompanies) {
    try {
      const data = await httpGet(
        `https://api.lever.co/v0/postings/${co.slug}?mode=json&commitment=Full-time`,
        { timeout: cfg.requestTimeoutMs, logger }
      );

      if (Array.isArray(data)) {
        const kwLower = (cfg.keywords || []).map((k) => k.toLowerCase());
        const filtered = data.filter((j) => {
          const text = `${j.text} ${j.categories ? Object.values(j.categories).join(' ') : ''}`.toLowerCase();
          return kwLower.length === 0 || kwLower.some((k) => text.includes(k));
        });

        filtered.slice(0, 10).forEach((j) => {
          results.push(normaliseLever(j, co.name));
        });
      }
    } catch (err) {
      logger.warn(`Company Portals [Lever/${co.name}]: ${err.message}`);
    }
  }

  // --- User-configured portals (link generation only) ---
  const enabledPortals = portals.filter((p) => p.enabled);
  enabledPortals.forEach((p) => {
    results.push({
      jobId: `portal-${idx++}-${(p.name || '').replace(/\s/g, '-').toLowerCase()}`,
      title: `${p.name} – Career Page`,
      company: p.name,
      location: 'Visit link for details',
      jobType: 'Full-time',
      experienceRequired: '',
      salaryRaw: '',
      description: `Visit ${p.name} career page for current openings matching: ${keywords}`,
      url: p.url,
      source: 'Company Portal',
      postedDate: '',
      tags: '',
    });
  });

  logger.info(`Company Portals: found ${results.length} listings`);
  return results;
}

function normaliseGreenhouse(j, companyName) {
  return {
    jobId: `greenhouse-${j.id || ''}`,
    title: j.title || '',
    company: companyName,
    location: (j.location && j.location.name) || '',
    jobType: 'Full-time',
    experienceRequired: '',
    salaryRaw: '',
    description: (j.content || '').replace(/<[^>]*>/g, '').substring(0, 500),
    url: j.absolute_url || j.url || '',
    source: 'Company Portal (Greenhouse)',
    postedDate: j.updated_at ? j.updated_at.split('T')[0] : '',
    tags: Array.isArray(j.metadata) ? j.metadata.map((m) => m.value).filter(Boolean).join(', ') : '',
  };
}

function normaliseLever(j, companyName) {
  return {
    jobId: `lever-${j.id || ''}`,
    title: j.text || '',
    company: companyName,
    location: (j.categories && j.categories.location) || '',
    jobType: (j.categories && j.categories.commitment) || 'Full-time',
    experienceRequired: '',
    salaryRaw: '',
    description: (j.descriptionPlain || j.description || '').replace(/<[^>]*>/g, '').substring(0, 500),
    url: j.hostedUrl || j.applyUrl || '',
    source: 'Company Portal (Lever)',
    postedDate: j.createdAt ? new Date(j.createdAt).toISOString().split('T')[0] : '',
    tags: (j.tags || []).join(', '),
  };
}

module.exports = { fetchJobs };
