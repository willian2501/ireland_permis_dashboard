# Ireland Employment Permits Dashboard

A fully interactive, client-side dashboard that visualises Ireland's Employment Permits data sourced from official government Google Sheets. Supports **multi-year** viewing (2024, 2025, 2026) with one-click year switching.

**Live data** — the dashboard fetches directly from the Google Sheets API on every page load, so figures are always up to date.

---

## Data Sources (Google Sheets APIs)

Each year has its own spreadsheet with 4 tabs. All are accessed via the Google Sheets v4 `batchGet` endpoint.

| Year | Spreadsheet ID | API URL |
|------|---------------|---------|
| **2024** | `13rRnMJ-nR95UWm4MOC3XUCxcnu2QHkbI29a4Kso6GUw` | [Open](https://sheets.googleapis.com/v4/spreadsheets/13rRnMJ-nR95UWm4MOC3XUCxcnu2QHkbI29a4Kso6GUw/values:batchGet?ranges=permits-to-companies&ranges=permits-by-sector&ranges=permits-by-nationality&ranges=permits-by-county&key=AIzaSyCVYfHKiIvbt_MkVC00FygLLwDBJP8ty84) |
| **2025** | `1TSCiQsMa6FrUhYJtCj3-YoP8dO0Z68OMEJehI2F8oWU` | [Open](https://sheets.googleapis.com/v4/spreadsheets/1TSCiQsMa6FrUhYJtCj3-YoP8dO0Z68OMEJehI2F8oWU/values:batchGet?ranges=permits-to-companies&ranges=permits-by-sector&ranges=permits-by-nationality&ranges=permits-by-county&key=AIzaSyCVYfHKiIvbt_MkVC00FygLLwDBJP8ty84) |
| **2026** | `1RygxbPr7yR_3GhIjwTXqAikr86N1JOivZmQn6lMCbkQ` | [Open](https://sheets.googleapis.com/v4/spreadsheets/1RygxbPr7yR_3GhIjwTXqAikr86N1JOivZmQn6lMCbkQ/values:batchGet?ranges=permits-to-companies&ranges=permits-by-sector&ranges=permits-by-nationality&ranges=permits-by-county&key=AIzaSyCVYfHKiIvbt_MkVC00FygLLwDBJP8ty84) |

**Sheets per spreadsheet:**

| Sheet Name | Dashboard Tab | Contains Monthly Breakdown |
|---|---|---|
| `permits-to-companies` | Companies | Yes (Jan–Dec) |
| `permits-by-sector` | Sector | Yes (Jan–Dec) |
| `permits-by-nationality` | Nationality | No (Issued / Refused / Withdrawn) |
| `permits-by-county` | County | No (Issued / Refused / Withdrawn) |

**API Key:** `AIzaSyCVYfHKiIvbt_MkVC00FygLLwDBJP8ty84`

> **Note:** Header formats differ across years — see the _Flexible Header Parsing_ section below.

---

## Project Structure

```
ITinDublin/
├── index.html          # Main dashboard page (single-page app)
├── css/
│   └── styles.css      # All styles, responsive breakpoints, year selector
├── js/
│   ├── data.js         # DataService module — API fetching & data parsing
│   └── app.js          # App module — UI, tabs, charts, filters, pagination
└── README.md
```

No build tools, no bundlers, no frameworks. Pure **HTML + CSS + vanilla JavaScript**.

---

## Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Bar, line, doughnut charts |
| [chartjs-plugin-datalabels](https://chartjs-plugin-datalabels.netlify.app/) | 2.2.0 | Percentage labels on doughnut slices |
| Google Sheets API v4 | — | Live data source |

Both JS libraries are loaded from CDN (`<script>` tags in `index.html`).

---

## Features

### Dashboard Tabs
- **Companies** — Top employers by permit count, monthly trend line chart, top-10 bar chart, top-5 doughnut chart
- **Sector** — Economic sectors (NACE codes), bar + doughnut charts
- **County** — Irish counties, bar + doughnut charts
- **Nationality** — Permit holder nationalities, bar + doughnut charts

### Multi-Year Support
- Year selector bar with **2026 / 2025 / 2024** buttons
- Default year: **2026** (configurable via `DEFAULT_YEAR` in `data.js`)
- Year badge displayed in the header
- All filters reset on year switch
- Data is **never aggregated** across years — each year is independent

### Interactive Controls
- **Search/filter** — text search on entity names
- **Top N filter** — show top 10, 25, 50, 100, or all
- **Minimum permits filter** (Companies tab) — hide small employers
- **Column sorting** — click any column header to sort asc/desc
- **Pagination** — configurable rows per page (25, 50, 100, all)
- **CSV export** — download filtered data as CSV (filename includes year)

### KPI Cards
Each tab shows 4 summary cards: total permits/entities, top entity, top entity share %, and entity count.

### Responsive Design
- **4 breakpoints:** 1024px, 768px, 480px, 360px
- Touch-friendly inputs (44px minimum tap targets)
- Horizontal scroll on tables for small screens
- iOS zoom prevention (`font-size: 16px` on inputs)

---

## Architecture

### `js/data.js` — DataService (IIFE module)

Responsible for all data fetching and parsing. Exports:

| Export | Description |
|--------|-------------|
| `fetchAll(year)` | Fetches all 4 sheets for the given year, returns parsed data object |
| `exportCSV(rows, columns, filename)` | Generates and downloads a CSV file |
| `MONTHS` | `['jan','feb',…,'dec']` |
| `MONTH_LABELS` | `['January','February',…,'December']` |
| `AVAILABLE_YEARS` | `[2026, 2025, 2024]` (sorted newest first) |
| `DEFAULT_YEAR` | `2026` |

#### Flexible Header Parsing

The three Google Sheets use **different header formats**, which required a smart parser:

| Year | Month Format | Grand Total Position | Notes |
|------|-------------|---------------------|-------|
| 2024 | Abbreviated (`Jan`, `Feb`) | Column B (index 1) | Sector sheet has **2 header rows** |
| 2025 | Full names (`January`, `February`) | Last column | Standard format |
| 2026 | Prefixed (`Permits Issued Jan`) | Varies | Only partial year data; companies sheet has **no Grand Total summary row** |

The `matchMonth(header)` function handles all three formats:
1. Exact full name match (`"January"`)
2. Exact 3-letter abbreviation match (`"Jan"`)
3. Word-boundary search for abbreviation within longer strings (`"Permits Issued Jan"`)

The `parseSheet()` function uses **smart row scanning** to detect:
- Sub-header rows (e.g. 2024 sector's second header row with "Economic Sector" / "Grand Total" labels)
- Grand Total summary rows (position varies by sheet/year)
- Data start row (immediately after headers + optional GT row)
- Falls back to "Issued" column for nationality/county tabs that have no monthly data or Grand Total header

### `js/app.js` — App (async IIFE)

Handles all UI rendering and interaction:

| Concept | Implementation |
|---------|---------------|
| **Year switching** | `initYearSelector()` — attaches click handlers, disables buttons during load, calls `refreshAll()` |
| **Tab system** | Click-based tab switching with `data-tab` attributes |
| **Companies tab** | Dedicated render function with trend chart, bar chart, doughnut |
| **Generic tabs** | `initGenericTab(tabKey, label)` / `renderGeneric(tabKey, label)` — reusable for Sector, County, Nationality |
| **State management** | Per-tab `STATE` object tracks sort, page, search, filters |
| **Chart lifecycle** | `destroyChart(id)` / `chartInstances` map prevents memory leaks on re-render |
| **Listener isolation** | `listenersReady` flag ensures event listeners are attached only once (not duplicated on year switch) |

---

## Running Locally

```bash
# Any static file server works. For example:
cd ITinDublin
python -m http.server 8765

# Then open http://localhost:8765
```

No `npm install` needed. No environment variables required (API key is embedded for the public government data).

---

## Adding a New Year

1. Get the new spreadsheet ID from the government data source
2. Add an entry to `YEARS_CONFIG` in `js/data.js`:
   ```js
   2027: {
       spreadsheetId: 'NEW_SPREADSHEET_ID_HERE',
       sheets: ['permits-to-companies', 'permits-by-sector', 'permits-by-nationality', 'permits-by-county']
   }
   ```
3. Optionally update `DEFAULT_YEAR` to the new year
4. The year button will appear automatically in the UI (generated from `AVAILABLE_YEARS`)

No other code changes needed — the flexible parser handles varying header formats automatically.

---

## Cache Busting

CSS and JS files are loaded with a `?v=N` query parameter in `index.html`. Bump the version number when deploying changes:

```html
<link rel="stylesheet" href="css/styles.css?v=4">
<script src="js/data.js?v=4"></script>
<script src="js/app.js?v=4"></script>
```
