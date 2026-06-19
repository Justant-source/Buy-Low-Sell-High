(function () {
  const ui = window.SOXLDashboard;
  const DEFAULT_PROFILE = "mentor_default_7x30";

  function renderDataStatus(status) {
    ui.setText("kpi-rows", ui.formatNumber(status.rows));
    ui.setText("kpi-end", status.end);
    ui.setText("monitor-range-pill", `${status.start} - ${status.end}`);
    const list = document.getElementById("data-status-list");
    list.innerHTML = `
      <div class="stack-row"><span class="title">Snapshot Path</span><span class="mono">${ui.escapeHtml(status.snapshot_path)}</span></div>
      <div class="stack-row"><span class="title">Data Hash</span><span class="mono">${ui.escapeHtml(status.data_hash)}</span></div>
      <div class="stack-row"><span class="title">Source</span><span>${ui.escapeHtml(status.source)}</span></div>
      <div class="stack-row"><span class="title">Warnings</span><span>${ui.escapeHtml((status.warnings || []).join(", ") || "none")}</span></div>
    `;
  }

  function renderJobs(jobs) {
    const tbody = document.getElementById("jobs-tbody");
    if (!jobs || !jobs.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center">Job 이력이 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = jobs
      .map(
        (job) => `<tr>
          <td class="mono">${ui.escapeHtml(ui.shortHash(job.jobId))}</td>
          <td><span class="badge ${job.status === "FAILED" ? "danger" : job.status === "COMPLETED" ? "success" : "warning"}">${ui.escapeHtml(job.status)}</span></td>
          <td>${ui.escapeHtml(job.profileId)}</td>
          <td class="num">${ui.escapeHtml(String(job.progress))}%</td>
          <td class="mono">${ui.escapeHtml(ui.formatDateTime(job.requestedAt))}</td>
        </tr>`,
      )
      .join("");
  }

  function renderRecommendations(payload) {
    const rows = payload.recommendations || [];
    ui.setText("kpi-actions", ui.formatNumber(rows.length));
    const tbody = document.getElementById("recs-tbody");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="muted" style="text-align:center">권고 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (row) => `<tr>
          <td>${ui.escapeHtml(String(row.thread_id))}</td>
          <td><span class="badge ${ui.actionBadge(row.action)}">${ui.escapeHtml(row.action)}</span></td>
          <td>${ui.escapeHtml(row.reason)}</td>
          <td class="num">${ui.escapeHtml(row.basis_price)}</td>
          <td class="mono">${ui.escapeHtml(row.session_date)}</td>
        </tr>`,
      )
      .join("");
  }

  function renderLedger(payload) {
    const ledger = payload.ledger;
    ui.setText("kpi-open-threads", ui.formatNumber(ledger.summary.open_threads));
    const summaryList = document.getElementById("ledger-summary-list");
    summaryList.innerHTML = `
      <div class="stack-row"><span class="title">Account</span><span class="mono">${ui.escapeHtml(ledger.summary.account_id)}</span></div>
      <div class="stack-row"><span class="title">Fill Count</span><span>${ui.escapeHtml(ui.formatNumber(ledger.summary.fill_count))}</span></div>
      <div class="stack-row"><span class="title">Total Cash</span><span class="mono">${ui.escapeHtml(ledger.summary.total_cash)}</span></div>
      <div class="stack-row"><span class="title">Total Quantity</span><span class="mono">${ui.escapeHtml(ledger.summary.total_quantity)}</span></div>
    `;
    const tbody = document.getElementById("threads-tbody");
    tbody.innerHTML = ledger.threads
      .map(
        (thread) => `<tr>
          <td>${ui.escapeHtml(String(thread.thread_id))}</td>
          <td class="num">${ui.escapeHtml(thread.cash)}</td>
          <td class="num">${ui.escapeHtml(thread.quantity)}</td>
          <td class="num">${ui.escapeHtml(thread.entry_price)}</td>
          <td class="mono">${ui.escapeHtml(thread.entry_date || "-")}</td>
        </tr>`,
      )
      .join("");
  }

  function renderLatestRun(artifact) {
    if (!artifact || !artifact.payload) {
      return;
    }
    const run = artifact.payload;
    ui.setText("kpi-return", ui.formatPercent(run.metrics.total_return_pct));
    ui.setText("kpi-mdd", ui.formatPercent(run.metrics.max_drawdown_pct));
    if (!window.Plotly || !run.daily || !run.daily.length) {
      return;
    }
    window.Plotly.newPlot(
      "monitor-equity-chart",
      [{
        x: run.daily.map((point) => point.session_date),
        y: run.daily.map((point) => Number(point.total_equity)),
        type: "scatter",
        mode: "lines",
        line: { color: "#d78a4b", width: 2.2 },
      }],
      {
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        margin: { t: 10, r: 16, b: 36, l: 56 },
        font: { family: "Inter, sans-serif", color: getComputedStyle(document.documentElement).getPropertyValue("--text").trim() },
      },
      { displayModeBar: false, responsive: true },
    );
  }

  async function bootstrap() {
    const [dataStatus, overview, ledger, recommendations] = await Promise.all([
      ui.fetchJson("/api/data/status"),
      ui.fetchJson("/api/backtests"),
      ui.fetchJson(`/api/manual/ledger?profileId=${encodeURIComponent(DEFAULT_PROFILE)}`),
      ui.fetchJson(`/api/manual/today?profileId=${encodeURIComponent(DEFAULT_PROFILE)}`),
    ]);
    ui.setText("monitor-profile-pill", DEFAULT_PROFILE);
    renderDataStatus(dataStatus);
    renderJobs(overview.jobs || []);
    renderLatestRun(overview.latestRun);
    renderLedger(ledger);
    renderRecommendations(recommendations);
  }

  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((error) => {
      document.getElementById("data-status-list").innerHTML = `<div class="stack-row"><span class="title">Error</span><span>${ui.escapeHtml(error.message)}</span></div>`;
    });
  });
})();
