/**
 * Skills matcher – scores a job listing against the user's skill profile.
 * Returns a percentage (0-100) and a list of matched skills.
 */

'use strict';

/**
 * Flatten all skills from config.skills into a single array of lowercase strings.
 * @param {object} skillsCfg  config.skills
 * @returns {string[]}
 */
function buildSkillsList(skillsCfg = {}) {
  const all = [];
  for (const group of Object.values(skillsCfg)) {
    if (Array.isArray(group)) {
      group.forEach((s) => all.push(s.toLowerCase()));
    }
  }
  return [...new Set(all)];
}

/**
 * Score a piece of text against a skills list.
 * @param {string}   text       job description + title + tags
 * @param {string[]} skillsList flat list of lowercase skill strings
 * @returns {{ percentage: number, matched: string[] }}
 */
function matchSkills(text, skillsList) {
  if (!text || skillsList.length === 0) {
    return { percentage: 0, matched: [] };
  }

  const lower = text.toLowerCase();
  const matched = skillsList.filter((skill) => {
    // Use word-boundary-ish matching to avoid false positives like "java" in "javascript"
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?<![a-z])${escaped}(?![a-z])`, 'i');
    return re.test(lower);
  });

  const percentage = Math.round((matched.length / skillsList.length) * 100);
  return {
    percentage,
    matched: matched.map((s) => s.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')),
  };
}

module.exports = { buildSkillsList, matchSkills };
