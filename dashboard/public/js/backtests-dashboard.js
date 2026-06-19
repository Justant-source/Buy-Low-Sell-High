(function () {
  const ui = window.SOXLDashboard;
  const state = {
    latestRun: null,
    profiles: [],
    dataStatus: null,
    mentorMatrix: null,
  };

  function profilePathToLabel(profile) {
    return `${profile.profileId} · ${profile.threadCount}T/${profile.stopSessions}S`;
  }

  function selectedProfile() {
    return state.profiles.find((profile) => profile.profileId === document.getElementById("profile-select").value) || null;
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

  function renderCharts(run) {
    if (!window.Plotly || !run || !run.daily || !run.daily.length) {
      return;
    }
    const x = run.daily.map((point) => point.session_date);
    const equity = run.daily.map((point) => Number(point.total_equity));
    const drawdown = run.daily.map((point) => Number(point.drawdown) * 100);
    const commonLayout = {
      paper_bgcolor: "transparent",
      plot_bgcolor: "transparent",
      margin: { t: 10, r: 16, b: 36, l: 56 },
      font: { family: "Inter, sans-serif", color: getComputedStyle(document.documentElement).getPropertyValue("--text").trim() },
      xaxis: { gridcolor: getComputedStyle(document.documentElement).getPropertyValue("--border").trim() },
      yaxis: { gridcolor: getComputedStyle(document.documentElement).getPropertyValue("--border").trim() },
    };
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
    renderCharts(run);
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
    const reference = payload.reference;
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

  async function loadCompare() {
    const profileId = document.getElementById("profile-select").value;
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
    const profileId = document.getElementById("profile-select").value;
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
    const profileId = document.getElementById("profile-select").value;
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
    await Promise.all([loadCompare(), loadRisk(), loadMentorMatrix()]);
  }

  document.getElementById("backtest-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      profileId: document.getElementById("profile-select").value,
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
    await Promise.all([loadCompare(), loadRisk(), loadMentorMatrix()]);
  });

  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((error) => {
      const errorBox = document.getElementById("job-error");
      errorBox.textContent = error.message;
      errorBox.classList.add("visible");
    });
  });
})();
