(function () {
  const ui = window.SOXLDashboard;
  const state = {
    latestRun: null,
    profiles: [],
    dataStatus: null,
  };

  function profilePathToLabel(profile) {
    return `${profile.profileId} · ${profile.threadCount}T/${profile.stopSessions}S`;
  }

  function populateProfiles(payload) {
    state.profiles = payload.profiles || [];
    const select = document.getElementById("profile-select");
    select.innerHTML = state.profiles
      .map((profile) => `<option value="${ui.escapeHtml(profile.profileId)}">${ui.escapeHtml(profilePathToLabel(profile))}</option>`)
      .join("");
    select.value = payload.defaultProfileId || "mentor_default_5x30";
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
    const params = new URLSearchParams({
      profileId,
      csvPath,
      initialCapital: String(initialCapital),
      threads: "5,6,7",
      stops: "10,30,40",
    });
    const payload = await ui.fetchJson(`/api/backtests/compare?${params.toString()}`);
    renderCompare(payload);
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
    await loadCompare();
  }

  document.getElementById("backtest-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = {
      profileId: document.getElementById("profile-select").value,
      csvPath: document.getElementById("csv-path").value.trim(),
      initialCapital: Number(document.getElementById("initial-capital").value || 10000),
    };
    const job = await ui.postJson("/api/backtests/jobs", payload);
    renderJob(job);
    await pollJob(job.jobId);
  });

  document.getElementById("compare-button").addEventListener("click", async () => {
    await loadCompare();
  });

  document.getElementById("profile-select").addEventListener("change", (event) => {
    ui.setText("sb-profile", event.target.value);
  });

  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((error) => {
      const errorBox = document.getElementById("job-error");
      errorBox.textContent = error.message;
      errorBox.classList.add("visible");
    });
  });
})();
