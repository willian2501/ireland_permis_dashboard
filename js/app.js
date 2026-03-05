/**
 * Ireland Employment Permits Dashboard - Main Application
 * Handles tabs, filters, tables, charts, and all interactions
 */

(async function() {
    'use strict';

    // ========== State ==========
    let DATA = null;
    let currentYear = DataService.DEFAULT_YEAR;
    let listenersReady = false;
    const chartInstances = {};

    const STATE = {
        companies: { sortCol: 'total', sortDir: 'desc', page: 1, search: '', minPermits: 0, topN: 50, perPage: 50 },
        nationality: { sortCol: 'total', sortDir: 'desc', page: 1, search: '', topN: 25, perPage: 50 },
        sector: { sortCol: 'total', sortDir: 'desc', page: 1, search: '', topN: 25, perPage: 50 },
        county: { sortCol: 'total', sortDir: 'desc', page: 1, search: '', topN: 25, perPage: 50 }
    };

    // Map tab key to DATA property name
    const TAB_DATA_KEY = { sector: 'sectors', county: 'counties', nationality: 'nationalities' };
    function getTabData(tabKey) { return DATA[TAB_DATA_KEY[tabKey]]; }

    // ========== Color Palette ==========
    const COLORS = [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
        '#14b8a6', '#e11d48', '#a855f7', '#0ea5e9', '#eab308',
        '#d946ef', '#22d3ee', '#4ade80', '#fb923c', '#818cf8',
        '#2dd4bf', '#f43f5e', '#c084fc', '#38bdf8', '#facc15',
        '#a78bfa', '#34d399', '#fb7185', '#67e8f9', '#a3e635'
    ];

    function getColor(i) { return COLORS[i % COLORS.length]; }

    // ========== Initialization ==========
    try {
        DATA = await DataService.fetchAll(currentYear);
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('last-updated').textContent = 'Updated: ' + new Date().toLocaleDateString('en-IE');
        initAll();
    } catch (err) {
        console.error('Data fetch error:', err);
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('error-message').textContent = err.message;
        document.getElementById('error-overlay').classList.remove('hidden');
    }

    function initAll() {
        Chart.defaults.plugins.datalabels = { display: false };

        if (!listenersReady) {
            initTabs();
            initYearSelector();
            initCompaniesTab();
            initGenericTab('sector', 'Sector');
            initGenericTab('county', 'County');
            initGenericTab('nationality', 'Nationality');
            listenersReady = true;
        }

        refreshAll();
    }

    function refreshAll() {
        updateYearUI();
        updateCompaniesSlider();
        updateKPIs();
        renderCompanies();
        renderGeneric('sector', 'Sector');
        renderGeneric('county', 'County');
        renderGeneric('nationality', 'Nationality');
    }

    function updateYearUI() {
        document.querySelectorAll('.year-btn').forEach(b => {
            b.classList.toggle('active', parseInt(b.dataset.year) === currentYear);
        });
        document.getElementById('year-indicator').innerHTML = `Viewing: <strong>${currentYear}</strong> Data`;
        document.getElementById('year-badge').textContent = currentYear;
    }

    function updateCompaniesSlider() {
        const data = DATA.companies;
        const maxPermits = data.rows.length > 0 ? data.rows[0].total : 100;
        const slider = document.getElementById('companies-min-permits');
        slider.max = Math.min(maxPermits, 200);
    }

    function initYearSelector() {
        document.querySelectorAll('.year-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const year = parseInt(btn.dataset.year);
                if (year === currentYear) return;

                const allBtns = document.querySelectorAll('.year-btn');
                allBtns.forEach(b => { b.disabled = true; });
                document.getElementById('year-indicator').innerHTML = `Loading <strong>${year}</strong> data...`;

                try {
                    DATA = await DataService.fetchAll(year);
                    currentYear = year;
                    resetAllFilters();
                    refreshAll();
                } catch (err) {
                    console.error(`Failed to load ${year}:`, err);
                    document.getElementById('year-indicator').innerHTML =
                        `<span style="color:#ef4444">Failed to load ${year}.</span> Viewing: <strong>${currentYear}</strong>`;
                    allBtns.forEach(b => {
                        b.classList.toggle('active', parseInt(b.dataset.year) === currentYear);
                    });
                } finally {
                    allBtns.forEach(b => { b.disabled = false; });
                }
            });
        });
    }

    function resetAllFilters() {
        // Companies
        const cs = STATE.companies;
        cs.search = ''; cs.minPermits = 0; cs.topN = 50; cs.perPage = 50; cs.page = 1;
        cs.sortCol = 'total'; cs.sortDir = 'desc';
        document.getElementById('companies-search').value = '';
        document.getElementById('companies-min-permits').value = 0;
        document.getElementById('companies-min-permits-val').textContent = '0';
        document.getElementById('companies-top-n').value = '50';
        document.getElementById('companies-per-page').value = '50';
        resetSortHeaders('companies-table', 'total', 'desc');

        // Generic tabs
        ['sector', 'county', 'nationality'].forEach(tabKey => {
            const s = STATE[tabKey];
            s.search = ''; s.topN = 25; s.page = 1;
            s.sortCol = 'total'; s.sortDir = 'desc';
            document.getElementById(`${tabKey}-search`).value = '';
            document.getElementById(`${tabKey}-top-n`).value = '25';
            resetSortHeaders(`${tabKey}-table`, 'total', 'desc');
        });
    }

    // ========== KPIs ==========
    function updateKPIs() {
        const c = DATA.companies;
        const totalPermits = c.grandTotal.total || c.calculatedTotal || 0;
        const totalCompanies = c.rows.length;
        const avg = totalCompanies > 0 ? (totalPermits / totalCompanies).toFixed(1) : 0;
        const topCompany = c.rows.length > 0 ? c.rows[0].name : '—';

        animateValue('kpi-total-permits', totalPermits);
        animateValue('kpi-total-companies', totalCompanies);
        document.getElementById('kpi-avg-permits').textContent = avg;
        document.getElementById('kpi-top-company').textContent = truncate(topCompany, 28);
        document.getElementById('kpi-top-company').title = topCompany;
    }

    function animateValue(id, target) {
        const el = document.getElementById(id);
        const duration = 800;
        const start = performance.now();
        const from = 0;

        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
            const current = Math.floor(from + (target - from) * eased);
            el.textContent = current.toLocaleString();
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function truncate(str, len) {
        return str.length > len ? str.substring(0, len) + '...' : str;
    }

    // ========== Tabs ==========
    function initTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
            });
        });
    }

    // ========== COMPANIES TAB ==========
    function initCompaniesTab() {
        const s = STATE.companies;

        // Slider (max updated dynamically in updateCompaniesSlider)
        const slider = document.getElementById('companies-min-permits');

        // Event listeners
        document.getElementById('companies-search').addEventListener('input', debounce(e => {
            s.search = e.target.value.trim().toLowerCase();
            s.page = 1;
            renderCompanies();
        }, 250));

        slider.addEventListener('input', e => {
            s.minPermits = parseInt(e.target.value);
            document.getElementById('companies-min-permits-val').textContent = s.minPermits;
            s.page = 1;
            renderCompanies();
        });

        document.getElementById('companies-top-n').addEventListener('change', e => {
            s.topN = e.target.value === 'all' ? Infinity : parseInt(e.target.value);
            s.page = 1;
            renderCompanies();
        });

        document.getElementById('companies-per-page').addEventListener('change', e => {
            s.perPage = e.target.value === 'all' ? Infinity : parseInt(e.target.value);
            s.page = 1;
            renderCompanies();
        });

        document.getElementById('companies-reset').addEventListener('click', () => {
            s.search = ''; s.minPermits = 0; s.topN = 50; s.perPage = 50; s.page = 1;
            s.sortCol = 'total'; s.sortDir = 'desc';
            document.getElementById('companies-search').value = '';
            slider.value = 0;
            document.getElementById('companies-min-permits-val').textContent = '0';
            document.getElementById('companies-top-n').value = '50';
            document.getElementById('companies-per-page').value = '50';
            resetSortHeaders('companies-table', 'total', 'desc');
            renderCompanies();
        });

        // Sort headers
        initSortHeaders('companies-table', s, () => renderCompanies());

        // Export
        document.getElementById('companies-export').addEventListener('click', () => {
            const filtered = getFilteredCompanies();
            DataService.exportCSV(filtered, [
                { label: 'Rank', accessor: r => r.rank },
                { label: 'Company', accessor: r => r.name },
                { label: 'Total Permits', accessor: r => r.total },
                { label: '% of Total', accessor: r => r.pct.toFixed(2) + '%' },
                ...DataService.MONTHS.map(m => ({ label: m.charAt(0).toUpperCase() + m.slice(1), accessor: r => r.months[m] || 0 }))
            ], `ireland_permits_companies_${currentYear}.csv`);
        });
    }

    function getFilteredCompanies() {
        const s = STATE.companies;
        let rows = DATA.companies.rows.slice();

        // Search filter
        if (s.search) {
            rows = rows.filter(r => r.name.toLowerCase().includes(s.search));
        }

        // Min permits filter
        if (s.minPermits > 0) {
            rows = rows.filter(r => r.total >= s.minPermits);
        }

        // Sort
        sortRows(rows, s);

        // Re-rank after filtering
        rows.forEach((r, i) => r.filteredRank = i + 1);

        // Top N
        if (s.topN !== Infinity && s.topN < rows.length) {
            rows = rows.slice(0, s.topN);
        }

        return rows;
    }

    function renderCompanies() {
        const s = STATE.companies;
        const filtered = getFilteredCompanies();
        const grandTotal = DATA.companies.calculatedTotal || DATA.companies.grandTotal.total || 1;

        // Table
        const { pageRows, totalPages } = paginate(filtered, s.perPage, s.page);

        const tbody = document.getElementById('companies-tbody');
        if (pageRows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="16" class="no-data"><i class="fas fa-search"></i>No companies match your filters</td></tr>';
        } else {
            tbody.innerHTML = pageRows.map(r => {
                const pct = ((r.total / grandTotal) * 100).toFixed(2);
                const barW = Math.max(2, Math.min(80, (r.total / filtered[0].total) * 80));
                const name = s.search ? highlightMatch(r.name, s.search) : escapeHtml(r.name);
                return `<tr>
                    <td>${r.filteredRank}</td>
                    <td title="${escapeHtml(r.name)}">${name}</td>
                    <td>${r.total.toLocaleString()} <span class="permit-bar" style="width:${barW}px"></span></td>
                    <td>${pct}%</td>
                    ${DataService.MONTHS.map(m => `<td>${r.months[m] || ''}</td>`).join('')}
                </tr>`;
            }).join('');
        }

        document.getElementById('companies-showing').textContent =
            `Showing ${pageRows.length} of ${filtered.length} companies (${DATA.companies.rows.length} total)`;

        renderPagination('companies-pagination', totalPages, s, () => renderCompanies());

        // Charts
        renderCompaniesBarChart(filtered);
        renderCompaniesTrendChart(filtered);
    }

    function renderCompaniesBarChart(filtered) {
        const chartData = filtered.slice(0, 30); // Show at most 30 bars
        const subtitle = document.getElementById('companies-chart-subtitle');
        subtitle.textContent = `(showing ${chartData.length} of ${filtered.length})`;

        const ctx = document.getElementById('companies-chart');
        destroyChart('companies-chart');

        chartInstances['companies-chart'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.map(r => truncate(r.name, 25)),
                datasets: [{
                    label: 'Total Permits',
                    data: chartData.map(r => r.total),
                    backgroundColor: chartData.map((_, i) => getColor(i)),
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const idx = items[0].dataIndex;
                                return chartData[idx].name;
                            },
                            label: (item) => `Permits: ${item.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { 
                        grid: { color: '#f1f5f9' },
                        ticks: { font: { size: 11 } }
                    },
                    y: {
                        ticks: { font: { size: 10 } }
                    }
                }
            }
        });
    }

    function renderCompaniesTrendChart(filtered) {
        // Aggregate monthly data for filtered companies
        const monthlyTotals = DataService.MONTHS.map(m => {
            return filtered.reduce((sum, r) => sum + (r.months[m] || 0), 0);
        });

        const ctx = document.getElementById('companies-trend-chart');
        destroyChart('companies-trend-chart');

        chartInstances['companies-trend-chart'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: DataService.MONTH_LABELS,
                datasets: [{
                    label: 'Monthly Permits',
                    data: monthlyTotals,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#3b82f6',
                    borderWidth: 2.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (item) => `Permits: ${item.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: '#f1f5f9' } },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            callback: v => v.toLocaleString()
                        }
                    }
                }
            }
        });
    }

    // ========== GENERIC TAB (Nationality, Sector, County) ==========
    function initGenericTab(tabKey, labelSingular) {
        const s = STATE[tabKey];

        // Search
        document.getElementById(`${tabKey}-search`).addEventListener('input', debounce(e => {
            s.search = e.target.value.trim().toLowerCase();
            s.page = 1;
            renderGeneric(tabKey, labelSingular);
        }, 250));

        // Top N
        document.getElementById(`${tabKey}-top-n`).addEventListener('change', e => {
            s.topN = e.target.value === 'all' ? Infinity : parseInt(e.target.value);
            s.page = 1;
            renderGeneric(tabKey, labelSingular);
        });

        // Reset
        document.getElementById(`${tabKey}-reset`).addEventListener('click', () => {
            s.search = ''; s.topN = 25; s.page = 1;
            s.sortCol = 'total'; s.sortDir = 'desc';
            document.getElementById(`${tabKey}-search`).value = '';
            document.getElementById(`${tabKey}-top-n`).value = '25';
            resetSortHeaders(`${tabKey}-table`, 'total', 'desc');
            renderGeneric(tabKey, labelSingular);
        });

        // Sort headers
        initSortHeaders(`${tabKey}-table`, s, () => renderGeneric(tabKey, labelSingular));

        // Export
        document.getElementById(`${tabKey}-export`).addEventListener('click', () => {
            const filtered = getFilteredGeneric(tabKey);
            const hasMonths = (tabKey !== 'county' && tabKey !== 'nationality');
            const columns = [
                { label: 'Rank', accessor: r => r.filteredRank },
                { label: labelSingular, accessor: r => r.name },
                { label: 'Total Permits', accessor: r => r.total },
                { label: '% Share', accessor: r => r.pct.toFixed(2) + '%' },
                ...(hasMonths ? DataService.MONTHS.map(m => ({ label: m.charAt(0).toUpperCase() + m.slice(1), accessor: r => r.months[m] || 0 })) : [])
            ];
            DataService.exportCSV(filtered, columns, `ireland_permits_${tabKey}_${currentYear}.csv`);
        });
    }

    function getFilteredGeneric(tabKey) {
        const data = getTabData(tabKey);
        const s = STATE[tabKey];
        let rows = data.rows.slice();

        if (s.search) {
            rows = rows.filter(r => r.name.toLowerCase().includes(s.search));
        }

        sortRows(rows, s);
        rows.forEach((r, i) => r.filteredRank = i + 1);

        if (s.topN !== Infinity && s.topN < rows.length) {
            rows = rows.slice(0, s.topN);
        }

        return rows;
    }

    function renderGeneric(tabKey, labelSingular) {
        const data = getTabData(tabKey);
        const s = STATE[tabKey];
        const filtered = getFilteredGeneric(tabKey);
        const grandTotal = data.calculatedTotal || data.grandTotal.total || 1;

        // Table
        const { pageRows, totalPages } = paginate(filtered, 50, s.page);

        const showMonths = (tabKey !== 'county' && tabKey !== 'nationality');
        const colSpan = showMonths ? 16 : 4;

        const tbody = document.getElementById(`${tabKey}-tbody`);
        if (pageRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${colSpan}" class="no-data"><i class="fas fa-search"></i>No ${labelSingular.toLowerCase()}s match your filters</td></tr>`;
        } else {
            tbody.innerHTML = pageRows.map(r => {
                const pct = ((r.total / grandTotal) * 100).toFixed(2);
                const barW = Math.max(2, Math.min(80, (r.total / filtered[0].total) * 80));
                const name = s.search ? highlightMatch(r.name, s.search) : escapeHtml(r.name);
                return `<tr>
                    <td>${r.filteredRank}</td>
                    <td title="${escapeHtml(r.name)}">${name}</td>
                    <td>${r.total.toLocaleString()} <span class="permit-bar" style="width:${barW}px"></span></td>
                    <td>${pct}%</td>
                    ${showMonths ? DataService.MONTHS.map(m => `<td>${r.months[m] || ''}</td>`).join('') : ''}
                </tr>`;
            }).join('');
        }

        document.getElementById(`${tabKey}-showing`).textContent =
            `Showing ${pageRows.length} of ${filtered.length} ${labelSingular.toLowerCase()}s (${data.rows.length} total)`;

        renderPagination(`${tabKey}-pagination`, totalPages, s, () => renderGeneric(tabKey, labelSingular));

        // Bar chart
        renderGenericBarChart(tabKey, filtered, labelSingular);

        // Pie chart
        renderGenericPieChart(tabKey, filtered, labelSingular);
    }

    function renderGenericBarChart(tabKey, filtered, label) {
        const chartData = filtered.slice(0, 20);
        const ctx = document.getElementById(`${tabKey}-chart`);
        destroyChart(`${tabKey}-chart`);

        chartInstances[`${tabKey}-chart`] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: chartData.map(r => truncate(r.name, 22)),
                datasets: [{
                    label: 'Total Permits',
                    data: chartData.map(r => r.total),
                    backgroundColor: chartData.map((_, i) => getColor(i)),
                    borderRadius: 4,
                    borderSkipped: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            title: (items) => chartData[items[0].dataIndex].name,
                            label: (item) => `Permits: ${item.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    x: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 11 } } },
                    y: { ticks: { font: { size: 10 } } }
                }
            }
        });
    }

    function renderGenericPieChart(tabKey, filtered, label) {
        const top = filtered.slice(0, 10);
        const otherTotal = filtered.slice(10).reduce((s, r) => s + r.total, 0);
        const labels = top.map(r => truncate(r.name, 20));
        const values = top.map(r => r.total);
        if (otherTotal > 0) {
            labels.push('Others');
            values.push(otherTotal);
        }

        const ctx = document.getElementById(`${tabKey}-pie-chart`);
        destroyChart(`${tabKey}-pie-chart`);

        const totalSum = values.reduce((s, v) => s + v, 0);

        chartInstances[`${tabKey}-pie-chart`] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: labels.map((_, i) => getColor(i)),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            plugins: [ChartDataLabels],
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { font: { size: 11 }, padding: 8, usePointStyle: true, pointStyleWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (item) => {
                                const total = item.dataset.data.reduce((s, v) => s + v, 0);
                                const pct = ((item.raw / total) * 100).toFixed(1);
                                return `${item.label}: ${item.raw.toLocaleString()} (${pct}%)`;
                            }
                        }
                    },
                    datalabels: {
                        display: (context) => {
                            const pct = (context.dataset.data[context.dataIndex] / totalSum) * 100;
                            return pct >= 3; // Only show label if >= 3%
                        },
                        color: '#fff',
                        font: { weight: '600', size: 11 },
                        formatter: (value) => {
                            const pct = ((value / totalSum) * 100).toFixed(1);
                            return pct + '%';
                        },
                        textStrokeColor: 'rgba(0,0,0,0.3)',
                        textStrokeWidth: 2
                    }
                }
            }
        });
    }

    // ========== Utility Functions ==========

    function sortRows(rows, state) {
        const col = state.sortCol;
        const dir = state.sortDir === 'asc' ? 1 : -1;

        rows.sort((a, b) => {
            let va, vb;
            if (col === 'name') {
                va = a.name.toLowerCase();
                vb = b.name.toLowerCase();
                return va < vb ? -dir : va > vb ? dir : 0;
            } else if (col === 'total') {
                return (a.total - b.total) * dir;
            } else if (col === 'pct') {
                return (a.pct - b.pct) * dir;
            } else if (col === 'rank') {
                return (a.rank - b.rank) * dir;
            } else if (DataService.MONTHS.includes(col)) {
                va = a.months[col] || 0;
                vb = b.months[col] || 0;
                return (va - vb) * dir;
            }
            return 0;
        });
    }

    function initSortHeaders(tableId, state, renderFn) {
        const table = document.getElementById(tableId);
        table.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const col = th.dataset.sort;
                if (state.sortCol === col) {
                    state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
                } else {
                    state.sortCol = col;
                    state.sortDir = 'desc';
                }
                state.page = 1;

                // Update header classes
                table.querySelectorAll('th.sortable').forEach(h => {
                    h.classList.remove('sorted-asc', 'sorted-desc');
                });
                th.classList.add(state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');

                renderFn();
            });
        });
    }

    function resetSortHeaders(tableId, defaultCol, defaultDir) {
        const table = document.getElementById(tableId);
        table.querySelectorAll('th.sortable').forEach(h => {
            h.classList.remove('sorted-asc', 'sorted-desc');
            if (h.dataset.sort === defaultCol) {
                h.classList.add(defaultDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });
    }

    function paginate(rows, perPage, page) {
        if (perPage === Infinity || perPage >= rows.length) {
            return { pageRows: rows, totalPages: 1 };
        }
        const totalPages = Math.ceil(rows.length / perPage);
        const safePage = Math.min(page, totalPages || 1);
        const start = (safePage - 1) * perPage;
        return {
            pageRows: rows.slice(start, start + perPage),
            totalPages
        };
    }

    function renderPagination(containerId, totalPages, state, renderFn) {
        const container = document.getElementById(containerId);
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button ${state.page <= 1 ? 'disabled' : ''} data-page="${state.page - 1}">&#8249; Prev</button>`;

        const maxButtons = 7;
        let startPage = Math.max(1, state.page - Math.floor(maxButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxButtons - 1);
        if (endPage - startPage < maxButtons - 1) {
            startPage = Math.max(1, endPage - maxButtons + 1);
        }

        if (startPage > 1) {
            html += `<button data-page="1">1</button>`;
            if (startPage > 2) html += `<button disabled>...</button>`;
        }

        for (let p = startPage; p <= endPage; p++) {
            html += `<button data-page="${p}" class="${p === state.page ? 'active' : ''}">${p}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += `<button disabled>...</button>`;
            html += `<button data-page="${totalPages}">${totalPages}</button>`;
        }

        html += `<button ${state.page >= totalPages ? 'disabled' : ''} data-page="${state.page + 1}">Next &#8250;</button>`;

        container.innerHTML = html;

        container.querySelectorAll('button[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                state.page = parseInt(btn.dataset.page);
                renderFn();
                // Scroll table into view
                container.closest('.table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    function destroyChart(key) {
        if (chartInstances[key]) {
            chartInstances[key].destroy();
            delete chartInstances[key];
        }
    }

    function debounce(fn, ms) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function highlightMatch(text, query) {
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

})();
