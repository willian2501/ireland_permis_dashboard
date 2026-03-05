/**
 * Ireland Employment Permits Dashboard - Data Service
 * Fetches and processes data from Google Sheets API
 */

const DataService = (() => {
    const API_KEY = 'AIzaSyCVYfHKiIvbt_MkVC00FygLLwDBJP8ty84';

    const YEARS_CONFIG = {
        2024: {
            spreadsheetId: '13rRnMJ-nR95UWm4MOC3XUCxcnu2QHkbI29a4Kso6GUw',
            sheets: ['permits-to-companies', 'permits-by-sector', 'permits-by-nationality', 'permits-by-county']
        },
        2025: {
            spreadsheetId: '1TSCiQsMa6FrUhYJtCj3-YoP8dO0Z68OMEJehI2F8oWU',
            sheets: ['permits-to-companies', 'permits-by-sector', 'permits-by-nationality', 'permits-by-county']
        },
        2026: {
            spreadsheetId: '1RygxbPr7yR_3GhIjwTXqAikr86N1JOivZmQn6lMCbkQ',
            sheets: ['permits-to-companies', 'permits-by-sector', 'permits-by-nationality', 'permits-by-county']
        }
    };

    const AVAILABLE_YEARS = Object.keys(YEARS_CONFIG).map(Number).sort((a, b) => b - a);
    const DEFAULT_YEAR = 2026;

    const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const MONTH_ABBR = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

    /**
     * Try to match a header string to a month index (0-11).
     * Handles: "January", "Jan", "Permits Issued Jan", "JAN-24", etc.
     * Returns -1 if no match.
     */
    function matchMonth(header) {
        const h = (header || '').trim().toLowerCase();
        if (!h) return -1;
        // Exact full name match
        const fullIdx = MONTH_LABELS.findIndex(m => m.toLowerCase() === h);
        if (fullIdx !== -1) return fullIdx;
        // Exact abbreviation match (3-letter)
        const abbrIdx = MONTH_ABBR.findIndex(m => m === h);
        if (abbrIdx !== -1) return abbrIdx;
        // Contains a month abbreviation as a whole word (e.g. "Permits Issued Jan", "Jan-24")
        for (let i = 0; i < MONTH_ABBR.length; i++) {
            const re = new RegExp('\\b' + MONTH_ABBR[i] + '\\b', 'i');
            if (re.test(h) && !h.includes('grand total') && !h.includes('total')) {
                return i;
            }
        }
        return -1;
    }

    /**
     * Fetch all sheets data from Google Sheets API
     */
    async function fetchAll(year) {
        const config = YEARS_CONFIG[year || DEFAULT_YEAR];
        if (!config) throw new Error(`No data configuration for year ${year}`);
        const ranges = config.sheets.map(s => `ranges=${s}`).join('&');
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${config.spreadsheetId}/values:batchGet?${ranges}&key=${API_KEY}`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        const json = await response.json();
        if (!json.valueRanges || json.valueRanges.length < 4) {
            throw new Error('Incomplete data received from API');
        }

        return {
            companies: parseSheet(json.valueRanges[0].values, 'company'),
            sectors: parseSheet(json.valueRanges[1].values, 'sector'),
            nationalities: parseSheet(json.valueRanges[2].values, 'nationality'),
            counties: parseSheet(json.valueRanges[3].values, 'county')
        };
    }

    /**
     * Parse a sheet's raw values into structured data
     * Row 0: headers (blank, January, February, ..., December, Grand Total)
     * Row 1: Grand Total row
     * Row 2+: Data rows
     */
    function parseSheet(values, type) {
        if (!values || values.length < 2) return { headers: [], grandTotal: {}, rows: [] };

        const headers = values[0];

        // Find column indices for months and total
        // Check both row 0 (headers) and row 1 (sometimes has sub-headers with "Grand Total")
        const monthIndices = [];
        const monthNames = [];
        let totalIndex = -1;

        for (let i = 1; i < headers.length; i++) {
            const h = (headers[i] || '').trim().toLowerCase();
            const mIdx = matchMonth(headers[i]);
            if (mIdx !== -1) {
                monthIndices.push(i);
                monthNames.push(MONTHS[mIdx]);
            }
            if (h.includes('grand total') || h === 'total') {
                totalIndex = i;
            }
        }

        // If Grand Total not found in row 0, check row 1 for the label
        if (totalIndex === -1 && values.length > 1) {
            const row1 = values[1];
            for (let i = 1; i < (row1 || []).length; i++) {
                const h = (row1[i] || '').trim().toLowerCase();
                if (h.includes('grand total') || h === 'total') {
                    totalIndex = i;
                    break;
                }
            }
        }

        // If still no Grand Total/Total column and no months found,
        // look for "Issued" column (nationality/county tabs)
        if (totalIndex === -1 && monthIndices.length === 0) {
            for (let i = 1; i < headers.length; i++) {
                const h = (headers[i] || '').trim().toLowerCase();
                if (h === 'issued') {
                    totalIndex = i;
                    break;
                }
            }
            // Also check row 1 for "Issued" header
            if (totalIndex === -1 && values.length > 1) {
                const row1 = values[1];
                for (let i = 1; i < (row1 || []).length; i++) {
                    const h = (row1[i] || '').trim().toLowerCase();
                    if (h === 'issued') {
                        totalIndex = i;
                        break;
                    }
                }
            }
        }

        // Final fallback: last column
        if (totalIndex === -1) {
            totalIndex = headers.length - 1;
        }

        // Determine where headers end and data begins.
        // Some sheets have 1 header row, others have 2 (e.g. 2024 sector).
        // Some have a Grand Total summary row, others don't.
        // Strategy: scan rows to find first data-start index and optional Grand Total row.
        let dataStartRow = 1;
        let grandTotalRowIdx = -1;

        for (let r = 1; r < Math.min(values.length, 5); r++) {
            const row = values[r];
            if (!row || !row[0]) continue;
            const name = cleanName(row[0]).toLowerCase();
            const firstCellLower = name;

            // Check if this is a Grand Total summary row
            if (firstCellLower === 'grand total' || firstCellLower.startsWith('grand total')) {
                grandTotalRowIdx = r;
                continue;
            }

            // Check if this looks like a sub-header row (no numeric data)
            const hasNumericData = row.slice(1).some(v => {
                const n = parseNum(v);
                return n > 0;
            });
            const looksLikeHeader = !hasNumericData ||
                ['economic sector', 'nationality', 'county', 'employer name'].some(h => firstCellLower.includes(h));

            if (looksLikeHeader && hasNumericData === false) {
                // Skip sub-header rows
                continue;
            }

            // This is the first real data row
            if (grandTotalRowIdx === -1 && dataStartRow === 1) {
                dataStartRow = r;
            }
            break;
        }

        // If we found a Grand Total row, data starts after it (or after the last header row)
        if (grandTotalRowIdx !== -1) {
            dataStartRow = grandTotalRowIdx + 1;
        }

        // Parse Grand Total row if found
        const grandTotal = { name: 'Grand Total', months: {}, total: 0 };
        if (grandTotalRowIdx !== -1) {
            const gtRow = values[grandTotalRowIdx];
            grandTotal.total = parseNum(gtRow[totalIndex]);
            monthIndices.forEach((ci, mi) => {
                grandTotal.months[monthNames[mi]] = parseNum(gtRow[ci]);
            });
        }

        // Parse all data rows
        const rows = [];
        for (let r = dataStartRow; r < values.length; r++) {
            const row = values[r];
            if (!row || !row[0]) continue;

            const name = cleanName(row[0]);
            if (!name || isHeaderRow(name)) continue;

            const entry = {
                name: name,
                months: {},
                total: parseNum(row[totalIndex])
            };

            monthIndices.forEach((ci, mi) => {
                entry.months[monthNames[mi]] = parseNum(row[ci]);
            });

            // Calculate total from months if total is 0 or missing
            if (entry.total === 0) {
                entry.total = Object.values(entry.months).reduce((s, v) => s + v, 0);
            }

            // Only include rows with at least 1 permit
            if (entry.total > 0) {
                rows.push(entry);
            }
        }

        // Sort by total descending
        rows.sort((a, b) => b.total - a.total);

        // Always calculate total from actual data rows for accuracy
        const calculatedTotal = rows.reduce((s, r) => s + r.total, 0);
        // Use the larger of grandTotal row vs calculated total (avoid stale/partial header row)
        grandTotal.total = Math.max(grandTotal.total, calculatedTotal) || calculatedTotal;

        // Add rank and percentage using calculated total
        rows.forEach((row, idx) => {
            row.rank = idx + 1;
            row.pct = calculatedTotal > 0 ? ((row.total / calculatedTotal) * 100) : 0;
        });

        return {
            headers: monthNames,
            grandTotal,
            rows,
            calculatedTotal
        };
    }

    /**
     * Clean and standardize a name
     */
    function cleanName(name) {
        if (!name) return '';
        return name
            .toString()
            .trim()
            .replace(/\s+/g, ' ')           // normalize whitespace
            .replace(/^\s+|\s+$/g, '');       // trim
    }

    /**
     * Check if a row name looks like a header/summary row to skip
     */
    function isHeaderRow(name) {
        const lower = name.toLowerCase();
        return lower === 'grand total' ||
               lower === 'total' ||
               lower.startsWith('grand total');
    }

    /**
     * Parse a value to number, handling various formats
     */
    function parseNum(val) {
        if (val === undefined || val === null || val === '') return 0;
        const cleaned = val.toString().replace(/,/g, '').trim();
        const num = parseInt(cleaned, 10);
        return isNaN(num) ? 0 : num;
    }

    /**
     * Export data rows as CSV
     */
    function exportCSV(dataRows, columns, filename) {
        const header = columns.map(c => c.label).join(',');
        const csvRows = dataRows.map(row => {
            return columns.map(c => {
                const val = c.accessor(row);
                // Escape commas and quotes
                const str = String(val);
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return '"' + str.replace(/"/g, '""') + '"';
                }
                return str;
            }).join(',');
        });

        const csv = [header, ...csvRows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    }

    return {
        fetchAll,
        exportCSV,
        MONTHS,
        MONTH_LABELS,
        AVAILABLE_YEARS,
        DEFAULT_YEAR
    };
})();
