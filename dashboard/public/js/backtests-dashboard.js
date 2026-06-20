(function () {
  const ui = window.SOXLDashboard;
  const MAX_STRATEGY_SELECTION = 6;
  const STRATEGY_COLORS = ["#d78a4b", "#2f7ed8", "#2fb344", "#d63939", "#7b5cff", "#1f9d8b"];
  const THREAD_SESSION_PX_BASE = 14;
  const THREAD_TRACK_MIN_WIDTH = 0;
  const THREAD_TIMELINE_ZOOM_MIN = 20;
  const THREAD_TIMELINE_ZOOM_MAX = 780;
  const THREAD_TIMELINE_ZOOM_DEFAULT = 160;
  const SWEEP_PARETO_LABELS = {
    all: "all",
    return_mdd: "return / MDD",
    return_stability: "return / stability",
  };
  const state = {
    activeTab: "strategy",
    workspaceId: "soxl",
    workspaces: [],
    profileId: "soxl_official_ddeolsao_pal_v1",
    profiles: [],
    dataStatus: null,
    officialExplorer: null,
    officialMatrix: null,
    strategyExplorer: null,
    focusedStrategyId: null,
    threadTimeline: null,
    threadTimelineCache: {},
    threadDrawer: { sessionDate: null, tradeId: null, kind: null },
    threadTimelineScrollLeft: 0,
    threadTimelineScrollRatio: 0,
    threadTimelineZoom: THREAD_TIMELINE_ZOOM_DEFAULT,
    threadExpanded: false,
    threadHistoryPage: 1,
    threadHistoryPageSize: 20,
    sweepArtifact: null,
    selectedStrategyIds: [],
    selectedStrategyPresetId: "all",
  };

  function resetThreadHistoryPage() {
    state.threadHistoryPage = 1;
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

  function parseDateValue(value) {
    return new Date(`${value}T00:00:00Z`).getTime();
  }

  function setNotice(id, message) {
    const element = document.getElementById(id);
    if (!element) {
      return;
    }
    element.textContent = message || "";
    element.style.display = message ? "" : "none";
  }

  function threadReasonClass(interval) {
    if (interval.status === "OPEN") {
      return "open";
    }
    if (interval.close_reason === "TAKE_PROFIT") {
      return "tp";
    }
    return "stop";
  }

  function threadReasonLabel(reason) {
    if (reason === "TAKE_PROFIT") {
      return "익절";
    }
    if (reason === "PRICE_STOP") {
      return "가격 손절";
    }
    if (reason === "TIME_STOP") {
      return "손절";
    }
    if (reason === "END_OF_TEST") {
      return "종료 정산";
    }
    return reason || "보유";
  }

  function formatPriceValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return `$${number.toLocaleString("en-US", {
      minimumFractionDigits: number < 10 ? 4 : 2,
      maximumFractionDigits: 4,
    })}`;
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

  function formatHoldingSessions(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) {
      return "-";
    }
    return `${number.toLocaleString("en-US", { maximumFractionDigits: 0 })}일`;
  }

  function threadLabel(threadId) {
    if (threadId === 0) {
      return "Total";
    }
    return `#${threadId}`;
  }

  function laneDisplayLabel(lane) {
    return threadLabel(Number(lane?.thread_id || 0));
  }

  function joinedMoney(values) {
    const items = (values || []).map((value) => ui.formatMoney(value));
    return items.length ? items.join(", ") : "-";
  }

  function joinedPrice(values) {
    const items = (values || []).map((value) => formatPriceValue(value));
    return items.length ? items.join(", ") : "-";
  }

  function entryMarkerTitle(session) {
    const capitalValues = (session.entry_batch || []).map((row) => row.invested_amount);
    const entryPrices = (session.entry_batch || []).map((row) => row.entry_price);
    return `매수 | 날짜 ${session.session_date} | 자본금 ${joinedMoney(capitalValues)} | 진입 가격 ${joinedPrice(entryPrices)}`;
  }

  function exitMarkerTitle(session) {
    const exitPrices = (session.exit_batch || []).map((row) => row.exit_price);
    const totalPnl = (session.exit_batch || []).reduce((sum, row) => sum + parseMoney(row.pnl), 0);
    return `매도 | 날짜 ${session.session_date} | 종료 가격 ${joinedPrice(exitPrices)} | 총 벌어들인 금액 ${ui.formatMoney(totalPnl)}`;
  }

  function currentProfile() {
    return state.profiles.find((profile) => profile.profileId === state.profileId) || null;
  }

  function currentWorkspace() {
    return state.workspaces.find((workspace) => workspace.workspaceId === state.workspaceId) || null;
  }

  function currentWorkspaceSlug() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] === "backtests" && parts[1] ? parts[1] : null;
  }

  function renderWorkspaceNav() {
    const target = document.getElementById("workspace-nav");
    if (!target) {
      return;
    }
    const activeSlug = currentWorkspace()?.routeSlug;
    target.innerHTML = state.workspaces
      .map((workspace) => {
        const active = workspace.routeSlug === activeSlug ? " active" : "";
        return `<a class="nav-item${active}" href="/backtests/${ui.escapeHtml(workspace.routeSlug)}">${ui.escapeHtml(workspace.navLabel)}</a>`;
      })
      .join("");
  }

  function renderWorkspaceSummary(workspace) {
    if (!workspace) {
      return;
    }
    ui.setText("sb-nav-label", workspace.navLabel);
    ui.setText("sb-description", workspace.summary);
    ui.setText("page-title", workspace.navLabel);
    ui.setText("page-subtitle", workspace.description);
    const tags = document.getElementById("workspace-tags");
    if (tags) {
      tags.innerHTML = (workspace.warningTags || [])
        .map((tag) => `<span class="badge info">${ui.escapeHtml(tag)}</span>`)
        .join("");
    }
    const mentorButton = document.getElementById("mentor-tab-button");
    const mentorPanel = document.querySelector('[data-tab-panel="mentor"]');
    const mentorEnabled = workspace.referenceMode === "soxl_reference";
    if (mentorButton) {
      mentorButton.style.display = mentorEnabled ? "" : "none";
    }
    if (mentorPanel instanceof HTMLElement) {
      mentorPanel.style.display = mentorEnabled ? "" : "none";
    }
    if (!mentorEnabled && state.activeTab === "mentor") {
      activateTab("strategy");
    }
  }

  function renderDataStatus(status) {
    state.dataStatus = status;
    ui.setText("sb-range", `${status.start} - ${status.end}`);
  }

  function renderProfileSummary(profile) {
    if (!profile) {
      return;
    }
    state.profileId = profile.profileId;
    ui.setText("sb-model", profile.executionModel || "ideal_same_close");
  }

  function activateTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll("[data-tab]").forEach((button) => {
      const active = button.getAttribute("data-tab") === tabId;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
      panel.classList.toggle("active", panel.getAttribute("data-tab-panel") === tabId);
    });
  }

  function getStrategyById(strategyId) {
    return state.strategyExplorer?.strategies.find((strategy) => strategy.strategy_id === strategyId) || null;
  }

  function ensureFocusedStrategy() {
    if (!state.strategyExplorer) {
      state.focusedStrategyId = null;
      return;
    }
    const validIds = new Set(state.strategyExplorer.strategies.map((strategy) => strategy.strategy_id));
    if (state.focusedStrategyId && validIds.has(state.focusedStrategyId)) {
      return;
    }
    const officialId = state.officialExplorer?.official_profile?.combo_key;
    if (officialId && validIds.has(officialId)) {
      state.focusedStrategyId = officialId;
      return;
    }
    state.focusedStrategyId = state.selectedStrategyIds[0] || state.strategyExplorer.strategies[0]?.strategy_id || null;
  }

  function ensureStrategySelection() {
    if (!state.strategyExplorer) {
      return;
    }
    const validIds = new Set(state.strategyExplorer.strategies.map((strategy) => strategy.strategy_id));
    state.selectedStrategyIds = state.selectedStrategyIds.filter((strategyId) => validIds.has(strategyId)).slice(0, MAX_STRATEGY_SELECTION);
    if (state.selectedStrategyIds.length) {
      ensureFocusedStrategy();
      return;
    }
    const defaults = (state.officialExplorer?.rankings || [])
      .slice(0, 3)
      .map((row) => row.strategy_id)
      .filter((strategyId) => validIds.has(strategyId));
    state.selectedStrategyIds = defaults.length ? defaults : state.strategyExplorer.strategies.slice(0, 3).map((strategy) => strategy.strategy_id);
    ensureFocusedStrategy();
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
    return {
      returnPct: start === 0 ? 0 : ((end - start) / start) * 100,
      start: series[0].date,
      end: series[series.length - 1].date,
    };
  }

  function summarizeSliceDrawdown(series) {
    if (!series.length) {
      return null;
    }
    const maxDrawdownPct = series.reduce((worst, point) => Math.min(worst, Number(point.drawdownPct) || 0), 0);
    return {
      maxDrawdownPct,
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

  function toggleStrategySelection(strategyId) {
    const current = new Set(state.selectedStrategyIds);
    if (current.has(strategyId)) {
      current.delete(strategyId);
    } else if (current.size < MAX_STRATEGY_SELECTION) {
      current.add(strategyId);
    }
    state.selectedStrategyIds = [...current];
    renderStrategyRanking();
    renderStrategyViews();
  }

  function setFocusedStrategy(strategyId) {
    if (!strategyId || strategyId === state.focusedStrategyId) {
      return;
    }
    state.focusedStrategyId = strategyId;
    resetThreadHistoryPage();
    renderStrategyRanking();
    void loadThreadTimeline();
  }

  function renderStrategyRanking() {
    const body = document.getElementById("strategy-ranking-body");
    const rows = state.officialExplorer?.rankings || [];
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">전략 랭킹을 불러오지 못했습니다.</td></tr>';
      return;
    }
    body.innerHTML = rows
      .map((row) => {
        const active = state.selectedStrategyIds.includes(row.strategy_id);
        const focused = row.strategy_id === state.focusedStrategyId;
        return `<tr class="click-row${active ? " selected-row" : ""}" data-strategy-id="${ui.escapeHtml(row.strategy_id)}">
          <td><button type="button" class="focus-toggle${focused ? " active" : ""}" data-focus-strategy-id="${ui.escapeHtml(row.strategy_id)}">${focused ? "Focus" : "Set"}</button></td>
          <td>${active ? '<span class="badge info">선택</span>' : '<span class="badge neutral">대기</span>'}</td>
          <td class="num">${ui.escapeHtml(String(row.rank))}</td>
          <td>${ui.escapeHtml(row.combo_key)}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.full_return_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.mean_segment_return_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.segment_stddev_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.recent_segment_return_pct))}</td>
        </tr>`;
      })
      .join("");
    body.querySelectorAll("[data-strategy-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const strategyId = row.getAttribute("data-strategy-id");
        if (!strategyId) {
          return;
        }
        toggleStrategySelection(strategyId);
      });
    });
    body.querySelectorAll("[data-focus-strategy-id]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const strategyId = button.getAttribute("data-focus-strategy-id");
        if (!strategyId) {
          return;
        }
        setFocusedStrategy(strategyId);
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
        resetThreadHistoryPage();
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
      ui.setText("strategy-kpi-period", "-");
      return;
    }
    const bestReturn = summaries.reduce((best, current) => (current.summary.returnPct > best.summary.returnPct ? current : best));
    ui.setText("strategy-kpi-count", String(summaries.length));
    ui.setText("strategy-kpi-official", state.officialExplorer?.official_profile?.combo_key || "-");
    ui.setText("strategy-kpi-best-return", `${bestReturn.strategy.label} · ${ui.formatPercent(bestReturn.summary.returnPct)}`);
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

  function currentThreadSliceData() {
    if (!state.threadTimeline) {
      return null;
    }
    const slice = currentStrategySlice();
    if (!slice) {
      return null;
    }
    const sessions = state.threadTimeline.sessions.filter(
      (session) => session.session_date >= slice.start && session.session_date <= slice.end,
    );
    const sessionIndexByDate = new Map(sessions.map((session, index) => [session.session_date, index]));
    return {
      slice,
      sessions,
      sessionIndexByDate,
      totalSessions: sessions.length,
      actualStart: sessions[0]?.session_date || null,
      actualEnd: sessions[sessions.length - 1]?.session_date || null,
    };
  }

  function buildThreadTicks(sessions) {
    if (!sessions.length) {
      return [];
    }
    const maxTickCount = 8;
    const targetCount = Math.min(maxTickCount, sessions.length);
    const step = Math.max(1, Math.floor((sessions.length - 1) / Math.max(targetCount - 1, 1)));
    const tickIndexes = [];
    for (let index = 0; index < sessions.length; index += step) {
      tickIndexes.push(index);
    }
    if (tickIndexes[tickIndexes.length - 1] !== sessions.length - 1) {
      tickIndexes.push(sessions.length - 1);
    }
    return [...new Set(tickIndexes)].map((index) => ({
      date: sessions[index].session_date,
      leftPct: sessions.length <= 1 ? 0 : (index / (sessions.length - 1)) * 100,
    }));
  }

  function buildThreadCanvas(sessions) {
    const count = Math.max(sessions.length, 1);
    const sessionPx = threadSessionPxForZoom(state.threadTimelineZoom);
    const width = Math.max(THREAD_TRACK_MIN_WIDTH, count * sessionPx);
    return {
      width,
      sessionPx,
      positionForIndex(index) {
        return (index * sessionPx) + (sessionPx / 2);
      },
      widthForRange(startIndex, endIndex) {
        return Math.max(4, ((endIndex - startIndex) + 1) * sessionPx - 2);
      },
    };
  }

  function threadSessionPxForZoom(zoom) {
    return Math.max(2, Math.round((THREAD_SESSION_PX_BASE * zoom) / 100));
  }

  function clampThreadTimelineZoom(nextZoom) {
    return Math.min(THREAD_TIMELINE_ZOOM_MAX, Math.max(THREAD_TIMELINE_ZOOM_MIN, nextZoom));
  }

  function setThreadTimelineZoom(nextZoom) {
    const clamped = clampThreadTimelineZoom(nextZoom);
    if (Math.abs(clamped - state.threadTimelineZoom) < 0.01) {
      return;
    }
    state.threadTimelineZoom = clamped;
    renderThreadTimeline();
  }

  function currentThreadViewportWindow(scrollPanel) {
    const contentWidth = scrollPanel.scrollWidth || 1;
    const viewportWidth = scrollPanel.clientWidth || 1;
    const widthRatio = Math.min(1, viewportWidth / contentWidth);
    const leftRatio = contentWidth > 0 ? scrollPanel.scrollLeft / contentWidth : 0;
    return {
      leftRatio,
      widthRatio,
      contentWidth,
      viewportWidth,
    };
  }

  function updateThreadZoomViewport(scrollPanel, target) {
    const viewport = target.querySelector(".thread-zoom-viewport");
    if (!(viewport instanceof HTMLElement)) {
      return;
    }
    const { leftRatio, widthRatio } = currentThreadViewportWindow(scrollPanel);
    paintThreadZoomViewport(viewport, { leftRatio, widthRatio });
  }

  function paintThreadZoomViewport(viewport, { leftRatio, widthRatio }) {
    viewport.style.left = `${Math.max(0, Math.min(100, leftRatio * 100))}%`;
    viewport.style.width = `${Math.max(0, Math.min(100, widthRatio * 100))}%`;
  }

  function applyThreadViewportRatios({ leftRatio, widthRatio, viewportWidth, sessionCount }) {
    const desiredWidthRatio = Math.max(0.01, Math.min(1, widthRatio));
    const desiredContentWidth = viewportWidth / desiredWidthRatio;
    const desiredSessionPx = desiredContentWidth / Math.max(sessionCount, 1);
    state.threadTimelineZoom = clampThreadTimelineZoom((desiredSessionPx / THREAD_SESSION_PX_BASE) * 100);

    const actualContentWidth = Math.max(THREAD_TRACK_MIN_WIDTH, Math.max(sessionCount, 1) * threadSessionPxForZoom(state.threadTimelineZoom));
    const actualWidthRatio = Math.min(1, viewportWidth / actualContentWidth);
    const maxLeftRatio = Math.max(0, 1 - actualWidthRatio);
    const normalizedLeftRatio = Math.max(0, Math.min(maxLeftRatio, leftRatio));
    const maxScrollable = Math.max(0, actualContentWidth - viewportWidth);
    const nextScrollLeft = normalizedLeftRatio * actualContentWidth;
    state.threadTimelineScrollLeft = nextScrollLeft;
    state.threadTimelineScrollRatio = maxScrollable > 0 ? nextScrollLeft / maxScrollable : 0;
    renderThreadTimeline();
  }

  function attachThreadZoomBar(target, scrollPanel, sessions) {
    const track = target.querySelector(".thread-zoom-track");
    const viewport = target.querySelector(".thread-zoom-viewport");
    const leftHandle = target.querySelector(".thread-zoom-handle.left");
    const rightHandle = target.querySelector(".thread-zoom-handle.right");
    if (!(track instanceof HTMLElement) || !(viewport instanceof HTMLElement)) {
      return;
    }

    updateThreadZoomViewport(scrollPanel, target);

    const startDrag = (mode, startClientX) => {
      const trackRect = track.getBoundingClientRect();
      const startWindow = currentThreadViewportWindow(scrollPanel);
      const startRightRatio = startWindow.leftRatio + startWindow.widthRatio;
      let pendingWindow = null;
      const minWidthRatio = (() => {
        const maxContentWidth = Math.max(
          THREAD_TRACK_MIN_WIDTH,
          Math.max(sessions.length, 1) * threadSessionPxForZoom(THREAD_TIMELINE_ZOOM_MAX),
        );
        return Math.min(1, startWindow.viewportWidth / maxContentWidth);
      })();
      const maxWidthRatio = (() => {
        const minContentWidth = Math.max(
          THREAD_TRACK_MIN_WIDTH,
          Math.max(sessions.length, 1) * threadSessionPxForZoom(THREAD_TIMELINE_ZOOM_MIN),
        );
        return Math.min(1, startWindow.viewportWidth / minContentWidth);
      })();

      const onMove = (event) => {
        const deltaRatio = trackRect.width > 0 ? (event.clientX - startClientX) / trackRect.width : 0;
        if (mode === "move") {
          const nextLeftRatio = Math.max(0, Math.min(1 - startWindow.widthRatio, startWindow.leftRatio + deltaRatio));
          const nextScrollLeft = nextLeftRatio * startWindow.contentWidth;
          scrollPanel.scrollLeft = nextScrollLeft;
          state.threadTimelineScrollLeft = nextScrollLeft;
          const maxScrollable = scrollPanel.scrollWidth - scrollPanel.clientWidth;
          state.threadTimelineScrollRatio = maxScrollable > 0 ? nextScrollLeft / maxScrollable : 0;
          updateThreadZoomViewport(scrollPanel, target);
          return;
        }

        if (mode === "resize-left") {
          const nextLeftRatio = Math.max(0, Math.min(startRightRatio - minWidthRatio, startWindow.leftRatio + deltaRatio));
          const nextWidthRatio = Math.max(minWidthRatio, Math.min(maxWidthRatio, startRightRatio - nextLeftRatio));
          pendingWindow = { leftRatio: nextLeftRatio, widthRatio: nextWidthRatio };
          paintThreadZoomViewport(viewport, pendingWindow);
          return;
        }

        const nextRightRatio = Math.max(startWindow.leftRatio + minWidthRatio, Math.min(1, startRightRatio + deltaRatio));
        const nextWidthRatio = Math.max(minWidthRatio, Math.min(maxWidthRatio, nextRightRatio - startWindow.leftRatio));
        pendingWindow = { leftRatio: startWindow.leftRatio, widthRatio: nextWidthRatio };
        paintThreadZoomViewport(viewport, pendingWindow);
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (pendingWindow) {
          applyThreadViewportRatios({
            leftRatio: pendingWindow.leftRatio,
            widthRatio: pendingWindow.widthRatio,
            viewportWidth: startWindow.viewportWidth,
            sessionCount: sessions.length,
          });
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };

    track.addEventListener("pointerdown", (event) => {
      if (!(event.target instanceof Element) || event.target.closest(".thread-zoom-viewport")) {
        return;
      }
      event.preventDefault();
      const trackRect = track.getBoundingClientRect();
      const currentWindow = currentThreadViewportWindow(scrollPanel);
      const pointerRatio = trackRect.width > 0 ? (event.clientX - trackRect.left) / trackRect.width : 0;
      const centeredLeftRatio = Math.max(
        0,
        Math.min(1 - currentWindow.widthRatio, pointerRatio - (currentWindow.widthRatio / 2)),
      );
      const nextScrollLeft = centeredLeftRatio * currentWindow.contentWidth;
      scrollPanel.scrollLeft = nextScrollLeft;
      state.threadTimelineScrollLeft = nextScrollLeft;
      const maxScrollable = scrollPanel.scrollWidth - scrollPanel.clientWidth;
      state.threadTimelineScrollRatio = maxScrollable > 0 ? nextScrollLeft / maxScrollable : 0;
      updateThreadZoomViewport(scrollPanel, target);
      startDrag("move", event.clientX);
    });

    viewport.addEventListener("pointerdown", (event) => {
      if (event.target instanceof Element && event.target.closest(".thread-zoom-handle")) {
        return;
      }
      event.preventDefault();
      startDrag("move", event.clientX);
    });

    if (leftHandle instanceof HTMLElement) {
      leftHandle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startDrag("resize-left", event.clientX);
      });
    }

    if (rightHandle instanceof HTMLElement) {
      rightHandle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        startDrag("resize-right", event.clientX);
      });
    }
  }

  function buildThreadAxis(sessions, canvas, { compact = false } = {}) {
    if (!sessions.length) {
      return "";
    }
    const monthStarts = [];
    const yearSpans = [];
    let currentMonth = null;
    let currentYear = null;
    let currentYearStart = 0;

    sessions.forEach((session, index) => {
      const year = session.session_date.slice(0, 4);
      const month = session.session_date.slice(5, 7);
      const monthKey = `${year}-${month}`;
      if (monthKey !== currentMonth) {
        monthStarts.push({ year, month, index });
        currentMonth = monthKey;
      }
      if (year !== currentYear) {
        if (currentYear !== null) {
          yearSpans.push({ year: currentYear, startIndex: currentYearStart, endIndex: index - 1 });
        }
        currentYear = year;
        currentYearStart = index;
      }
    });
    if (currentYear !== null) {
      yearSpans.push({ year: currentYear, startIndex: currentYearStart, endIndex: sessions.length - 1 });
    }

    const yearHtml = yearSpans
      .map((span) => {
        const leftPx = span.startIndex * canvas.sessionPx;
        const widthPx = ((span.endIndex - span.startIndex) + 1) * canvas.sessionPx;
        return `<div class="thread-axis-year" style="left:${leftPx}px;width:${widthPx}px;">${ui.escapeHtml(span.year)}</div>`;
      })
      .join("");

    const monthHtml = monthStarts
      .map((month) => {
        const leftPx = month.index * canvas.sessionPx;
        const centerPx = canvas.positionForIndex(month.index);
        return `<div class="thread-axis-month-line" style="left:${leftPx}px;"></div>
          <div class="thread-axis-month-label" style="left:${centerPx}px;">${ui.escapeHtml(month.month)}</div>`;
      })
      .join("");

    return `<div class="thread-axis${compact ? " compact" : ""}" style="width:${canvas.width}px;">
      <div class="thread-axis-years">${yearHtml}</div>
      <div class="thread-axis-months">${monthHtml}</div>
    </div>`;
  }

  function findThreadInterval(tradeId) {
    if (!state.threadTimeline || !tradeId) {
      return null;
    }
    for (const lane of state.threadTimeline.lanes) {
      const interval = lane.intervals.find((item) => item.trade_id === tradeId);
      if (interval) {
        return { lane, interval };
      }
    }
    return null;
  }

  function findThreadSession(sessionDate) {
    if (!state.threadTimeline || !sessionDate) {
      return null;
    }
    return state.threadTimeline.sessions.find((session) => session.session_date === sessionDate) || null;
  }

  function renderThreadSummary() {
    const payload = state.threadTimeline;
    if (!payload) {
      ui.setText("thread-kpi-working-days", "-");
      ui.setText("thread-kpi-entry-sessions", "-");
      ui.setText("thread-kpi-exit-sessions", "-");
      ui.setText("thread-kpi-free-days", "-");
      ui.setText("thread-kpi-full-days", "-");
      return;
    }
    const sliceData = currentThreadSliceData();
    const sessions = sliceData?.sessions || [];
    const workingDays = sessions.length;
    const entrySessions = sessions.filter((session) => session.entries > 0).length;
    const exitSessions = sessions.filter((session) => session.exit_count > 0).length;
    const freeDays = sessions.filter((session) => session.open_threads === 0).length;
    const fullDays = sessions.filter((session) => session.open_threads === payload.meta.thread_count).length;
    ui.setText("thread-kpi-working-days", String(workingDays));
    ui.setText("thread-kpi-entry-sessions", String(entrySessions));
    ui.setText("thread-kpi-exit-sessions", String(exitSessions));
    ui.setText("thread-kpi-free-days", String(freeDays));
    ui.setText("thread-kpi-full-days", String(fullDays));
  }

  function aggregateTimelineIntervals(payload) {
    return payload.lanes
      .flatMap((lane) => lane.intervals.map((interval) => ({ ...interval, laneLabel: threadLabel(lane.thread_id) })))
      .sort((left, right) => {
        if (left.start_date !== right.start_date) {
          return left.start_date.localeCompare(right.start_date);
        }
        const leftEnd = left.end_date || "9999-12-31";
        const rightEnd = right.end_date || "9999-12-31";
        if (leftEnd !== rightEnd) {
          return leftEnd.localeCompare(rightEnd);
        }
        return left.thread_id - right.thread_id;
      });
  }

  function currentThreadTradeRows() {
    if (!state.threadTimeline) {
      return [];
    }
    const sliceData = currentThreadSliceData();
    if (!sliceData || !sliceData.actualStart || !sliceData.actualEnd) {
      return [];
    }
    return state.threadTimeline.lanes
      .flatMap((lane) =>
        lane.intervals
          .filter((interval) => {
            const rawEnd = interval.end_date || state.threadTimeline.meta.period_end;
            return interval.start_date <= sliceData.actualEnd && rawEnd >= sliceData.actualStart;
          })
          .map((interval) => ({
            lane,
            interval,
            activityDate: interval.end_date || interval.visible_end_date || interval.start_date,
          })),
      )
      .sort((left, right) => {
        if (left.activityDate !== right.activityDate) {
          return right.activityDate.localeCompare(left.activityDate);
        }
        if (left.interval.start_date !== right.interval.start_date) {
          return right.interval.start_date.localeCompare(left.interval.start_date);
        }
        return left.interval.thread_id - right.interval.thread_id;
      });
  }

  function threadTradeStatusLabel(interval) {
    if (interval.status === "OPEN") {
      return "보유중";
    }
    return threadReasonLabel(interval.close_reason);
  }

  function threadTradeStatusBadge(interval) {
    if (interval.status === "OPEN") {
      return "warning";
    }
    if (interval.close_reason === "TAKE_PROFIT") {
      return "success";
    }
    return "danger";
  }

  function renderThreadTimeline() {
    const target = document.getElementById("thread-timeline-card");
    const payload = state.threadTimeline;
    const sliceData = currentThreadSliceData();
    const existingScrollPanel = target.querySelector(".thread-scroll-panel");
    if (existingScrollPanel) {
      state.threadTimelineScrollLeft = existingScrollPanel.scrollLeft;
      const maxScrollable = existingScrollPanel.scrollWidth - existingScrollPanel.clientWidth;
      state.threadTimelineScrollRatio = maxScrollable > 0 ? existingScrollPanel.scrollLeft / maxScrollable : 0;
    }
    if (!payload || !sliceData || !sliceData.sessions.length) {
      state.threadTimelineScrollLeft = 0;
      state.threadTimelineScrollRatio = 0;
      target.innerHTML = '<div class="thread-empty">선택 구간에 thread timeline 데이터가 없습니다.</div>';
      return;
    }
    const canvas = buildThreadCanvas(sliceData.sessions);
    const actualStart = sliceData.actualStart;
    const actualEnd = sliceData.actualEnd;
    const sourceLanes = state.threadExpanded
      ? [
          { thread_id: 0, label: "Total", intervals: aggregateTimelineIntervals(payload), controlOnly: false },
          ...payload.lanes,
        ]
      : [{ thread_id: 0, label: "Total", intervals: aggregateTimelineIntervals(payload), controlOnly: false }];
    const labelRowsHtml = sourceLanes
      .map((lane) => {
        const controlMarkup =
          lane.thread_id === 0
            ? `<button type="button" class="thread-toggle-inline" id="thread-inline-toggle" aria-expanded="${state.threadExpanded ? "true" : "false"}">${state.threadExpanded ? "▲" : "▼"}</button>`
            : "";
        return `<div class="thread-label-row"><span>${ui.escapeHtml(laneDisplayLabel(lane))}</span>${controlMarkup}</div>`;
      })
      .join("");
    const trackRowsHtml = sourceLanes
      .map((lane) => {
        const allowTradeDrilldown = lane.thread_id !== 0;
        const trackItems = lane.intervals
          .map((interval) => {
            const rawEnd = interval.end_date || payload.meta.period_end;
            if (interval.start_date > actualEnd || rawEnd < actualStart) {
              return "";
            }
            const visibleStart = interval.start_date < actualStart ? actualStart : interval.start_date;
            const visibleEnd = rawEnd > actualEnd ? actualEnd : rawEnd;
            const startIndex = sliceData.sessionIndexByDate.get(visibleStart);
            const endIndex = sliceData.sessionIndexByDate.get(visibleEnd);
            if (startIndex == null || endIndex == null) {
              return "";
            }
            const leftPx = startIndex * canvas.sessionPx;
            const widthPx = canvas.widthForRange(startIndex, endIndex);
            const drawerDate =
              interval.end_date && interval.end_date >= actualStart && interval.end_date <= actualEnd ? interval.end_date : visibleEnd;
            const laneLabel = interval.laneLabel || laneDisplayLabel(lane);
            const title = intervalHoverTitle(laneLabel, interval);
            if (!allowTradeDrilldown) {
              return `<div class="thread-box thread-box-static ${threadReasonClass(interval)}" style="left:${leftPx}px;width:${widthPx}px;" title="${ui.escapeHtml(title)}"></div>`;
            }
            return `<button type="button" class="thread-box ${threadReasonClass(interval)}" style="left:${leftPx}px;width:${widthPx}px;" data-thread-session-date="${ui.escapeHtml(drawerDate)}" data-thread-trade-id="${ui.escapeHtml(interval.trade_id)}" data-thread-drawer-kind="trade" title="${ui.escapeHtml(title)}"></button>`;
          })
          .join("");
        const showEventMarkers = lane.thread_id === 0;
        const sessionMarkers = showEventMarkers
          ? sliceData.sessions
              .filter((session) => session.entries > 0 || session.exit_count > 0)
              .map((session) => {
                const markerIndex = sliceData.sessionIndexByDate.get(session.session_date);
                const markerLeftPx = canvas.positionForIndex(markerIndex);
                return `${session.entries > 0 ? `<button type="button" class="thread-entry-marker timeline-entry" style="left:${markerLeftPx}px" data-thread-session-date="${ui.escapeHtml(session.session_date)}" data-thread-drawer-kind="entry-session" title="${ui.escapeHtml(entryMarkerTitle(session))}">▲</button>` : ""}
                  ${session.exit_count > 0 ? `<button type="button" class="thread-exit-marker timeline-exit" style="left:${markerLeftPx}px" data-thread-session-date="${ui.escapeHtml(session.session_date)}" data-thread-drawer-kind="exit-session" title="${ui.escapeHtml(exitMarkerTitle(session))}">${ui.escapeHtml(String(session.exit_count))}</button>` : ""}`;
              })
              .join("")
          : "";
        return `<div class="thread-track-row">
          <div class="thread-lane-track${showEventMarkers ? " collapsed-track" : ""}${lane.controlOnly ? " control-only-track" : ""}" style="width:${canvas.width}px;">${trackItems}${sessionMarkers}</div>
        </div>`;
      })
      .join("");
    target.innerHTML = `<div class="thread-shell">
      <div class="thread-fixed-column">
        <div class="thread-fixed-spacer"></div>
        ${labelRowsHtml}
      </div>
      <div class="thread-scroll-region">
        <div class="thread-scroll-panel">
          ${buildThreadAxis(sliceData.sessions, canvas, { compact: true })}
          <div class="thread-track-column">
            ${trackRowsHtml}
          </div>
        </div>
        <div class="thread-zoom-strip" aria-label="Thread timeline zoom bar">
          <div class="thread-zoom-track">
            <div class="thread-zoom-viewport">
              <button type="button" class="thread-zoom-handle left" aria-label="Zoom left handle"></button>
              <div class="thread-zoom-body">
                <span class="thread-zoom-grip"></span>
              </div>
              <button type="button" class="thread-zoom-handle right" aria-label="Zoom right handle"></button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
    const scrollPanel = target.querySelector(".thread-scroll-panel");
    if (scrollPanel) {
      const maxScrollable = scrollPanel.scrollWidth - scrollPanel.clientWidth;
      scrollPanel.scrollLeft = maxScrollable > 0
        ? maxScrollable * state.threadTimelineScrollRatio
        : state.threadTimelineScrollLeft;
      scrollPanel.addEventListener("scroll", () => {
        state.threadTimelineScrollLeft = scrollPanel.scrollLeft;
        const currentMaxScrollable = scrollPanel.scrollWidth - scrollPanel.clientWidth;
        state.threadTimelineScrollRatio = currentMaxScrollable > 0 ? scrollPanel.scrollLeft / currentMaxScrollable : 0;
        updateThreadZoomViewport(scrollPanel, target);
      }, { passive: true });
      updateThreadZoomViewport(scrollPanel, target);
      attachThreadZoomBar(target, scrollPanel, sliceData.sessions);
    }
    const inlineToggle = document.getElementById("thread-inline-toggle");
    if (inlineToggle) {
      inlineToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        state.threadExpanded = !state.threadExpanded;
        renderThreadViews();
      });
    }
    target.querySelectorAll("[data-thread-session-date]").forEach((button) => {
      button.addEventListener("click", () => {
        openThreadDrawer({
          sessionDate: button.getAttribute("data-thread-session-date"),
          tradeId: button.getAttribute("data-thread-trade-id"),
          kind: button.getAttribute("data-thread-drawer-kind"),
        });
      });
    });
  }

  function renderThreadHistory() {
    const body = document.getElementById("thread-history-body");
    const meta = document.getElementById("thread-history-meta");
    const pageStatus = document.getElementById("thread-history-page-status");
    const pageSizeSelect = document.getElementById("thread-history-page-size");
    const prevButton = document.getElementById("thread-history-prev");
    const nextButton = document.getElementById("thread-history-next");
    if (!body || !meta || !pageStatus || !pageSizeSelect || !prevButton || !nextButton) {
      return;
    }

    const rows = currentThreadTradeRows();
    const pageSize = Number(pageSizeSelect.value || state.threadHistoryPageSize || 20);
    state.threadHistoryPageSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 20;
    const totalPages = Math.max(1, Math.ceil(rows.length / state.threadHistoryPageSize));
    state.threadHistoryPage = Math.max(1, Math.min(totalPages, state.threadHistoryPage));
    const startIndex = (state.threadHistoryPage - 1) * state.threadHistoryPageSize;
    const pageRows = rows.slice(startIndex, startIndex + state.threadHistoryPageSize);

    if (!rows.length) {
      meta.textContent = "총 0건";
      body.innerHTML = '<tr><td colspan="12" class="muted" style="text-align:center">선택 구간에 표시할 거래 이력이 없습니다.</td></tr>';
    } else {
      meta.textContent = `총 ${ui.formatNumber(rows.length)}건`;
      body.innerHTML = pageRows
        .map(({ lane, interval }, pageIndex) => {
          const drawerDate = interval.end_date || interval.start_date;
          const rowNumber = startIndex + pageIndex + 1;
          return `<tr>
            <td class="mono thread-history-index-col">${ui.escapeHtml(String(rowNumber))}</td>
            <td class="mono thread-history-thread-col">${ui.escapeHtml(laneDisplayLabel(lane))}</td>
            <td class="thread-history-status-col"><span class="badge ${threadTradeStatusBadge(interval)}">${ui.escapeHtml(threadTradeStatusLabel(interval))}</span></td>
            <td class="mono">${ui.escapeHtml(interval.start_date)}</td>
            <td class="mono">${ui.escapeHtml(interval.end_date || "-")}</td>
            <td class="num">${ui.escapeHtml(formatPriceValue(interval.entry_price))}</td>
            <td class="num">${ui.escapeHtml(interval.exit_price ? formatPriceValue(interval.exit_price) : "-")}</td>
            <td class="num mono">${ui.escapeHtml(interval.shares || "-")}</td>
            <td class="num">${ui.escapeHtml(interval.pnl ? ui.formatMoney(interval.pnl) : "-")}</td>
            <td class="num">${ui.escapeHtml(interval.return_pct ? ui.formatPercent(interval.return_pct) : "-")}</td>
            <td class="num">${ui.escapeHtml(formatHoldingSessions(interval.holding_sessions))}</td>
            <td><button class="thread-history-detail-btn" type="button" aria-label="상세 보기" title="상세 보기" data-thread-session-date="${ui.escapeHtml(drawerDate)}" data-thread-trade-id="${ui.escapeHtml(interval.trade_id)}" data-thread-drawer-kind="trade"><svg class="thread-history-detail-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="6.5" cy="6.5" r="4.25"></circle><path d="M9.8 9.8L14.2 14.2"></path></svg></button></td>
          </tr>`;
        })
        .join("");
    }

    pageSizeSelect.value = String(state.threadHistoryPageSize);
    pageStatus.textContent = `${state.threadHistoryPage} / ${totalPages}`;
    prevButton.disabled = state.threadHistoryPage <= 1;
    nextButton.disabled = state.threadHistoryPage >= totalPages;

    pageSizeSelect.onchange = () => {
      state.threadHistoryPageSize = Number(pageSizeSelect.value || 20);
      resetThreadHistoryPage();
      renderThreadHistory();
    };
    prevButton.onclick = () => {
      if (state.threadHistoryPage <= 1) {
        return;
      }
      state.threadHistoryPage -= 1;
      renderThreadHistory();
    };
    nextButton.onclick = () => {
      if (state.threadHistoryPage >= totalPages) {
        return;
      }
      state.threadHistoryPage += 1;
      renderThreadHistory();
    };
    body.querySelectorAll("[data-thread-session-date]").forEach((button) => {
      button.addEventListener("click", () => {
        openThreadDrawer({
          sessionDate: button.getAttribute("data-thread-session-date"),
          tradeId: button.getAttribute("data-thread-trade-id"),
          kind: button.getAttribute("data-thread-drawer-kind"),
        });
      });
    });
  }

  function findThreadIntervalSummary(tradeId) {
    const selectedTrade = findThreadInterval(tradeId);
    return selectedTrade ? selectedTrade.interval : null;
  }

  function threadExitDetailTitle(reason) {
    return reason === "TAKE_PROFIT" ? "익절 상세" : "손절 상세";
  }

  function intervalHoverTitle(laneLabel, interval) {
    const dateRange = `${interval.start_date} ~ ${interval.end_date || "OPEN"}`;
    if (interval.status === "OPEN") {
      return `${laneLabel} · ${dateRange} · 보유중`;
    }
    const pnl = parseMoney(interval.pnl);
    if (interval.close_reason === "TAKE_PROFIT") {
      return `${laneLabel} · ${dateRange} · 벌어들인 수익 ${ui.formatMoney(pnl)}`;
    }
    return `${laneLabel} · ${dateRange} · 손실 총액 ${ui.formatMoney(Math.abs(pnl))}`;
  }

  function renderThreadTradeDetail(lane, interval) {
    return `<section class="thread-detail-card">
      <h4>${ui.escapeHtml(threadReasonLabel(interval.close_reason))} 상세</h4>
      <div class="thread-detail-grid">
        <div class="meta-item"><span>Thread</span><strong>${ui.escapeHtml(laneDisplayLabel(lane))}</strong></div>
        <div class="meta-item"><span>배정 자본금</span><strong>${ui.escapeHtml(ui.formatMoney(interval.invested_amount))}</strong></div>
        <div class="meta-item"><span>진입 날짜</span><strong class="mono">${ui.escapeHtml(interval.start_date)}</strong></div>
        <div class="meta-item"><span>진입 가격</span><strong>${ui.escapeHtml(formatPriceValue(interval.entry_price))}</strong></div>
        <div class="meta-item"><span>진입 수량</span><strong class="mono">${ui.escapeHtml(interval.shares)}</strong></div>
        <div class="meta-item"><span>종료 날짜</span><strong class="mono">${ui.escapeHtml(interval.end_date || "-")}</strong></div>
        <div class="meta-item"><span>종료 가격</span><strong>${ui.escapeHtml(interval.exit_price ? formatPriceValue(interval.exit_price) : "-")}</strong></div>
        <div class="meta-item"><span>PNL</span><strong>${ui.escapeHtml(interval.pnl ? ui.formatMoney(interval.pnl) : "-")}</strong></div>
        <div class="meta-item"><span>Return</span><strong>${ui.escapeHtml(interval.return_pct ? ui.formatPercent(interval.return_pct) : "-")}</strong></div>
        <div class="meta-item"><span>보유 기간</span><strong>${ui.escapeHtml(formatHoldingSessions(interval.holding_sessions))}</strong></div>
      </div>
    </section>`;
  }

  function renderThreadEntrySessionDetail(session) {
    const cards = (session.entry_batch || [])
      .map(
        (row) => `<section class="thread-detail-card thread-batch-card">
          <h4>매수 상세</h4>
          <div class="thread-detail-grid">
            <div class="meta-item"><span>Thread</span><strong>${ui.escapeHtml(threadLabel(row.thread_id))}</strong></div>
            <div class="meta-item"><span>배정 자본금</span><strong>${ui.escapeHtml(ui.formatMoney(row.invested_amount))}</strong></div>
            <div class="meta-item"><span>진입 날짜</span><strong class="mono">${ui.escapeHtml(session.session_date)}</strong></div>
            <div class="meta-item"><span>진입 가격</span><strong>${ui.escapeHtml(formatPriceValue(row.entry_price))}</strong></div>
            <div class="meta-item"><span>진입 수량</span><strong class="mono">${ui.escapeHtml(row.shares)}</strong></div>
          </div>
        </section>`,
      )
      .join("");
    return `<section class="thread-detail-stack">
      <div class="thread-batch-cards">${cards}</div>
    </section>`;
  }

  function renderThreadExitSessionDetail(session) {
    const totalPnl = (session.exit_batch || []).reduce((sum, row) => sum + parseMoney(row.pnl), 0);
    const cards = (session.exit_batch || [])
      .map((row) => {
        const interval = findThreadIntervalSummary(row.trade_id);
        return `<section class="thread-detail-card thread-batch-card">
          <h4>${ui.escapeHtml(threadExitDetailTitle(row.close_reason))}</h4>
          <div class="thread-detail-grid">
            <div class="meta-item"><span>Thread</span><strong>${ui.escapeHtml(threadLabel(row.thread_id))}</strong></div>
            <div class="meta-item"><span>배정 자본금</span><strong>${ui.escapeHtml(interval ? ui.formatMoney(interval.invested_amount) : "-")}</strong></div>
            <div class="meta-item"><span>진입 날짜</span><strong class="mono">${ui.escapeHtml(interval?.start_date || "-")}</strong></div>
            <div class="meta-item"><span>진입 가격</span><strong>${ui.escapeHtml(formatPriceValue(row.entry_price))}</strong></div>
            <div class="meta-item"><span>진입 수량</span><strong class="mono">${ui.escapeHtml(interval?.shares || "-")}</strong></div>
            <div class="meta-item"><span>종료 가격</span><strong>${ui.escapeHtml(formatPriceValue(row.exit_price))}</strong></div>
            <div class="meta-item"><span>PNL</span><strong>${ui.escapeHtml(ui.formatMoney(row.pnl))}</strong></div>
            <div class="meta-item"><span>Return</span><strong>${ui.escapeHtml(ui.formatPercent(row.return_pct))}</strong></div>
            <div class="meta-item"><span>보유 기간</span><strong>${ui.escapeHtml(formatHoldingSessions(row.holding_sessions))}</strong></div>
          </div>
        </section>`;
      })
      .join("");
    return `<section class="thread-detail-stack">
      <section class="thread-detail-card thread-session-card">
        <h4>매도</h4>
        <div class="thread-detail-grid">
          <div class="meta-item"><span>세션 날짜</span><strong class="mono">${ui.escapeHtml(session.session_date)}</strong></div>
          <div class="meta-item"><span>종가</span><strong>${ui.escapeHtml(formatPriceValue(session.close_price))}</strong></div>
          <div class="meta-item"><span>매도 수</span><strong>${ui.escapeHtml(String(session.exit_count))}</strong></div>
        </div>
      </section>
      <div class="thread-batch-cards">${cards}</div>
      <div class="thread-detail-total">
        <span>총 벌어들인 금액</span>
        <strong>${ui.escapeHtml(ui.formatMoney(totalPnl))}</strong>
      </div>
    </section>`;
  }

  function renderThreadDrawer() {
    const subtitle = document.getElementById("thread-drawer-subtitle");
    const body = document.getElementById("thread-drawer-body");
    if (!state.threadTimeline) {
      subtitle.textContent = "세션 또는 trade를 선택하면 상세가 표시됩니다.";
      body.innerHTML = '<div class="stack-row"><span class="title">상세 대기</span><span class="badge neutral">idle</span></div>';
      return;
    }
    const selectedTrade = state.threadDrawer.tradeId ? findThreadInterval(state.threadDrawer.tradeId) : null;
    const selectedSession = state.threadDrawer.sessionDate ? findThreadSession(state.threadDrawer.sessionDate) : null;
    if (selectedTrade) {
      const { lane, interval } = selectedTrade;
      subtitle.textContent = `${state.threadTimeline.meta.strategy_id} · ${interval.end_date || interval.start_date}`;
      body.innerHTML = renderThreadTradeDetail(lane, interval);
      return;
    }
    if (selectedSession && state.threadDrawer.kind === "entry-session") {
      subtitle.textContent = `${state.threadTimeline.meta.strategy_id} · ${selectedSession.session_date} · 매수`;
      body.innerHTML = renderThreadEntrySessionDetail(selectedSession);
      return;
    }
    if (selectedSession && state.threadDrawer.kind === "exit-session") {
      subtitle.textContent = `${state.threadTimeline.meta.strategy_id} · ${selectedSession.session_date} · 매도`;
      body.innerHTML = renderThreadExitSessionDetail(selectedSession);
      return;
    }
    if (!selectedTrade && !selectedSession) {
      subtitle.textContent = `${state.threadTimeline.meta.strategy_id} detail`;
      body.innerHTML = '<div class="stack-row"><span class="title">매수 마커, 매도 마커, 또는 trade를 선택하면 상세가 표시됩니다.</span><span class="badge neutral">idle</span></div>';
      return;
    }
    subtitle.textContent = `${state.threadTimeline.meta.strategy_id} detail`;
    body.innerHTML = '<div class="stack-row"><span class="title">선택한 세션에 표시할 상세 데이터가 없습니다.</span><span class="badge neutral">idle</span></div>';
  }

  function openThreadDrawer({ sessionDate = null, tradeId = null, kind = null }) {
    state.threadDrawer = { sessionDate, tradeId, kind };
    renderThreadDrawer();
    const drawer = document.getElementById("thread-drawer");
    drawer.classList.add("visible");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeThreadDrawer() {
    const drawer = document.getElementById("thread-drawer");
    drawer.classList.remove("visible");
    drawer.setAttribute("aria-hidden", "true");
  }

  function renderThreadViews() {
    renderThreadSummary();
    renderThreadTimeline();
    renderThreadHistory();
    renderThreadDrawer();
  }

  function renderStrategyRollingChart() {
    const slice = currentStrategySlice();
    const rollWindow = document.getElementById("strategy-roll-window");
    const windowSize = Number((rollWindow && rollWindow.value) || 252);
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
      setEmptyChart("strategy-rolling-chart", "");
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
    const slice = currentStrategySlice();
    const strategies = state.selectedStrategyIds.map((strategyId) => getStrategyById(strategyId)).filter(Boolean);
    document.getElementById("strategy-segment-head").innerHTML = `<tr>
      <th>구간</th>
      ${strategies.map((strategy) => `<th class="num">${ui.escapeHtml(strategy.label)}</th>`).join("")}
    </tr>`;
    const rows = [
      {
        label: "전체 구간",
        period: formatSessionPeriod(state.strategyExplorer.meta.period_start, state.strategyExplorer.meta.period_end),
        resolve(strategy) {
          const returnPct = Number(strategy.metrics?.total_return_pct);
          const maxDrawdownPct = Number(strategy.metrics?.max_drawdown_pct);
          if (!Number.isFinite(returnPct) || !Number.isFinite(maxDrawdownPct)) {
            return null;
          }
          return { returnPct, maxDrawdownPct };
        },
      },
      {
        label: "선택 구간",
        period: slice ? formatSessionPeriod(slice.start, slice.end) : "-",
        resolve(strategy) {
          if (!slice) {
            return null;
          }
          const series = rebaseDaily(strategyDailySlice(strategy, slice.start, slice.end));
          const summary = summarizeRebasedSlice(series);
          const drawdown = summarizeSliceDrawdown(series);
          if (!summary || !drawdown) {
            return null;
          }
          return {
            returnPct: summary.returnPct,
            maxDrawdownPct: drawdown.maxDrawdownPct,
          };
        },
      },
    ];
    document.getElementById("strategy-segment-body").innerHTML = rows
      .map((row) => {
        const cells = strategies
          .map((strategy) => {
            const result = row.resolve(strategy);
            if (!result) {
              return '<td class="num muted">-</td>';
            }
            return `<td>
              <strong>${ui.escapeHtml(ui.formatPercent(result.returnPct))}</strong>
              <small>(${ui.escapeHtml(`MDD ${ui.formatPercent(result.maxDrawdownPct)}`)})</small>
            </td>`;
          })
          .join("");
        return `<tr>
          <td>
            <strong>${ui.escapeHtml(row.label)}</strong>
            <small>${ui.escapeHtml(row.period)}</small>
          </td>
          ${cells}
        </tr>`;
      })
      .join("");
  }

  function renderStrategyViews() {
    renderStrategyEquityChart();
    renderStrategyDrawdownChart();
    renderThreadViews();
  }

  function renderOfficialMeta() {
    if (!state.officialExplorer) {
      return;
    }
    const selection = state.officialExplorer;
    ui.setText("official-combo", selection.official_profile.combo_key);
    ui.setText("official-ranking-basis", selection.meta.selection_basis);
  }

  function renderOfficialMatrix() {
    const body = document.getElementById("official-matrix-body");
    if (!body) {
      return;
    }
    const payload = state.officialMatrix;
    if (!payload) {
      body.innerHTML = '<tr><td class="muted" style="text-align:center">공식 매트릭스를 불러오지 못했습니다.</td></tr>';
      return;
    }
    const comboKeys = comboOrder(payload.combos);
    const officialCombo = payload.meta.official_combo_key;
    const header = `<tr>
      <th class="sticky-1">연도</th>
      <th class="sticky-2 benchmark-col">연간 주가 변화</th>
      <th class="sticky-3 benchmark-col">SOXL</th>
      ${comboKeys
        .map((comboKey) => `<th class="num${comboKey === officialCombo ? " representative-col" : ""}">${comboKey.replace("x", "/")}</th>`)
        .join("")}
    </tr>`;
    const yearlyRows = payload.benchmark.yearly
      .map((benchmarkRow) => {
        const values = comboKeys.map((comboKey) => Number(payload.combos[comboKey].yearly_returns_pct[String(benchmarkRow.year)]));
        const rowMax = Math.max(...values);
        return `<tr>
          <td class="sticky-1 mono">${benchmarkRow.year}</td>
          <td class="sticky-2 benchmark-col mono">${ui.escapeHtml(benchmarkRow.price_change)}</td>
          <td class="sticky-3 benchmark-col num">${ui.escapeHtml(matrixPercent(benchmarkRow.return_pct))}</td>
          ${comboKeys
            .map((comboKey) => {
              const value = Number(payload.combos[comboKey].yearly_returns_pct[String(benchmarkRow.year)]);
              const representative = comboKey === officialCombo ? " representative-col" : "";
              const highlight = value === rowMax ? " max-cell" : "";
              return `<td class="num${representative}${highlight}">${ui.escapeHtml(matrixPercent(value))}</td>`;
            })
            .join("")}
        </tr>`;
      })
      .join("");
    const aggregateRows = [
      { label: "표준편차", family: "per-year", benchmark: "", comboSection: "stats_pct", comboField: "stddev" },
      { label: "전체평균", family: "all years", benchmark: "", comboSection: "stats_pct", comboField: "avg_all" },
      { label: "평균5년", family: "last 5y", benchmark: "", comboSection: "stats_pct", comboField: "avg_5y" },
      { label: "단리전체", family: "total", benchmark: "", comboSection: "simple_returns_pct", comboField: "total" },
      { label: "단리5년", family: "y5", benchmark: "", comboSection: "simple_returns_pct", comboField: "y5" },
      { label: "단리3년", family: "y3", benchmark: "", comboSection: "simple_returns_pct", comboField: "y3" },
      { label: "복리전체", family: "total", benchmark: "", comboSection: "compound_returns_pct", comboField: "total" },
      { label: "복리5년", family: "y5", benchmark: "", comboSection: "compound_returns_pct", comboField: "y5" },
      { label: "복리3년", family: "y3", benchmark: "", comboSection: "compound_returns_pct", comboField: "y3" },
      { label: "복리1년", family: "y1", benchmark: "", comboSection: "compound_returns_pct", comboField: "y1" },
    ]
      .map((row) => `<tr>
        <td class="sticky-1 aggregate-label">${ui.escapeHtml(row.label)}</td>
        <td class="sticky-2 aggregate-label">${ui.escapeHtml(row.family)}</td>
        <td class="sticky-3 benchmark-col num">${row.benchmark === "" ? "-" : ui.escapeHtml(matrixPercent(row.benchmark))}</td>
        ${comboKeys
          .map((comboKey) => {
            const representative = comboKey === officialCombo ? " representative-col" : "";
            const value = payload.combos[comboKey][row.comboSection][row.comboField];
            return `<td class="num${representative}">${ui.escapeHtml(matrixPercent(value))}</td>`;
          })
          .join("")}
      </tr>`)
      .join("");
    body.innerHTML = `${header}${yearlyRows}<tr class="section-row"><td colspan="${3 + comboKeys.length}">aggregate rows</td></tr>${aggregateRows}`;
  }

  function renderStrategyExplorer(payload) {
    state.strategyExplorer = payload;
    ensureStrategySelection();
    const activePreset = payload.meta.slice_presets.find((preset) => preset.preset_id === state.selectedStrategyPresetId) || payload.meta.slice_presets[0];
    if (activePreset) {
      setStrategyDateInputs(activePreset.start, activePreset.end);
    }
    renderStrategySlicePresets();
    setNotice("strategy-meta-note", "");
    renderStrategyRanking();
    renderStrategyViews();
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
    ui.setText("sweep-kpi-pareto", `${payload.summary.pareto_return_mdd_count} / ${payload.summary.pareto_return_stability_count}`);
    document.getElementById("sweep-meta-note").textContent = "";
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
      target.innerHTML = '<div class="stack-row"><span class="title">현재 필터에서 추가 메모 없음</span><span class="badge success">ok</span></div>';
      return;
    }
    target.innerHTML = rows.map((warning) => `<div class="warning-row"><span class="title">${ui.escapeHtml(warning)}</span></div>`).join("");
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
      ui.setText("sweep-artifact-id", "-");
      document.getElementById("sweep-meta-note").textContent = "최신 스윕 산출물이 없습니다. Codex에서 생성한 뒤 다시 읽어오세요.";
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
    const filteredRows = currentSweepRows();
    renderSweepSummary(payload, filteredRows);
    renderSweepWarnings(payload, filteredRows);
    renderSweepScatter(filteredRows);
    renderSweepBox(filteredRows);
    renderSweepParcoords(filteredRows);
    renderSweepTable(filteredRows);
  }

  async function loadThreadTimeline() {
    if (!state.focusedStrategyId || !state.dataStatus) {
      state.threadTimeline = null;
      resetThreadHistoryPage();
      renderThreadViews();
      return;
    }
    const csvPath = state.dataStatus.snapshot_path || "";
    const executionModel = state.strategyExplorer?.meta?.execution_model || "ideal_same_close";
    const priceBasis = state.strategyExplorer?.meta?.price_basis || "adjusted_close";
    const cacheKey = [state.focusedStrategyId, csvPath, executionModel, priceBasis].join(":");
    if (state.threadTimelineCache[cacheKey]) {
      state.threadTimeline = state.threadTimelineCache[cacheKey];
      resetThreadHistoryPage();
      renderThreadViews();
      return;
    }
    const params = new URLSearchParams({
      profileId: state.profileId,
      csvPath,
      strategyId: state.focusedStrategyId,
      executionModel,
      priceBasis,
    });
    try {
      const payload = await ui.fetchJson(`/api/backtests/thread-timeline?${params.toString()}`);
      state.threadTimelineCache[cacheKey] = payload;
      if (state.focusedStrategyId !== payload.meta.strategy_id) {
        return;
      }
      state.threadTimeline = payload;
      resetThreadHistoryPage();
      renderThreadViews();
    } catch (error) {
      state.threadTimeline = null;
      resetThreadHistoryPage();
      renderThreadViews();
    }
  }

  async function loadStrategyData() {
    const csvPath = state.dataStatus?.snapshot_path || "";
    const workspace = currentWorkspace();
    const requests = [
      ui.fetchJson(`/api/backtests/strategy-explorer?${new URLSearchParams({ profileId: state.profileId, csvPath, executionModel: "ideal_same_close", priceBasis: "adjusted_close" }).toString()}`),
    ];
    if (workspace?.referenceMode === "soxl_reference") {
      requests.unshift(
        ui.fetchJson(`/api/backtests/official-explorer?${new URLSearchParams({ profileId: state.profileId, csvPath }).toString()}`),
      );
    }
    const [firstPayload, secondPayload] = await Promise.all(requests);
    state.officialExplorer = workspace?.referenceMode === "soxl_reference" ? firstPayload : null;
    state.officialMatrix = null;
    renderOfficialMeta();
    renderStrategyExplorer(workspace?.referenceMode === "soxl_reference" ? secondPayload : firstPayload);
    await loadThreadTimeline();
  }

  async function loadLatestSweep() {
    const csvPath = state.dataStatus?.snapshot_path || "";
    const params = new URLSearchParams({
      profileId: state.profileId,
      csvPath,
      sweepId: "core6_v1",
      executionModel: document.getElementById("sweep-model").value || "next_open",
      priceBasis: document.getElementById("sweep-price-basis").value || "adjusted_close",
    });
    const artifact = await ui.fetchJson(`/api/backtests/sweeps/latest?${params.toString()}`);
    renderSweepArtifact(artifact);
  }

  async function bootstrap() {
    const workspacePayload = await ui.fetchJson("/api/workspaces");
    state.workspaces = workspacePayload.workspaces || [];
    const defaultWorkspace = state.workspaces.find((workspace) => workspace.workspaceId === workspacePayload.defaultWorkspaceId) || state.workspaces[0];
    const requestedSlug = currentWorkspaceSlug();
    const workspace =
      state.workspaces.find((item) => item.routeSlug === requestedSlug) || defaultWorkspace;
    if (!workspace) {
      throw new Error("No workspace definitions available");
    }
    if (requestedSlug !== workspace.routeSlug) {
      window.location.replace(`/backtests/${workspace.routeSlug}`);
      return;
    }
    state.workspaceId = workspace.workspaceId;
    renderWorkspaceNav();
    renderWorkspaceSummary(workspace);
    const [profilesPayload, dataStatus] = await Promise.all([
      ui.fetchJson(`/api/profiles?${new URLSearchParams({ workspaceId: workspace.workspaceId }).toString()}`),
      ui.fetchJson(`/api/data/status?${new URLSearchParams({ workspaceId: workspace.workspaceId }).toString()}`),
    ]);
    state.profiles = profilesPayload.profiles || [];
    state.profileId = profilesPayload.defaultProfileId || state.profileId;
    renderProfileSummary(currentProfile());
    renderDataStatus(dataStatus);
    await Promise.all([loadStrategyData(), loadLatestSweep()]);
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.getAttribute("data-tab");
        if (tabId) {
          activateTab(tabId);
        }
      });
    });

    bootstrap().catch((error) => {
      setNotice("strategy-meta-note", error.message);
      document.getElementById("sweep-meta-note").textContent = error.message;
    });

    document.getElementById("strategy-apply-button").addEventListener("click", () => {
      state.selectedStrategyPresetId = "custom";
      resetThreadHistoryPage();
      renderStrategySlicePresets();
      renderStrategyViews();
    });

    const strategyRollWindow = document.getElementById("strategy-roll-window");
    if (strategyRollWindow) {
      strategyRollWindow.addEventListener("change", () => {
        renderStrategyRollingChart();
      });
    }

    document.getElementById("thread-drawer-close").addEventListener("click", () => {
      closeThreadDrawer();
    });

    document.getElementById("thread-drawer-backdrop").addEventListener("click", () => {
      closeThreadDrawer();
    });

    document.addEventListener("click", (event) => {
      const drawer = document.getElementById("thread-drawer");
      const target = event.target;
      if (!(target instanceof Element) || !drawer.classList.contains("visible")) {
        return;
      }
      if (target.closest("#thread-drawer .thread-drawer-panel")) {
        return;
      }
      if (target.closest("[data-thread-session-date], [data-thread-trade-id]")) {
        return;
      }
      closeThreadDrawer();
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

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeThreadDrawer();
      }
    });
  });
})();
