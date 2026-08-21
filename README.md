# Job Search Automation 🚀

A production-ready **Node.js** script that aggregates job listings from **10+ portals**, scores them against your personal skill profile, and exports a ranked CSV — so you can stop hunting across tabs and start applying.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Multi-portal aggregation** | RemoteOK, JSearch, LinkedIn, Indeed, Glassdoor, Naukri, AngelList, Adzuna, Greenhouse/Lever company portals |
| **Skills-based ranking** | Scores every listing against your skill set and sorts by match % |
| **Salary filtering** | Parses salary strings, converts USD/EUR/GBP → INR, filters by range |
| **Deduplication** | Drops duplicates by job ID and normalised title+company pair |
| **Caching** | In-memory + disk cache with configurable TTL — skip redundant API calls |
| **Retry + rate-limit** | Exponential back-off retries, configurable concurrency cap |
| **Multi-format output** | CSV (primary), JSON (optional), rich console summary |
| **Incremental merge** | Appends only new jobs to existing CSV |
| **Structured logging** | Winston logger with timestamps, levels, and log file |

---

## 📁 Project Structure

```
job-search-automation/
├── index.js                  # Main orchestrator
├── config.json               # Search parameters & user preferences
├── .env.example              # API key template
├── package.json
├── src/
│   ├── connectors/
│   │   ├── remoteok.js       # RemoteOK public API (free)
│   │   ├── jsearch.js        # JSearch via RapidAPI
│   │   ├── linkedin.js       # LinkedIn Jobs via RapidAPI
│   │   ├── indeed.js         # Indeed via RapidAPI
│   │   ├── glassdoor.js      # Glassdoor via RapidAPI
│   │   ├── naukri.js         # Naukri.com via RapidAPI
│   │   ├── angellist.js      # AngelList/Wellfound via RapidAPI
│   │   ├── adzuna.js         # Adzuna free public API
│   │   └── companyPortals.js # Greenhouse & Lever open APIs + configured portals
│   ├── utils/
│   │   ├── logger.js         # Winston-based logger
│   │   ├── cache.js          # File-backed in-memory cache
│   │   ├── matcher.js        # Skills matching & scoring
│   │   ├── salary.js         # Salary parsing & INR conversion
│   │   ├── deduplicator.js   # Duplicate filtering
│   │   └── http.js           # Axios wrapper with retry logic
│   └── output.js             # CSV / JSON / console output
├── output/                   # Generated output files (git-ignored)
└── cache/                    # Cache files (git-ignored)
```

---

## 🛠️ Installation

### Prerequisites
- **Node.js** v18 or higher
- **npm** v8 or higher

```bash
# Clone the repository
git clone https://github.com/himanshu32288/job-search-automation.git
cd job-search-automation

# Install dependencies
npm install

# Create your .env file from the template
cp .env.example .env
```

---

## 🔑 API Key Setup

