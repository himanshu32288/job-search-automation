const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getAdzunaCredentials,
  getEnvValues,
  getSearchLocations,
  runWithFallback,
} = require('../src/utils/providerConfig');
const { deduplicate } = require('../src/utils/deduplicator');

test('getSearchLocations keeps backward compatibility for a single location', () => {
  assert.deepEqual(getSearchLocations({ location: 'Pune' }), ['Pune']);
});

test('getSearchLocations prefers explicit multiple Indian locations', () => {
  assert.deepEqual(
    getSearchLocations({ location: 'India', locations: ['Bengaluru', 'Hyderabad', 'Bengaluru'] }),
    ['Bengaluru', 'Hyderabad']
  );
});

test('getEnvValues reads comma-separated and numbered credential variables', () => {
  process.env.TEST_PROVIDER_KEYS = 'one, two';
  process.env.TEST_PROVIDER_KEY_1 = 'three';

  assert.deepEqual(
    getEnvValues({ singleName: 'TEST_PROVIDER_KEY', multiName: 'TEST_PROVIDER_KEYS' }),
    ['one', 'two', 'three']
  );

  delete process.env.TEST_PROVIDER_KEYS;
  delete process.env.TEST_PROVIDER_KEY_1;
});

test('getAdzunaCredentials pairs app ids and keys', () => {
  process.env.ADZUNA_APP_IDS = 'app-1,app-2';
  process.env.ADZUNA_API_KEYS = 'key-1,key-2';

  assert.deepEqual(getAdzunaCredentials(), [
    { appId: 'app-1', apiKey: 'key-1' },
    { appId: 'app-2', apiKey: 'key-2' },
  ]);

  delete process.env.ADZUNA_APP_IDS;
  delete process.env.ADZUNA_API_KEYS;
});

test('runWithFallback moves to the next credential after a failure', async () => {
  const seen = [];
  const result = await runWithFallback({
    label: 'Test Provider',
    candidates: [{ id: 1 }, { id: 2 }],
    logger: { info() {}, warn() {} },
    runner: async (candidate) => {
      seen.push(candidate.id);
      if (candidate.id === 1) {
        throw new Error('rate limited');
      }
      return 'ok';
    },
  });

  assert.equal(result, 'ok');
  assert.deepEqual(seen, [1, 2]);
});

test('deduplicate removes repeats across ids, urls, and repeated location searches', () => {
  const jobs = [
    {
      jobId: 'same-id',
      title: 'Backend Engineer',
      company: 'Acme',
      location: 'Bengaluru',
      url: 'https://example.com/jobs/1',
      source: 'Adzuna',
    },
    {
      jobId: 'different-id',
      title: 'Backend Engineer',
      company: 'Acme',
      location: 'Hyderabad',
      url: 'https://example.com/jobs/1/',
      source: 'JSearch',
    },
    {
      jobId: 'third-id',
      title: 'Backend Engineer',
      company: 'Acme',
      location: 'Bengaluru',
      url: '',
      source: 'Adzuna',
    },
  ];

  const deduped = deduplicate(jobs);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].jobId, 'same-id');
});
