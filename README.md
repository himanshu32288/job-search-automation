# job-search-automation

A production-ready Node.js script that aggregates jobs from RemoteOK, JSearch, and GitHub Jobs, filters them against your target criteria, ranks them by skill match, and exports the results to CSV.

## Features

- Multi-source job aggregation:
  - RemoteOK API
  - JSearch API (RapidAPI)
  - GitHub Jobs API
- Full-time filtering
- 3+ years experience filtering
- Salary filtering for ₹2,000,000 to ₹5,000,000 (with USD-to-INR conversion)
- Skill matching and ranking for backend/distributed-systems roles
- Duplicate removal across APIs
- File-based response caching to reduce redundant calls
- Built-in rate limiting between provider calls
- Clear timestamped logging and progress messages
- CSV export sorted by highest skill match
- Environment-variable support via `.env`

## Requirements

- Node.js 18+

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Add your API keys to `.env`:

   - **JSearch**: create a RapidAPI account and subscribe to the JSearch API at:
     `https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch`
   - **RemoteOK**: the public API currently works without an API key; leave `REMOTEOK_API_KEY` empty unless RemoteOK changes its access policy.
   - **GitHub Jobs API**: no API key is required. Note that this API is deprecated, so the script handles failures gracefully and continues with the remaining sources.

## Configuration

Default configuration lives in `/home/runner/work/job-search-automation/job-search-automation/config/default.json` and includes:

- output CSV path
- job-type, experience, and salary filters
- skills grouped by category
- cache file and TTL
- rate-limit delay
- API endpoints

You can customize the defaults directly in `config/default.json` or override selected values via `.env`:

- `OUTPUT_FILE`
- `CACHE_TTL_MINUTES`
- `RATE_LIMIT_DELAY_MS`
- `USD_TO_INR_RATE`
- `RAPIDAPI_KEY`
- `REMOTEOK_API_KEY`

## Usage

Run with the default configuration:

```bash
npm start
```

Run with a custom config file:

```bash
node src/index.js --config ./config/default.json
```

The script will generate `output/jobs.csv` (or your configured output file) with these columns:

- Job Title
- Company Name
- Location
- Job Type
- Experience Required
- Salary
- Skills Match (%)
- Matched Skills
- Application URL
- Source API

## How matching works

Jobs are normalized into a common structure and then:

1. deduplicated by application URL (or title/company/location fallback)
2. filtered to full-time roles
3. filtered for 3+ years experience when experience is available
4. filtered for salary range when salary is available
5. ranked by the percentage of configured skills found in the job content

## Notes

- Salary filtering keeps jobs with undisclosed compensation by default because many public APIs omit salary data.
- Experience filtering keeps jobs with missing experience data by default for the same reason.
- API failures are logged per provider; one failing API does not stop the export.
- Cached API responses are stored under `.cache/` and ignored by git.

## Testing

Run focused validation with:

```bash
npm test
```