### Free sources (no key required)
| Source | Notes |
|---|---|
| **RemoteOK** | Public API – works out of the box |
| **Adzuna** | Free registration at [developer.adzuna.com](https://developer.adzuna.com/) |
| **Greenhouse** | Public job board API for listed companies |
| **Lever** | Public job board API for listed companies |

### RapidAPI-based sources
All paid/freemium sources use [RapidAPI](https://rapidapi.com). Subscribe to each API's **free tier** (usually 100–500 requests/month) and copy the key into `.env`.

| Source | RapidAPI Link | Env Var |
|---|---|---|
| **JSearch** | [letscrape JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) | `JSEARCH_API_KEY` |
| **LinkedIn** | [LinkedIn Jobs Search](https://rapidapi.com/jaypat87/api/linkedin-jobs-search) | `LINKEDIN_API_KEY` |
| **Indeed** | [Indeed12](https://rapidapi.com/letscrape-6bRBa3QguO5/api/indeed12) | `INDEED_API_KEY` |
| **Glassdoor** | [Glassdoor](https://rapidapi.com/Pat92/api/glassdoor) | `GLASSDOOR_API_KEY` |
| **Naukri** | [Search "naukri" on RapidAPI](https://rapidapi.com/search?term=naukri) | `NAUKRI_API_KEY` |
| **AngelList** | [Search "angellist" on RapidAPI](https://rapidapi.com/search?term=angellist) | `ANGELLIST_API_KEY` |

### Configure `.env`
```env
JSEARCH_API_KEY=your_key_here
LINKEDIN_API_KEY=your_key_here
INDEED_API_KEY=your_key_here
GLASSDOOR_API_KEY=your_key_here
NAUKRI_API_KEY=your_key_here
ANGELLIST_API_KEY=your_key_here
ADZUNA_APP_ID=your_app_id
ADZUNA_API_KEY=your_key_here
```

---

## ⚙️ Configuration (`config.json`)

### Search parameters
```json
"search": {
  "keywords": ["Java", "Spring Boot", "Microservices"],
  "location": "India",
  "jobType": "fulltime",
  "experienceMin": 3,
  "salaryMinINR": 2000000,
  "salaryMaxINR": 5000000,
  "maxResultsPerSource": 50,
  "concurrency": 3
}
```

### Skills (used for matching & ranking)
Add or remove skills under each category in the `skills` section.  
The script builds a flat list and scores every job description against it.

### Enable/disable sources
```json
"sources": {
  "remoteok": true,
  "jsearch": true,
  "linkedin": true,
  "indeed": true,
  "glassdoor": true,
  "naukri": true,
  "angellist": true,
  "adzuna": true,
  "companyPortals": true
}
```

### Company portals
Add your own career page URLs to `companyPortals` array and set `"enabled": true`.

---

## 🚀 Usage

```bash
# Run with default config
npm start

# Run without cache (fresh API calls)
npm run start:no-cache

# Clear cache and run fresh
npm run start:clear-cache

# Use a custom config file
node index.js --config my-config.json
```

### Output files
After a successful run you'll find:

| File | Description |
|---|---|
| `output/jobs.csv` | Full ranked job list (opens in Excel/Google Sheets) |
| `output/jobs.json` | Same data in JSON format |
| `output/job-search.log` | Timestamped run log |

### CSV columns
`Job Title | Company Name | Location | Job Type | Experience Required | Salary (INR) | Skills Match (%) | Matched Skills | Job Description (first 500 chars) | Application URL | Source Portal | Posted Date | Job ID`

---

## 🔧 Troubleshooting

| Symptom | Fix |
|---|---|
| `JSEARCH_API_KEY not set – skipping` | Add the key to `.env` |
| All sources skipped | Run `cp .env.example .env` and fill in at least one key |
| `0 jobs` in CSV | Check `output/job-search.log` for errors; try `--no-cache` |
| CSV is empty after incremental run | Delete `output/jobs.csv` and re-run to regenerate |
| Rate-limit errors | Reduce `concurrency` in `config.json` to `1` |
| Slow run | Disable unused sources in `config.sources` |

---

## 🧩 Extending the Script

Adding a new job portal takes ~50 lines:

1. Create `src/connectors/myportal.js` following any existing connector as a template.
2. Export a `fetchJobs(cfg, logger)` function that returns an array of normalised job objects.
3. Import and register the connector in `index.js`.
4. Add a toggle to `config.json → sources`.

### Normalised job schema
```js
{
  jobId: 'source-unique-id',
  title: '',
  company: '',
  location: '',
  jobType: '',            // 'Full-time', 'Contract', etc.
  experienceRequired: '', // e.g. '3-5 years'
  salaryRaw: '',          // raw string – salary.js parses this
  description: '',
  url: '',
  source: '',             // e.g. 'LinkedIn'
  postedDate: '',         // YYYY-MM-DD
  tags: '',               // comma-separated skills tags
}
```

---

## 📄 License

MIT
