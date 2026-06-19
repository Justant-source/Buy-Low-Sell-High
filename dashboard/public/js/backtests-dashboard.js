(function () {
  const ui = window.SOXLDashboard;
  const MAX_STRATEGY_SELECTION = 6;
  const STRATEGY_COLORS = ["#d78a4b", "#2f7ed8", "#2fb344", "#d63939", "#7b5cff", "#1f9d8b"];
  const SWEEP_PARETO_LABELS = {
    all: "all",
    return_mdd: "return / MDD",
    return_stability: "return / stability",
  };
  const state = {
    latestRun: null,
    profiles: [],
    dataStatus: null,
    mentorMatrix: null,
    strategyExplorer: null,
    selectedStrategyIds: [],
    selectedStrategyPresetId: "all",
    sweepArtifact: null,
  };

  function profilePathToLabel(profile) {
    return `${profile.profileId} · ${profile.threadCount}T/${profile.stopSessions}S`;
  }

  function selectedProfile() {
    return state.profiles.find((profile) => profile.profileId === document.getElementById("profile-select").value) || null;
  }

  function selectedProfileId() {
    return document.getElementById("profile-select").value;
  }

  function syncControlsFromProfile(profile) {
    if (!profile) {
      return;
    }
    document.getElementById("thread-count").value = String(profile.threadCount);
    document.getElementById("stop-sessions").value = String(profile.stopSessions);
    document.getElementById("price-basis").value = profile.priceBasis || "adjusted_close";
    document.getElementById("sizing-mode").value = "fixed_principal";
    document.getElementById("take-profit-pct").value = "0";
    document.getElementById("take-profit-operator").value = "gt";
    document.getElementById("stop-loss-pct").value = "0";
    document.getElementById("entry-drop-pct").value = "0";
    document.getElementById("max-entries-per-session").value = "1";
  }

  function numericValue(id, fallback) {
    const value = Number(document.getElementById(id).value);
    return Number.isFinite(value) ? value : fallback;
  }

  function collectOverrides() {
    return {
      threadCount: numericValue("thread-count", 7),
      stopSessions: numericValue("stop-sessions", 30),
      takeProfitPct: numericValue("take-profit-pct", 0),
      takeProfitOperator: document.getElementById("take-profit-operator").value || "gt",
      entryDropPct: numericValue("entry-drop-pct", 0),
      stopLossPct: numericValue("stop-loss-pct", 0),
      maxEntriesPerSession: numericValue("max-entries-per-session", 1),
      sizingMode: document.getElementById("sizing-mode").value || "fixed_principal",
      priceBasis: document.getElementById("price-basis").value || "adjusted_close",
    };
  }

  function setEmptyChart(id, message) {
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    target.innerHTML = `<div class="empty-state">${ui.escapeHtml(message)}</div>`;
  }

  function chartLayoutBase() {
    return {
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      margin: { t: 12, r: 16, b: 36, l: 56 },
      font: {
        family: "Inter, sans-serif",
        color: getComputedStyle(document.documentElement).getPropertyValue("--text").trim(),
      },
      xaxis: { gridcolor: getComputedStyle(document.documentElement).getPropertyValue("--border").trim() },
      yaxis: { gridcolor: getComputedStyle(document.documentElement).getPropertyValue("--border").trim() },
      legend: { orientation: "h", y: -0.2 },
    };
  }

  function parseMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function formatSessionPeriod(start, end) {
    if (!start || !end) {
      return "-";
    }
    return `${start} → ${end}`;
  }

  function populateProfiles(payload) {
    state.profiles = payload.profiles || [];
    const select = document.getElementById("profile-select");
    select.innerHTML = state.profiles
      .map((profile) => `<option value="${ui.escapeHtml(profile.profileId)}">${ui.escapeHtml(profilePathToLabel(profile))}</option>`)
      .join("");
    select.value = payload.defaultProfileId || "mentor_default_7x30";
    syncControlsFromProfile(selectedProfile());
    document.getElementById("sb-profile").textContent = select.value;
  }

  function renderDataStatus(status) {
    state.dataStatus = status;
    ui.setText("hero-rows", ui.formatNumber(status.rows));
    ui.setText("hero-period", `${status.start} - ${status.end}`);
    ui.setText("hero-hash", ui.shortHash(status.data_hash));
    ui.setText("sb-range", `${status.start} - ${status.end}`);
  }

  function renderJob(job) {
    ui.setText("job-id", job.jobId || "-");
    ui.setText("job-status", job.status || "-");
    ui.setText("job-progress", `${job.progress || 0}%`);
    ui.setText("job-run-id", job.runId || "-");
    ui.setText("job-requested", ui.formatDateTime(job.requestedAt));
    ui.setText("job-finished", ui.formatDateTime(job.finishedAt));
    const errorBox = document.getElementById("job-error");
    if (job.error) {
      errorBox.textContent = job.error;
      errorBox.classList.add("visible");
    } else {
      errorBox.textContent = "";
      errorBox.classList.remove("visible");
    }
  }

  function renderYearly(yearly) {
    const tbody = document.getElementById("yearly-tbody");
    const years = Object.keys(yearly || {}).sort();
    if (!years.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center">결과 없음</td></tr>';
      return;
    }
    tbody.innerHTML = years
      .map((year) => {
        const row = yearly[year];
        return `<tr>
          <td>${ui.escapeHtml(year)}</td>
          <td class="num">${ui.escapeHtml(row.start_equity)}</td>
          <td class="num">${ui.escapeHtml(row.end_equity)}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.return_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.mdd_pct))}</td>
          <td class="num">${ui.escapeHtml(String(row.take_profit_count))}</td>
          <td class="num">${ui.escapeHtml(String(row.time_stop_count))}</td>
        </tr>`;
      })
      .join("");
  }

  function renderRunCharts(run) {
    if (!window.Plotly || !run || !run.daily || !run.daily.length) {
      return;
    }
    const x = run.daily.map((point) => point.session_date);
    const equity = run.daily.map((point) => Number(point.total_equity));
    const drawdown = run.daily.map((point) => Number(point.drawdown) * 100);
    const commonLayout = chartLayoutBase();
    window.Plotly.newPlot(
      "equity-chart",
      [{ x, y: equity, type: "scatter", mode: "lines", line: { color: "#d78a4b", width: 2.5 } }],
      { ...commonLayout, yaxis: { ...commonLayout.yaxis, tickprefix: "$" } },
      { displayModeBar: false, responsive: true },
    );
    window.Plotly.newPlot(
      "drawdown-chart",
      [{ x, y: drawdown, type: "scatter", mode: "lines", line: { color: "#d63939", width: 2.2 } }],
      { ...commonLayout, yaxis: { ...commonLayout.yaxis, ticksuffix: "%" } },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderRunArtifact(artifact) {
    if (!artifact || !artifact.payload) {
      return;
    }
    state.latestRun = artifact;
    const run = artifact.payload;
    ui.setText("kpi-return", ui.formatPercent(run.metrics.total_return_pct));
    ui.setText("kpi-mdd", ui.formatPercent(run.metrics.max_drawdown_pct));
    ui.setText("kpi-trades", ui.formatNumber(run.metrics.trade_count));
    ui.setText("kpi-volatility", ui.formatPercent(run.metrics.volatility_pct));
    ui.setText("kpi-config", ui.shortHash(run.config_hash));
    ui.setText("kpi-commit", ui.shortHash(run.code_commit));
    ui.setText("sb-model", String(run.config.execution_model || "-"));
    document.getElementById("trades-download").href = `/api/backtests/runs/${encodeURIComponent(artifact.runId)}/trades.csv`;
    renderYearly(run.yearly);
    renderRunCharts(run);
  }

  function renderCompare(payload) {
    const head = document.getElementById("compare-head");
    const body = document.getElementById("compare-body");
    const stops = payload.stopSessions || [];
    const threads = payload.threadCounts || [];
    head.innerHTML = `<tr><th>Thread \\ Stop</th>${stops.map((stop) => `<th>${stop}</th>`).join("")}</tr>`;
    const cellMap = new Map(payload.cells.map((cell) => [`${cell.thread_count}:${cell.stop_sessions}`, cell]));
    body.innerHTML = threads
      .map((threadCount) => {
        const columns = stops
          .map((stopSessions) => {
            const cell = cellMap.get(`${threadCount}:${stopSessions}`);
            if (!cell) {
              return '<td class="muted">-</td>';
            }
            return `<td>
              <strong>${ui.escapeHtml(ui.formatPercent(cell.total_return_pct))}</strong>
              <small>MDD ${ui.escapeHtml(ui.formatPercent(cell.max_drawdown_pct))}</small>
              <small>Trades ${ui.escapeHtml(ui.formatNumber(cell.trade_count))}</small>
            </td>`;
          })
          .join("");
        return `<tr><td class="mono">${threadCount}</td>${columns}</tr>`;
      })
      .join("");
  }

  function matrixPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    if (Math.abs(number) >= 1e9) {
      return `${number.toExponential(2)}%`;
    }
    return `${number.toLocaleString("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  }

  function comboOrder(combos) {
    return Object.keys(combos || {}).sort((left, right) => {
      const [leftThreads, leftStops] = left.split("x").map(Number);
      const [rightThreads, rightStops] = right.split("x").map(Number);
      if (leftThreads !== rightThreads) {
        return leftThreads - rightThreads;
      }
      return leftStops - rightStops;
    });
  }

  function mentorBadgeClass(status) {
    if (status === "PASS") {
      return "badge success";
    }
    if (status === "DATA_MISMATCH") {
      return "badge warning";
    }
    return "badge danger";
  }

  function renderMentorMatrix(payload) {
    state.mentorMatrix = payload;
    const actual = payload.actual;
    const comboKeys = comboOrder(actual.combos);
    const body = document.getElementById("mentor-matrix-body");
    const badge = document.getElementById("mentor-matrix-status");
    const hash = document.getElementById("mentor-matrix-hash");
    const note = document.getElementById("mentor-matrix-note");
    badge.className = mentorBadgeClass(payload.parity.status);
    badge.textContent = payload.parity.status;
    hash.textContent = ui.shortHash(payload.meta.data_hash);
    if (payload.parity.first_mismatch) {
      const mismatch = payload.parity.first_mismatch;
      note.textContent = `현재 표는 실제 백테스트 값입니다. 참고용 멘토 전사값과의 첫 차이: ${mismatch.section} · ${mismatch.row} · ${mismatch.column} · mentor ${mismatch.expected} / actual ${mismatch.actual}`;
    } else {
      note.textContent = "현재 표는 실제 백테스트 값이며, 참고용 멘토 전사값과 현재 기준에서 정렬되어 있습니다.";
    }

    const header = `<tr>
      <th class="sticky-1">연도</th>
      <th class="sticky-2 benchmark-col">연간 주가 변화</th>
      <th class="sticky-3 benchmark-col">물빵</th>
      ${comboKeys
        .map((comboKey) => {
          const representative = comboKey === "5x40" ? " representative-col" : "";
          return `<th class="num${representative}">${comboKey.replace("x", "/")}</th>`;
        })
        .join("")}
    </tr>`;

    const benchmarkRows = actual.benchmark.yearly;
    const yearlyRows = benchmarkRows
      .map((benchmarkRow) => {
        const values = comboKeys.map((comboKey) => Number(actual.combos[comboKey].yearly_returns_pct[String(benchmarkRow.year)]));
        const maxValue = Math.max(...values);
        const comboColumns = comboKeys
          .map((comboKey) => {
            const value = Number(actual.combos[comboKey].yearly_returns_pct[String(benchmarkRow.year)]);
            const representative = comboKey === "5x40" ? " representative-col" : "";
            const highlight = value === maxValue ? " max-cell" : "";
            return `<td class="num${representative}${highlight}">${ui.escapeHtml(matrixPercent(value))}</td>`;
          })
          .join("");
        return `<tr>
          <td class="sticky-1 mono">${benchmarkRow.year}</td>
          <td class="sticky-2 benchmark-col mono">${ui.escapeHtml(benchmarkRow.price_change)}</td>
          <td class="sticky-3 benchmark-col num">${ui.escapeHtml(matrixPercent(benchmarkRow.return_pct))}</td>
          ${comboColumns}
        </tr>`;
      })
      .join("");

    const aggregateRows = [
      { label: "표준편차", family: "per-year", benchmark: "", comboSection: "stats_pct", comboField: "stddev" },
      { label: "전체평균", family: "2011-24", benchmark: "", comboSection: "stats_pct", comboField: "avg_all" },
      { label: "평균5년", family: "2020-24", benchmark: actual.benchmark.aggregate_rows.average_5y, comboSection: "stats_pct", comboField: "avg_5y" },
      { label: "단리전체", family: "2011-24", benchmark: "", comboSection: "simple_returns_pct", comboField: "total" },
      { label: "단리5년", family: "2020-24", benchmark: actual.benchmark.aggregate_rows.simple_5y, comboSection: "simple_returns_pct", comboField: "y5" },
      { label: "단리3년", family: "2022-24", benchmark: "", comboSection: "simple_returns_pct", comboField: "y3" },
      { label: "복리전체", family: "2011-24", benchmark: actual.benchmark.aggregate_rows.compound_total, comboSection: "compound_returns_pct", comboField: "total" },
      { label: "복리5년", family: "2020-24", benchmark: actual.benchmark.aggregate_rows.compound_5y, comboSection: "compound_returns_pct", comboField: "y5" },
      { label: "복리3년", family: "2022-24", benchmark: actual.benchmark.aggregate_rows.compound_3y, comboSection: "compound_returns_pct", comboField: "y3" },
      { label: "복리1년", family: "2024", benchmark: actual.benchmark.aggregate_rows.compound_1y, comboSection: "compound_returns_pct", comboField: "y1" },
    ]
      .map((row) => {
        const comboColumns = comboKeys
          .map((comboKey) => {
            const representative = comboKey === "5x40" ? " representative-col" : "";
            const value = actual.combos[comboKey][row.comboSection][row.comboField];
            return `<td class="num${representative}">${ui.escapeHtml(matrixPercent(value))}</td>`;
          })
          .join("");
        const benchmarkValue = row.benchmark === "" || row.benchmark == null ? "-" : matrixPercent(row.benchmark);
        return `<tr>
          <td class="sticky-1 aggregate-label">${ui.escapeHtml(row.label)}</td>
          <td class="sticky-2 aggregate-label">${ui.escapeHtml(row.family)}</td>
          <td class="sticky-3 benchmark-col num">${ui.escapeHtml(benchmarkValue)}</td>
          ${comboColumns}
        </tr>`;
      })
      .join("");

    body.innerHTML = `${header}${yearlyRows}<tr class="section-row"><td colspan="${3 + comboKeys.length}">aggregate rows</td></tr>${aggregateRows}`;
  }

  function countPair(cell) {
    return `${ui.formatNumber(cell.take_profit)} / ${ui.formatNumber(cell.time_stop)}`;
  }

  function renderMentorCounts(payload) {
    const actual = payload.actual;
    const body = document.getElementById("mentor-counts-body");
    const comboKeys = ["5x30", "6x10", "6x30", "7x30"].filter((comboKey) => actual.selected_count_combos[comboKey]);
    const years = Object.keys(actual.selected_count_combos[comboKeys[0]]?.yearly_counts || {});
    const header = `<tr>
      <th class="sticky-1">행</th>
      <th class="sticky-2">구분</th>
      ${comboKeys.map((comboKey) => `<th class="num">${comboKey.replace("x", "/")}</th>`).join("")}
    </tr>`;
    const yearlyRows = years
      .map((year) => `<tr>
        <td class="sticky-1 mono">${ui.escapeHtml(year)}</td>
        <td class="sticky-2">익절 / 손절</td>
        ${comboKeys
          .map((comboKey) => `<td class="pair-cell">${ui.escapeHtml(countPair(actual.selected_count_combos[comboKey].yearly_counts[year]))}</td>`)
          .join("")}
      </tr>`)
      .join("");
    const aggregateOrder = [
      ["전체평균", "avg_all"],
      ["평균5년", "avg_5y"],
      ["단리전체", "simple_total"],
      ["단리5년", "simple_y5"],
      ["단리3년", "simple_y3"],
      ["복리전체", "compound_total"],
      ["복리5년", "compound_y5"],
      ["복리3년", "compound_y3"],
      ["복리1년", "compound_y1"],
    ];
    const aggregateRows = aggregateOrder
      .map(
        ([label, key]) => `<tr>
          <td class="sticky-1 aggregate-label">${ui.escapeHtml(label)}</td>
          <td class="sticky-2">익절 / 손절</td>
          ${comboKeys
            .map((comboKey) => `<td class="pair-cell">${ui.escapeHtml(countPair(actual.selected_count_combos[comboKey].aggregate_rows[key]))}</td>`)
            .join("")}
        </tr>`,
      )
      .join("");
    body.innerHTML = `${header}${yearlyRows}<tr class="section-row"><td colspan="${2 + comboKeys.length}">aggregate rows</td></tr>${aggregateRows}`;
  }

  function formatRecovery(value) {
    return Number.isInteger(value) ? `${value} sessions` : "open";
  }

  function renderRisk(payload) {
    ui.setText("risk-gap-drift", ui.formatPercent(payload.summary.ideal_to_next_open_return_drag_pct));
    ui.setText("risk-delay-drift", ui.formatPercent(payload.summary.next_open_to_next_close_return_drag_pct));
    ui.setText("risk-cost-drift", ui.formatPercent(payload.summary.stress_cost_drag_pct));
    ui.setText("risk-recovery", payload.summary.worst_recovery_sessions == null ? "open" : `${payload.summary.worst_recovery_sessions} sessions`);

    const modelsBody = document.getElementById("risk-models-tbody");
    modelsBody.innerHTML = (payload.model_comparison || [])
      .map(
        (row) => `<tr>
          <td>${ui.escapeHtml(row.label)}</td>
          <td class="mono">${ui.escapeHtml(row.execution_model)}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.total_return_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.max_drawdown_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.volatility_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatNumber(row.trade_count))}</td>
          <td class="num">${ui.escapeHtml(formatRecovery(row.peak_to_recovery_sessions))}</td>
        </tr>`,
      )
      .join("");

    const costsBody = document.getElementById("risk-costs-tbody");
    costsBody.innerHTML = (payload.cost_sensitivity || [])
      .map(
        (row) => `<tr>
          <td>${ui.escapeHtml(row.label)}</td>
          <td class="num">${ui.escapeHtml(row.commission_bps)}</td>
          <td class="num">${ui.escapeHtml(row.slippage_bps)}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.total_return_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.max_drawdown_pct))}</td>
          <td class="num">${ui.escapeHtml(formatRecovery(row.peak_to_recovery_sessions))}</td>
        </tr>`,
      )
      .join("");

    const summaryList = document.getElementById("risk-summary-list");
    summaryList.innerHTML = `
      <div class="stack-row"><span class="title">Best Next Open Return</span><span>${ui.escapeHtml(`${payload.sensitivity_summary.best_next_open_return_cell.thread_count}T / ${payload.sensitivity_summary.best_next_open_return_cell.stop_sessions}S · ${ui.formatPercent(payload.sensitivity_summary.best_next_open_return_cell.total_return_pct)}`)}</span></div>
      <div class="stack-row"><span class="title">Lowest Next Open MDD</span><span>${ui.escapeHtml(`${payload.sensitivity_summary.lowest_next_open_mdd_cell.thread_count}T / ${payload.sensitivity_summary.lowest_next_open_mdd_cell.stop_sessions}S · ${ui.formatPercent(payload.sensitivity_summary.lowest_next_open_mdd_cell.max_drawdown_pct)}`)}</span></div>
    `;

    const warningList = document.getElementById("risk-warning-list");
    warningList.innerHTML = (payload.warnings || [])
      .map((warning) => `<div class="stack-row"><span class="title">${ui.escapeHtml(warning)}</span><span class="badge danger">risk</span></div>`)
      .join("");
  }

  function getStrategyById(strategyId) {
    return state.strategyExplorer?.strategies.find((strategy) => strategy.strategy_id === strategyId) || null;
  }

  function ensureStrategySelection() {
    if (!state.strategyExplorer) {
      return;
    }
    const validIds = new Set(state.strategyExplorer.strategies.map((strategy) => strategy.strategy_id));
    state.selectedStrategyIds = state.selectedStrategyIds.filter((strategyId) => validIds.has(strategyId)).slice(0, MAX_STRATEGY_SELECTION);
    if (!state.selectedStrategyIds.length) {
      state.selectedStrategyIds = state.strategyExplorer.strategies
        .slice()
        .sort((left, right) => Number(right.metrics.total_return_pct) - Number(left.metrics.total_return_pct))
        .slice(0, 3)
        .map((strategy) => strategy.strategy_id);
    }
    if (!state.selectedStrategyPresetId) {
      state.selectedStrategyPresetId = "all";
    }
  }

  function setStrategyDateInputs(start, end) {
    document.getElementById("strategy-slice-start").value = start;
    document.getElementById("strategy-slice-end").value = end;
  }

  function currentStrategySlice() {
    if (!state.strategyExplorer) {
      return null;
    }
    const meta = state.strategyExplorer.meta;
    let start = document.getElementById("strategy-slice-start").value || meta.period_start;
    let end = document.getElementById("strategy-slice-end").value || meta.period_end;
    if (start < meta.period_start) {
      start = meta.period_start;
    }
    if (end > meta.period_end) {
      end = meta.period_end;
    }
    if (start > end) {
      start = end;
    }
    return { start, end };
  }

  function strategyDailySlice(strategy, start, end) {
    return (strategy.daily || []).filter((point) => point.session_date >= start && point.session_date <= end);
  }

  function rebaseDaily(daily) {
    if (!daily.length) {
      return [];
    }
    const startEquity = parseMoney(daily[0].total_equity);
    if (!startEquity) {
      return [];
    }
    let peak = 10000;
    return daily.map((point) => {
      const equity = (parseMoney(point.total_equity) / startEquity) * 10000;
      peak = Math.max(peak, equity);
      const drawdownPct = peak === 0 ? 0 : ((equity - peak) / peak) * 100;
      return {
        date: point.session_date,
        equity,
        drawdownPct,
      };
    });
  }

  function summarizeRebasedSlice(series) {
    if (!series.length) {
      return null;
    }
    const start = series[0].equity;
    const end = series[series.length - 1].equity;
    const maxDrawdown = Math.min(...series.map((point) => point.drawdownPct));
    return {
      returnPct: start === 0 ? 0 : ((end - start) / start) * 100,
      maxDrawdownPct: maxDrawdown,
      start: series[0].date,
      end: series[series.length - 1].date,
    };
  }

  function rollingReturnSeries(series, window) {
    const rows = [];
    for (let index = window; index < series.length; index += 1) {
      const previous = series[index - window];
      if (!previous || previous.equity === 0) {
        continue;
      }
      rows.push({
        date: series[index].date,
        returnPct: ((series[index].equity - previous.equity) / previous.equity) * 100,
      });
    }
    return rows;
  }

  function monthlyRowsFromSeries(series) {
    const map = new Map();
    for (const point of series) {
      const month = point.date.slice(0, 7);
      if (!map.has(month)) {
        map.set(month, []);
      }
      map.get(month).push(point);
    }
    return [...map.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([month, rows]) => ({
        month,
        returnPct: rows[0].equity === 0 ? 0 : ((rows[rows.length - 1].equity - rows[0].equity) / rows[0].equity) * 100,
      }));
  }

  function renderStrategySelector() {
    if (!state.strategyExplorer) {
      return;
    }
    const target = document.getElementById("strategy-selector");
    target.innerHTML = state.strategyExplorer.strategies
      .map((strategy) => {
        const active = state.selectedStrategyIds.includes(strategy.strategy_id) ? " active" : "";
        const badges = (strategy.mentor_profiles || [])
          .map((profileId) => `<span class="badge info mono">${ui.escapeHtml(profileId)}</span>`)
          .join("");
        return `<button type="button" class="strategy-toggle${active}" data-strategy-id="${ui.escapeHtml(strategy.strategy_id)}">
          <strong>${ui.escapeHtml(strategy.label)}</strong>
          <span class="meta">${ui.escapeHtml(`${strategy.thread_count}T / ${strategy.stop_sessions}S · total ${ui.formatPercent(strategy.metrics.total_return_pct)}`)}</span>
          <span class="badges">${badges || '<span class="badge neutral">catalog</span>'}</span>
        </button>`;
      })
      .join("");
    target.querySelectorAll("[data-strategy-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const strategyId = button.getAttribute("data-strategy-id");
        if (!strategyId) {
          return;
        }
        const alreadySelected = state.selectedStrategyIds.includes(strategyId);
        if (alreadySelected) {
          state.selectedStrategyIds = state.selectedStrategyIds.filter((value) => value !== strategyId);
        } else if (state.selectedStrategyIds.length < MAX_STRATEGY_SELECTION) {
          state.selectedStrategyIds = [...state.selectedStrategyIds, strategyId];
        }
        renderStrategySelector();
        renderStrategyViews();
      });
    });
    document.getElementById("strategy-selector-note").textContent = `선택 ${state.selectedStrategyIds.length} / ${MAX_STRATEGY_SELECTION}`;
  }

  function renderStrategySlicePresets() {
    if (!state.strategyExplorer) {
      return;
    }
    const target = document.getElementById("strategy-slice-presets");
    target.innerHTML = state.strategyExplorer.meta.slice_presets
      .map((preset) => {
        const active = preset.preset_id === state.selectedStrategyPresetId ? " active" : "";
        return `<button type="button" class="preset-chip${active}" data-preset-id="${ui.escapeHtml(preset.preset_id)}">${ui.escapeHtml(preset.label)}</button>`;
      })
      .join("");
    target.querySelectorAll("[data-preset-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const presetId = button.getAttribute("data-preset-id");
        const preset = state.strategyExplorer.meta.slice_presets.find((item) => item.preset_id === presetId);
        if (!preset) {
          return;
        }
        state.selectedStrategyPresetId = preset.preset_id;
        setStrategyDateInputs(preset.start, preset.end);
        renderStrategySlicePresets();
        renderStrategyViews();
      });
    });
  }

  function renderStrategyKpis() {
    const slice = currentStrategySlice();
    if (!slice) {
      return;
    }
    const summaries = state.selectedStrategyIds
      .map((strategyId) => {
        const strategy = getStrategyById(strategyId);
        if (!strategy) {
          return null;
        }
        const summary = summarizeRebasedSlice(rebaseDaily(strategyDailySlice(strategy, slice.start, slice.end)));
        return summary ? { strategy, summary } : null;
      })
      .filter(Boolean);
    if (!summaries.length) {
      ui.setText("strategy-kpi-count", "0");
      ui.setText("strategy-kpi-best-return", "-");
      ui.setText("strategy-kpi-best-mdd", "-");
      ui.setText("strategy-kpi-period", "-");
      return;
    }
    const bestReturn = summaries.reduce((best, current) => (current.summary.returnPct > best.summary.returnPct ? current : best));
    const bestMdd = summaries.reduce((best, current) => (current.summary.maxDrawdownPct > best.summary.maxDrawdownPct ? current : best));
    ui.setText("strategy-kpi-count", String(summaries.length));
    ui.setText("strategy-kpi-best-return", `${bestReturn.strategy.label} · ${ui.formatPercent(bestReturn.summary.returnPct)}`);
    ui.setText("strategy-kpi-best-mdd", `${bestMdd.strategy.label} · ${ui.formatPercent(bestMdd.summary.maxDrawdownPct)}`);
    ui.setText("strategy-kpi-period", formatSessionPeriod(slice.start, slice.end));
  }

  function renderStrategyEquityChart() {
    const slice = currentStrategySlice();
    if (!slice || !window.Plotly || !state.selectedStrategyIds.length) {
      setEmptyChart("strategy-equity-chart", "선택 전략이 없습니다.");
      return;
    }
    const traces = state.selectedStrategyIds
      .map((strategyId, index) => {
        const strategy = getStrategyById(strategyId);
        if (!strategy) {
          return null;
        }
        const series = rebaseDaily(strategyDailySlice(strategy, slice.start, slice.end));
        if (!series.length) {
          return null;
        }
        return {
          x: series.map((point) => point.date),
          y: series.map((point) => point.equity),
          type: "scatter",
          mode: "lines",
          name: strategy.label,
          line: { color: STRATEGY_COLORS[index % STRATEGY_COLORS.length], width: 2.4 },
        };
      })
      .filter(Boolean);
    if (!traces.length) {
      setEmptyChart("strategy-equity-chart", "선택 구간에 데이터가 없습니다.");
      return;
    }
    const layout = chartLayoutBase();
    window.Plotly.newPlot(
      "strategy-equity-chart",
      traces,
      { ...layout, yaxis: { ...layout.yaxis, tickprefix: "$" } },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderStrategyDrawdownChart() {
    const slice = currentStrategySlice();
    if (!slice || !window.Plotly || !state.selectedStrategyIds.length) {
      setEmptyChart("strategy-drawdown-chart", "선택 전략이 없습니다.");
      return;
    }
    const traces = state.selectedStrategyIds
      .map((strategyId, index) => {
        const strategy = getStrategyById(strategyId);
        if (!strategy) {
          return null;
        }
        const series = rebaseDaily(strategyDailySlice(strategy, slice.start, slice.end));
        if (!series.length) {
          return null;
        }
        return {
          x: series.map((point) => point.date),
          y: series.map((point) => point.drawdownPct),
          type: "scatter",
          mode: "lines",
          name: strategy.label,
          line: { color: STRATEGY_COLORS[index % STRATEGY_COLORS.length], width: 2.2 },
        };
      })
      .filter(Boolean);
    if (!traces.length) {
      setEmptyChart("strategy-drawdown-chart", "선택 구간에 데이터가 없습니다.");
      return;
    }
    const layout = chartLayoutBase();
    window.Plotly.newPlot(
      "strategy-drawdown-chart",
      traces,
      { ...layout, yaxis: { ...layout.yaxis, ticksuffix: "%" } },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderStrategyRollingChart() {
    const slice = currentStrategySlice();
    const windowSize = Number(document.getElementById("strategy-roll-window").value || 252);
    if (!slice || !window.Plotly || !state.selectedStrategyIds.length) {
      setEmptyChart("strategy-rolling-chart", "선택 전략이 없습니다.");
      return;
    }
    const traces = state.selectedStrategyIds
      .map((strategyId, index) => {
        const strategy = getStrategyById(strategyId);
        if (!strategy) {
          return null;
        }
        const rolling = rollingReturnSeries(rebaseDaily(strategyDailySlice(strategy, slice.start, slice.end)), windowSize);
        if (!rolling.length) {
          return null;
        }
        return {
          x: rolling.map((point) => point.date),
          y: rolling.map((point) => point.returnPct),
          type: "scatter",
          mode: "lines",
          name: strategy.label,
          line: { color: STRATEGY_COLORS[index % STRATEGY_COLORS.length], width: 2.0 },
        };
      })
      .filter(Boolean);
    if (!traces.length) {
      setEmptyChart("strategy-rolling-chart", "선택 구간이 롤링 윈도보다 짧습니다.");
      return;
    }
    const layout = chartLayoutBase();
    window.Plotly.newPlot(
      "strategy-rolling-chart",
      traces,
      { ...layout, yaxis: { ...layout.yaxis, ticksuffix: "%" } },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderStrategyMonthlyChart() {
    const slice = currentStrategySlice();
    if (!slice || !window.Plotly || !state.selectedStrategyIds.length) {
      setEmptyChart("strategy-monthly-chart", "선택 전략이 없습니다.");
      return;
    }
    const monthlyByStrategy = state.selectedStrategyIds
      .map((strategyId) => {
        const strategy = getStrategyById(strategyId);
        if (!strategy) {
          return null;
        }
        return {
          strategy,
          monthly: monthlyRowsFromSeries(rebaseDaily(strategyDailySlice(strategy, slice.start, slice.end))),
        };
      })
      .filter(Boolean);
    const months = [...new Set(monthlyByStrategy.flatMap((item) => item.monthly.map((row) => row.month)))].sort();
    if (!months.length) {
      setEmptyChart("strategy-monthly-chart", "선택 구간에 월별 집계가 없습니다.");
      return;
    }
    const z = monthlyByStrategy.map((item) =>
      months.map((month) => {
        const row = item.monthly.find((entry) => entry.month === month);
        return row ? row.returnPct : null;
      }),
    );
    window.Plotly.newPlot(
      "strategy-monthly-chart",
      [
        {
          x: months,
          y: monthlyByStrategy.map((item) => item.strategy.label),
          z,
          type: "heatmap",
          colorscale: [
            [0, "#d63939"],
            [0.5, "#f7f6f2"],
            [1, "#2fb344"],
          ],
          zmid: 0,
          hovertemplate: "%{y}<br>%{x}<br>%{z:.2f}%<extra></extra>",
        },
      ],
      {
        ...chartLayoutBase(),
        margin: { t: 12, r: 16, b: 72, l: 96 },
      },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderStrategySegmentTable() {
    if (!state.strategyExplorer || !state.selectedStrategyIds.length) {
      document.getElementById("strategy-segment-body").innerHTML =
        '<tr><td colspan="3" class="muted" style="text-align:center">선택 전략이 없습니다.</td></tr>';
      return;
    }
    const presets = state.strategyExplorer.meta.segment_presets || [];
    const strategies = state.selectedStrategyIds.map((strategyId) => getStrategyById(strategyId)).filter(Boolean);
    document.getElementById("strategy-segment-head").innerHTML = `<tr>
      <th>Segment</th>
      ${strategies.map((strategy) => `<th class="num">${ui.escapeHtml(strategy.label)}</th>`).join("")}
    </tr>`;
    document.getElementById("strategy-segment-body").innerHTML = presets
      .map((preset) => {
        const cells = strategies
          .map((strategy) => {
            const row = (strategy.segments || []).find((segment) => segment.segment_id === preset.preset_id);
            if (!row) {
              return '<td class="num muted">-</td>';
            }
            return `<td>
              <strong>${ui.escapeHtml(ui.formatPercent(row.return_pct))}</strong>
              <small>MDD ${ui.escapeHtml(ui.formatPercent(row.max_drawdown_pct))}</small>
            </td>`;
          })
          .join("");
        return `<tr>
          <td>
            <strong>${ui.escapeHtml(preset.label)}</strong>
            <small>${ui.escapeHtml(formatSessionPeriod(preset.start, preset.end))}</small>
          </td>
          ${cells}
        </tr>`;
      })
      .join("");
  }

  function renderStrategyViews() {
    renderStrategyKpis();
    renderStrategyEquityChart();
    renderStrategyDrawdownChart();
    renderStrategyRollingChart();
    renderStrategyMonthlyChart();
    renderStrategySegmentTable();
  }

  function renderStrategyExplorer(payload) {
    state.strategyExplorer = payload;
    ensureStrategySelection();
    const allPreset = payload.meta.slice_presets.find((preset) => preset.preset_id === state.selectedStrategyPresetId) || payload.meta.slice_presets[0];
    if (allPreset) {
      setStrategyDateInputs(allPreset.start, allPreset.end);
    }
    renderStrategySelector();
    renderStrategySlicePresets();
    document.getElementById("strategy-meta-note").textContent =
      `참조: /home/justant/Data/Bit-Mania/backtest/dashboards/strategy_dashboard.html · catalog ${payload.meta.catalog_id} · data ${ui.shortHash(payload.meta.data_hash)} · model ${payload.meta.execution_model}`;
    renderStrategyViews();
  }

  function renderSweepJob(job) {
    ui.setText("sweep-job-id", job.jobId || "-");
    ui.setText("sweep-job-status", job.status || "-");
    ui.setText("sweep-job-progress", `${job.progress || 0}%`);
    ui.setText("sweep-artifact-id", job.artifactId || "-");
    ui.setText("sweep-job-requested", ui.formatDateTime(job.requestedAt));
    ui.setText("sweep-job-finished", ui.formatDateTime(job.finishedAt));
    const errorBox = document.getElementById("sweep-job-error");
    if (job.error) {
      errorBox.textContent = job.error;
      errorBox.classList.add("visible");
    } else {
      errorBox.textContent = "";
      errorBox.classList.remove("visible");
    }
  }

  function currentSweepRows() {
    const payload = state.sweepArtifact?.payload;
    if (!payload) {
      return [];
    }
    const minReturn = Number(document.getElementById("sweep-filter-min-return").value || 0);
    const maxMdd = Number(document.getElementById("sweep-filter-max-mdd").value || -100);
    const maxStd = Number(document.getElementById("sweep-filter-max-std").value || 100);
    const paretoMode = document.getElementById("sweep-filter-pareto").value || "all";
    return payload.rows.filter((row) => {
      if (row.metrics.full_return_pct < minReturn) {
        return false;
      }
      if (row.metrics.max_drawdown_pct < maxMdd) {
        return false;
      }
      if (row.metrics.segment_stddev_pct > maxStd) {
        return false;
      }
      if (paretoMode === "return_mdd" && !row.flags.pareto_return_mdd) {
        return false;
      }
      if (paretoMode === "return_stability" && !row.flags.pareto_return_stability) {
        return false;
      }
      return true;
    });
  }

  function renderSweepSummary(payload, filteredRows) {
    ui.setText("sweep-kpi-count", ui.formatNumber(payload.meta.combo_count));
    ui.setText("sweep-kpi-best-full", payload.summary.best_full_return_combo);
    ui.setText("sweep-kpi-best-robust", payload.summary.best_robust_combo);
    ui.setText(
      "sweep-kpi-pareto",
      `${payload.summary.pareto_return_mdd_count} / ${payload.summary.pareto_return_stability_count}`,
    );
    ui.setText("sweep-latest-state", `${filteredRows.length} rows · ${SWEEP_PARETO_LABELS[document.getElementById("sweep-filter-pareto").value || "all"]}`);
  }

  function renderSweepWarnings(payload, filteredRows) {
    const rows = payload.warnings.slice();
    if (filteredRows.length) {
      const leader = filteredRows[0];
      const drift = leader.metrics.full_return_pct - leader.metrics.recent_segment_return_pct;
      if (drift > 50) {
        rows.push(`필터 기준 1위 ${leader.combo_key} 는 전체 대비 최근 성과 드리프트가 ${drift.toFixed(2)}%p 입니다.`);
      }
      if (leader.metrics.segment_stddev_pct > 20) {
        rows.push(`필터 기준 1위 ${leader.combo_key} 의 구간 표준편차가 ${leader.metrics.segment_stddev_pct.toFixed(2)}% 입니다.`);
      }
    }
    const target = document.getElementById("sweep-warning-list");
    if (!rows.length) {
      target.innerHTML = '<div class="stack-row"><span class="title">현재 필터에서 추가 경고 없음</span><span class="badge success">ok</span></div>';
      return;
    }
    target.innerHTML = rows
      .map((warning) => `<div class="warning-row"><span class="title">${ui.escapeHtml(warning)}</span></div>`)
      .join("");
  }

  function renderSweepScatter(filteredRows) {
    if (!window.Plotly || !filteredRows.length) {
      setEmptyChart("sweep-scatter-chart", "표시할 스윕 결과가 없습니다.");
      return;
    }
    window.Plotly.newPlot(
      "sweep-scatter-chart",
      [
        {
          x: filteredRows.map((row) => row.metrics.max_drawdown_pct),
          y: filteredRows.map((row) => row.metrics.full_return_pct),
          text: filteredRows.map((row) => row.combo_key),
          mode: "markers",
          type: "scatter",
          marker: {
            size: 10,
            color: filteredRows.map((row) => row.metrics.recent_segment_return_pct),
            colorscale: "RdYlGn",
            line: {
              color: filteredRows.map((row) => (row.flags.pareto_return_mdd ? "#241d15" : "transparent")),
              width: 1.4,
            },
            colorbar: { title: "recent %" },
          },
          hovertemplate: "%{text}<br>MDD %{x:.2f}%<br>Return %{y:.2f}%<extra></extra>",
        },
      ],
      {
        ...chartLayoutBase(),
        xaxis: { ...chartLayoutBase().xaxis, title: "Max Drawdown %" },
        yaxis: { ...chartLayoutBase().yaxis, title: "Full Return %" },
      },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderSweepBox(filteredRows) {
    const axis = document.getElementById("sweep-box-axis").value;
    if (!window.Plotly || !filteredRows.length) {
      setEmptyChart("sweep-box-chart", "표시할 스윕 결과가 없습니다.");
      return;
    }
    window.Plotly.newPlot(
      "sweep-box-chart",
      [
        {
          x: filteredRows.map((row) => String(row.params[axis])),
          y: filteredRows.map((row) => row.metrics.mean_segment_return_pct),
          type: "box",
          boxpoints: "outliers",
          marker: { color: "#d78a4b" },
          line: { color: "#91502d" },
          hovertemplate: `${axis}=%{x}<br>mean segment %{y:.2f}%<extra></extra>`,
        },
      ],
      {
        ...chartLayoutBase(),
        xaxis: { ...chartLayoutBase().xaxis, title: axis },
        yaxis: { ...chartLayoutBase().yaxis, title: "Mean Segment Return %" },
      },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderSweepParcoords(filteredRows) {
    if (!window.Plotly || !filteredRows.length) {
      setEmptyChart("sweep-parcoords-chart", "표시할 스윕 결과가 없습니다.");
      return;
    }
    window.Plotly.newPlot(
      "sweep-parcoords-chart",
      [
        {
          type: "parcoords",
          line: {
            color: filteredRows.map((row) => row.metrics.recent_segment_return_pct),
            colorscale: "RdYlGn",
            showscale: true,
            colorbar: { title: "recent %" },
          },
          dimensions: [
            { label: "thread", values: filteredRows.map((row) => row.params.thread_count) },
            { label: "stop", values: filteredRows.map((row) => row.params.stop_sessions) },
            { label: "take profit", values: filteredRows.map((row) => row.params.take_profit_pct) },
            { label: "entry drop", values: filteredRows.map((row) => row.params.entry_drop_pct) },
            { label: "stop loss", values: filteredRows.map((row) => row.params.stop_loss_pct) },
            { label: "max entries", values: filteredRows.map((row) => row.params.max_entries_per_session) },
            { label: "full return", values: filteredRows.map((row) => row.metrics.full_return_pct) },
            { label: "MDD", values: filteredRows.map((row) => row.metrics.max_drawdown_pct) },
            { label: "mean seg", values: filteredRows.map((row) => row.metrics.mean_segment_return_pct) },
            { label: "seg std", values: filteredRows.map((row) => row.metrics.segment_stddev_pct) },
          ],
        },
      ],
      {
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        margin: { t: 12, r: 16, b: 24, l: 16 },
      },
      { displayModeBar: false, responsive: true },
    );
  }

  function renderSweepTable(filteredRows) {
    const tbody = document.getElementById("sweep-table-body");
    if (!filteredRows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">필터 결과가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = filteredRows.slice(0, 100).map((row) => {
      const pareto = [];
      if (row.flags.pareto_return_mdd) {
        pareto.push("R/MDD");
      }
      if (row.flags.pareto_return_stability) {
        pareto.push("R/STAB");
      }
      return `<tr>
        <td class="mono">${ui.escapeHtml(row.combo_key)}</td>
        <td class="num">${ui.escapeHtml(`T${row.params.thread_count} S${row.params.stop_sessions} TP${row.params.take_profit_pct} ED${row.params.entry_drop_pct} SL${row.params.stop_loss_pct} ME${row.params.max_entries_per_session}`)}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.full_return_pct))}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.max_drawdown_pct))}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.mean_segment_return_pct))}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.segment_stddev_pct))}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.recent_segment_return_pct))}</td>
        <td class="num">${pareto.length ? pareto.map((label) => `<span class="badge info">${ui.escapeHtml(label)}</span>`).join(" ") : '<span class="badge neutral">-</span>'}</td>
      </tr>`;
    }).join("");
  }

  function renderSweepArtifact(artifactRecord) {
    state.sweepArtifact = artifactRecord;
    if (!artifactRecord || !artifactRecord.payload) {
      ui.setText("sweep-kpi-count", "-");
      ui.setText("sweep-kpi-best-full", "-");
      ui.setText("sweep-kpi-best-robust", "-");
      ui.setText("sweep-kpi-pareto", "-");
      setEmptyChart("sweep-scatter-chart", "최신 스윕 산출물이 없습니다.");
      setEmptyChart("sweep-box-chart", "최신 스윕 산출물이 없습니다.");
      setEmptyChart("sweep-parcoords-chart", "최신 스윕 산출물이 없습니다.");
      document.getElementById("sweep-table-body").innerHTML =
        '<tr><td colspan="8" class="muted" style="text-align:center">스윕 결과를 불러오지 않았습니다.</td></tr>';
      document.getElementById("sweep-warning-list").innerHTML =
        '<div class="stack-row"><span class="title">최신 스윕 산출물이 없습니다.</span><span class="badge neutral">empty</span></div>';
      return;
    }
    const payload = artifactRecord.payload;
    ui.setText("sweep-artifact-id", artifactRecord.artifactId || "-");
    document.getElementById("sweep-meta-note").textContent =
      `참조: /home/justant/Data/Bit-Mania/backtest/dashboards/supertrend_sweep_dashboard.html · ${payload.meta.sweep_id} · data ${ui.shortHash(payload.meta.data_hash)} · hash ${ui.shortHash(payload.meta.sweep_hash)}`;
    const filteredRows = currentSweepRows();
    renderSweepSummary(payload, filteredRows);
    renderSweepWarnings(payload, filteredRows);
    renderSweepScatter(filteredRows);
    renderSweepBox(filteredRows);
    renderSweepParcoords(filteredRows);
    renderSweepTable(filteredRows);
  }

  async function pollJob(jobId) {
    while (true) {
      const job = await ui.fetchJson(`/api/backtests/jobs/${encodeURIComponent(jobId)}`);
      renderJob(job);
      if (job.status === "COMPLETED" && job.runId) {
        const run = await ui.fetchJson(`/api/backtests/runs/${encodeURIComponent(job.runId)}`);
        renderRunArtifact(run);
        return;
      }
      if (job.status === "FAILED") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function pollSweepJob(jobId) {
    while (true) {
      const job = await ui.fetchJson(`/api/backtests/sweeps/jobs/${encodeURIComponent(jobId)}`);
      renderSweepJob(job);
      if (job.status === "COMPLETED" && job.artifactId) {
        const artifact = await ui.fetchJson(`/api/backtests/sweeps/runs/${encodeURIComponent(job.artifactId)}`);
        renderSweepArtifact(artifact);
        return;
      }
      if (job.status === "FAILED") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  async function loadCompare() {
    const profileId = selectedProfileId();
    const csvPath = document.getElementById("csv-path").value.trim();
    const initialCapital = Number(document.getElementById("initial-capital").value || 10000);
    const overrides = collectOverrides();
    const params = new URLSearchParams({
      profileId,
      csvPath,
      initialCapital: String(initialCapital),
      threads: document.getElementById("compare-threads").value.trim() || "5,6,7",
      stops: document.getElementById("compare-stops").value.trim() || "10,30,40",
      threadCount: String(overrides.threadCount),
      stopSessions: String(overrides.stopSessions),
      takeProfitPct: String(overrides.takeProfitPct),
      takeProfitOperator: overrides.takeProfitOperator,
      entryDropPct: String(overrides.entryDropPct),
      stopLossPct: String(overrides.stopLossPct),
      maxEntriesPerSession: String(overrides.maxEntriesPerSession),
      sizingMode: overrides.sizingMode,
      priceBasis: overrides.priceBasis,
    });
    const payload = await ui.fetchJson(`/api/backtests/compare?${params.toString()}`);
    renderCompare(payload);
  }

  async function loadRisk() {
    const profileId = selectedProfileId();
    const csvPath = document.getElementById("csv-path").value.trim();
    const initialCapital = Number(document.getElementById("initial-capital").value || 10000);
    const overrides = collectOverrides();
    const params = new URLSearchParams({
      profileId,
      csvPath,
      initialCapital: String(initialCapital),
      threadCount: String(overrides.threadCount),
      stopSessions: String(overrides.stopSessions),
      takeProfitPct: String(overrides.takeProfitPct),
      takeProfitOperator: overrides.takeProfitOperator,
      entryDropPct: String(overrides.entryDropPct),
      stopLossPct: String(overrides.stopLossPct),
      maxEntriesPerSession: String(overrides.maxEntriesPerSession),
      sizingMode: overrides.sizingMode,
      priceBasis: overrides.priceBasis,
    });
    const payload = await ui.fetchJson(`/api/backtests/risk?${params.toString()}`);
    renderRisk(payload);
  }

  async function loadMentorMatrix() {
    const profileId = selectedProfileId();
    const csvPath = document.getElementById("csv-path").value.trim();
    const initialCapital = Number(document.getElementById("initial-capital").value || 10000);
    const overrides = collectOverrides();
    const params = new URLSearchParams({
      profileId,
      csvPath,
      initialCapital: String(initialCapital),
      threads: document.getElementById("compare-threads").value.trim() || "5,6,7",
      stops: document.getElementById("compare-stops").value.trim() || "10,30,40",
      threadCount: String(overrides.threadCount),
      stopSessions: String(overrides.stopSessions),
      takeProfitPct: String(overrides.takeProfitPct),
      takeProfitOperator: overrides.takeProfitOperator,
      entryDropPct: String(overrides.entryDropPct),
      stopLossPct: String(overrides.stopLossPct),
      maxEntriesPerSession: String(overrides.maxEntriesPerSession),
      sizingMode: overrides.sizingMode,
      priceBasis: overrides.priceBasis,
    });
    const payload = await ui.fetchJson(`/api/backtests/mentor-matrix?${params.toString()}`);
    renderMentorMatrix(payload);
    renderMentorCounts(payload);
  }

  async function loadStrategyExplorer() {
    const profileId = selectedProfileId();
    const csvPath = document.getElementById("csv-path").value.trim();
    const params = new URLSearchParams({
      profileId,
      csvPath,
      executionModel: document.getElementById("strategy-model").value || "next_open",
      priceBasis: document.getElementById("strategy-price-basis").value || "adjusted_close",
    });
    const payload = await ui.fetchJson(`/api/backtests/strategy-explorer?${params.toString()}`);
    renderStrategyExplorer(payload);
  }

  async function loadLatestSweep() {
    const profileId = selectedProfileId();
    const csvPath = document.getElementById("csv-path").value.trim();
    const params = new URLSearchParams({
      profileId,
      csvPath,
      sweepId: "core6_v1",
      executionModel: document.getElementById("sweep-model").value || "next_open",
      priceBasis: document.getElementById("sweep-price-basis").value || "adjusted_close",
    });
    const artifact = await ui.fetchJson(`/api/backtests/sweeps/latest?${params.toString()}`);
    renderSweepArtifact(artifact);
  }

  async function bootstrap() {
    const [profiles, dataStatus, overview] = await Promise.all([
      ui.fetchJson("/api/profiles"),
      ui.fetchJson("/api/data/status"),
      ui.fetchJson("/api/backtests"),
    ]);
    populateProfiles(profiles);
    document.getElementById("csv-path").value = dataStatus.snapshot_path;
    renderDataStatus(dataStatus);
    if (overview.jobs && overview.jobs.length) {
      renderJob(overview.jobs[0]);
    }
    if (overview.latestRun) {
      renderRunArtifact(overview.latestRun);
    }
    await Promise.all([loadStrategyExplorer(), loadLatestSweep(), loadCompare(), loadRisk(), loadMentorMatrix()]);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((error) => {
      const errorBox = document.getElementById("job-error");
      errorBox.textContent = error.message;
      errorBox.classList.add("visible");
    });

    document.getElementById("backtest-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = {
        profileId: selectedProfileId(),
        csvPath: document.getElementById("csv-path").value.trim(),
        initialCapital: Number(document.getElementById("initial-capital").value || 10000),
        overrides: collectOverrides(),
      };
      const job = await ui.postJson("/api/backtests/jobs", payload);
      renderJob(job);
      await pollJob(job.jobId);
    });

    document.getElementById("compare-button").addEventListener("click", async () => {
      await Promise.all([loadCompare(), loadRisk(), loadMentorMatrix()]);
    });

    document.getElementById("profile-select").addEventListener("change", async (event) => {
      ui.setText("sb-profile", event.target.value);
      syncControlsFromProfile(selectedProfile());
      await Promise.all([loadStrategyExplorer(), loadLatestSweep(), loadCompare(), loadRisk(), loadMentorMatrix()]);
    });

    document.getElementById("strategy-apply-button").addEventListener("click", () => {
      state.selectedStrategyPresetId = "custom";
      renderStrategySlicePresets();
      renderStrategyViews();
    });

    document.getElementById("strategy-reset-button").addEventListener("click", () => {
      if (!state.strategyExplorer) {
        return;
      }
      state.selectedStrategyPresetId = "all";
      const allPreset = state.strategyExplorer.meta.slice_presets.find((preset) => preset.preset_id === "all");
      if (allPreset) {
        setStrategyDateInputs(allPreset.start, allPreset.end);
      }
      renderStrategySlicePresets();
      renderStrategyViews();
    });

    document.getElementById("strategy-refresh-button").addEventListener("click", async () => {
      await loadStrategyExplorer();
    });

    document.getElementById("strategy-roll-window").addEventListener("change", () => {
      renderStrategyRollingChart();
    });

    document.getElementById("strategy-model").addEventListener("change", async () => {
      await loadStrategyExplorer();
    });

    document.getElementById("strategy-price-basis").addEventListener("change", async () => {
      await loadStrategyExplorer();
    });

    document.getElementById("sweep-run-button").addEventListener("click", async () => {
      const payload = {
        profileId: selectedProfileId(),
        csvPath: document.getElementById("csv-path").value.trim(),
        sweepId: "core6_v1",
        executionModel: document.getElementById("sweep-model").value || "next_open",
        priceBasis: document.getElementById("sweep-price-basis").value || "adjusted_close",
      };
      const job = await ui.postJson("/api/backtests/sweeps/jobs", payload);
      renderSweepJob(job);
      if (job.status === "COMPLETED" && job.artifactId) {
        const artifact = await ui.fetchJson(`/api/backtests/sweeps/runs/${encodeURIComponent(job.artifactId)}`);
        renderSweepArtifact(artifact);
        return;
      }
      await pollSweepJob(job.jobId);
    });

    document.getElementById("sweep-refresh-button").addEventListener("click", async () => {
      await loadLatestSweep();
    });

    document.getElementById("sweep-model").addEventListener("change", async () => {
      await loadLatestSweep();
    });

    document.getElementById("sweep-price-basis").addEventListener("change", async () => {
      await loadLatestSweep();
    });

    document.getElementById("sweep-box-axis").addEventListener("change", () => {
      if (state.sweepArtifact) {
        renderSweepArtifact(state.sweepArtifact);
      }
    });

    document.getElementById("sweep-filter-apply").addEventListener("click", () => {
      if (state.sweepArtifact) {
        renderSweepArtifact(state.sweepArtifact);
      }
    });

    document.getElementById("sweep-filter-reset").addEventListener("click", () => {
      document.getElementById("sweep-filter-min-return").value = "0";
      document.getElementById("sweep-filter-max-mdd").value = "-100";
      document.getElementById("sweep-filter-max-std").value = "100";
      document.getElementById("sweep-filter-pareto").value = "all";
      if (state.sweepArtifact) {
        renderSweepArtifact(state.sweepArtifact);
      }
    });
  });
})();
