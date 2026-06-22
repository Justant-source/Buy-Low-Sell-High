(function () {
  const ui = window.SOXLDashboard;
  const MAX_STRATEGY_SELECTION = 6;
  const BUY_HOLD_STRATEGY_ID = "buy_hold";
  const SWEEP_DEFINITION_ID = "core4_v4";
  const STRATEGY_DETAIL_RETURN_TOLERANCE_PCT = 0.5;
  const STRATEGY_COLORS = ["#d78a4b", "#2f7ed8", "#2fb344", "#d63939", "#7b5cff", "#1f9d8b"];
  const DEFAULT_STRATEGY_FILTER_CONFIG = {
    threadCount: { rowKey: "thread_count", label: "Thread 수" },
    stopSessions: { rowKey: "stop_sessions", label: "손절일" },
    buyPct: { rowKey: "buy_pct", label: "매수 %" },
    sellPct: { rowKey: "sell_pct", label: "매도 %" },
  };
  const REGIME_STRATEGY_FILTER_CONFIG = {
    threadCount: { rowKey: "thread_count", label: "Thread 수" },
    bullStopSessions: { rowKey: "bull_stop_sessions", label: "Attack 손절일" },
    bullBuyPct: { rowKey: "bull_buy_pct", label: "Attack 매수 %" },
    bullSellPct: { rowKey: "bull_sell_pct", label: "Attack 매도 %" },
    bearStopSessions: { rowKey: "bear_stop_sessions", label: "Defense 손절일" },
    bearBuyPct: { rowKey: "bear_buy_pct", label: "Defense 매수 %" },
    bearSellPct: { rowKey: "bear_sell_pct", label: "Defense 매도 %" },
  };
  const THREAD_SESSION_PX_BASE = 14;
  const THREAD_TRACK_MIN_WIDTH = 0;
  const THREAD_TIMELINE_ZOOM_MIN = 20;
  const THREAD_TIMELINE_ZOOM_MAX = 780;
  const THREAD_TIMELINE_ZOOM_DEFAULT = 160;
  const SWEEP_PARETO_LABELS = {
    all: "all",
    return_mdd: "return / MDD",
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
    strategyRanking: null,
    strategyRankingLoading: false,
    strategyRankingError: "",
    strategySliceRequestId: 0,
    strategyDetails: {},
    strategyDetailPending: {},
    strategyDetailControllers: {},
    strategyDetailError: "",
    strategyDetailMismatchNotice: "",
    strategyRankingController: null,
    focusedStrategyId: null,
    threadTimeline: null,
    threadTimelineController: null,
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
    strategyRankingPage: 1,
    strategyRankingPageSize: 10,
    strategyRankingSortKey: "rank",
    strategyRankingSortDirection: "asc",
    strategyRankingOpenFilterKey: null,
    strategyRankingFilters: {
      threadCount: [],
      stopSessions: [],
      buyPct: [],
      sellPct: [],
      bullStopSessions: [],
      bullBuyPct: [],
      bullSellPct: [],
      bearStopSessions: [],
      bearBuyPct: [],
      bearSellPct: [],
    },
    strategyRegime: null,
  };

  function resetThreadHistoryPage() {
    state.threadHistoryPage = 1;
  }

  function resetStrategyRankingPage() {
    state.strategyRankingPage = 1;
  }

  function setEmptyChart(id, message) {
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    target.innerHTML = `<div class="empty-state">${ui.escapeHtml(message)}</div>`;
  }

  function hasElement(id) {
    return document.getElementById(id) != null;
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

  function bpsToPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? (number / 100) : 0;
  }

  function formatFeeNote(meta) {
    if (!meta) {
      return "수수료 기준: 0.25% + 기타거래세";
    }
    const commissionPct = bpsToPercent(meta.commission_bps);
    const transactionTaxPct = bpsToPercent(meta.transaction_tax_bps);
    return `수수료 기준: ${ui.formatPercent(commissionPct)} + 기타거래세 ${ui.formatPercent(transactionTaxPct)}`;
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

  function renderStrategyMetaNotice() {
    setNotice("strategy-meta-note", state.strategyDetailError || state.strategyDetailMismatchNotice);
  }

  function resetStrategyMetaNotice() {
    state.strategyDetailError = "";
    state.strategyDetailMismatchNotice = "";
    renderStrategyMetaNotice();
  }

  function setStrategyDetailError(message) {
    state.strategyDetailError = message || "";
    renderStrategyMetaNotice();
  }

  function setStrategyDetailMismatchNotice(message) {
    state.strategyDetailMismatchNotice = message || "";
    renderStrategyMetaNotice();
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

  function formatSignedSweepPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return `${number >= 0 ? "+" : ""}${number.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}%`;
  }

  function strategySortIndicator(sortKey) {
    if (state.strategyRankingSortKey !== sortKey) {
      return "";
    }
    return state.strategyRankingSortDirection === "asc" ? " ▲" : " ▼";
  }

  function formatStrategyFilterOptionLabel(kind, value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "all";
    }
    if (kind === "threadCount") {
      return `T${number}`;
    }
    if (kind === "stopSessions" || kind === "bullStopSessions" || kind === "bearStopSessions") {
      return `${number}S`;
    }
    return `${number >= 0 ? "+" : ""}${number}%`;
  }

  function strategyFilterValues(key) {
    return Array.isArray(state.strategyRankingFilters[key]) ? state.strategyRankingFilters[key] : [];
  }

  function strategyFilterAllSelected(key) {
    return strategyFilterValues(key).length === 0;
  }

  function availableStrategyFilterValues(key) {
    const config = activeStrategyFilterConfig()[key];
    if (!config) {
      return [];
    }
    return [...new Set(baseStrategyRankingRows().map((row) => row[config.rowKey]))].sort((left, right) => Number(left) - Number(right));
  }

  function normalizeStrategyRankingFilters() {
    const activeConfig = activeStrategyFilterConfig();
    Object.keys(state.strategyRankingFilters).forEach((key) => {
      if (!activeConfig[key]) {
        state.strategyRankingFilters[key] = [];
        return;
      }
      const available = availableStrategyFilterValues(key);
      const normalized = strategyFilterValues(key)
        .filter((value) => available.includes(value))
        .sort((left, right) => Number(left) - Number(right));
      state.strategyRankingFilters[key] = normalized;
    });
  }

  function strategyFilterButtonSummary(key) {
    const values = strategyFilterValues(key);
    if (!values.length) {
      return "all";
    }
    if (values.length <= 2) {
      return values.map((value) => formatStrategyFilterOptionLabel(key, value)).join(", ");
    }
    return `${values.length}개 선택`;
  }

  function applyStrategyFilterSelection() {
    normalizeStrategyRankingFilters();
    resetStrategyRankingPage();
    ensureStrategySelection();
    renderStrategyRanking();
    renderStrategyViews();
    scheduleStrategyDetailsAndTimelineLoad();
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

  function workspaceSupportsOfficialReference(workspace) {
    return !!workspace && workspace.referenceMode !== "backtest_only";
  }

  function workspaceSupportsMentorReference(workspace) {
    return !!workspace && workspace.referenceMode === "mentor_reference";
  }

  function workspaceSupportsStrategyRegime(workspace) {
    return !!workspace && workspace.workspaceId === "soxl";
  }

  function makeDefaultStrategyRegime(profile) {
    const defaultStop = Number(profile?.stopSessions || 40) || 40;
    return {
      enabled: false,
      symbol: "QQQ",
      rsiPeriodWeeks: 14,
      bearHighThreshold: 45,
      bearMidLowThreshold: 45,
      bearMidHighThreshold: 45,
      bullLowThreshold: 55,
      bullMidLowThreshold: 55,
      bullMidHighThreshold: 55,
      baseStopSessions: defaultStop,
      baseBuyPct: 0,
      baseSellPct: 0,
      bullStopSessions: defaultStop,
      bullBuyPct: 0,
      bullSellPct: 0,
      bearStopSessions: defaultStop,
      bearBuyPct: 0,
      bearSellPct: 0,
    };
  }

  function currentStrategyRegimeState() {
    if (!state.strategyRegime) {
      state.strategyRegime = makeDefaultStrategyRegime(currentProfile());
    }
    return state.strategyRegime;
  }

  function currentStrategyRegimeOverrides() {
    const workspace = currentWorkspace();
    const regime = currentStrategyRegimeState();
    if (!workspaceSupportsStrategyRegime(workspace) || !regime?.enabled) {
      return undefined;
    }
    return {
      regimeEnabled: true,
      regimeSymbol: regime.symbol || "QQQ",
      regimeRsiPeriodWeeks: Number(regime.rsiPeriodWeeks || 14),
      regimeBearHighThreshold: Number(regime.bearHighThreshold || 45),
      regimeBearMidLowThreshold: Number(regime.bearMidLowThreshold || 45),
      regimeBearMidHighThreshold: Number(regime.bearMidHighThreshold || 45),
      regimeBullLowThreshold: Number(regime.bullLowThreshold || 55),
      regimeBullMidLowThreshold: Number(regime.bullMidLowThreshold || 55),
      regimeBullMidHighThreshold: Number(regime.bullMidHighThreshold || 55),
      regimeBaseStopSessions: Number(regime.baseStopSessions || 40),
      regimeBaseBuyPct: Number(regime.baseBuyPct || 0),
      regimeBaseSellPct: Number(regime.baseSellPct || 0),
      regimeBullStopSessions: Number(regime.bullStopSessions || 40),
      regimeBullBuyPct: Number(regime.bullBuyPct || 0),
      regimeBullSellPct: Number(regime.bullSellPct || 0),
      regimeBearStopSessions: Number(regime.bearStopSessions || 40),
      regimeBearBuyPct: Number(regime.bearBuyPct || 0),
      regimeBearSellPct: Number(regime.bearSellPct || 0),
    };
  }

  function currentStrategyRegimeKey() {
    const overrides = currentStrategyRegimeOverrides();
    if (!overrides) {
      return "";
    }
    return JSON.stringify(overrides);
  }

  function appendStrategyRegimeParams(params) {
    const overrides = currentStrategyRegimeOverrides();
    if (!overrides) {
      return params;
    }
    Object.entries(overrides).forEach(([key, value]) => {
      params.set(key, String(value));
    });
    return params;
  }

  function strategyRankingUsesRegimeFilters() {
    if (state.strategyRanking?.meta?.regime_enabled) {
      return true;
    }
    if (state.strategyRanking) {
      return false;
    }
    return workspaceSupportsStrategyRegime(currentWorkspace()) && Boolean(currentStrategyRegimeOverrides());
  }

  function activeStrategyFilterConfig() {
    return strategyRankingUsesRegimeFilters() ? REGIME_STRATEGY_FILTER_CONFIG : DEFAULT_STRATEGY_FILTER_CONFIG;
  }

  function renderStrategyComboSubtitle() {
    const target = document.getElementById("strategy-combo-head-subtitle");
    if (!target) {
      return;
    }
    if (strategyRankingUsesRegimeFilters()) {
      target.textContent = "SOXL regime 모드: Thread 수 x Attack 손절/매수/매도 x Defense 손절/매수/매도 (Neutral은 baseline)";
      return;
    }
    target.textContent = "Thread 수 x 손절일 x 매수% x 매도%";
  }

  function openStrategyRegimeHelp() {
    if (!workspaceSupportsStrategyRegime(currentWorkspace())) {
      return;
    }
    const dialog = document.getElementById("strategy-regime-help-dialog");
    if (!(dialog instanceof HTMLElement)) {
      return;
    }
    dialog.classList.add("visible");
    dialog.setAttribute("aria-hidden", "false");
    const closeButton = document.getElementById("strategy-regime-help-close");
    if (closeButton instanceof HTMLButtonElement) {
      closeButton.focus();
    }
  }

  function closeStrategyRegimeHelp() {
    const dialog = document.getElementById("strategy-regime-help-dialog");
    if (!(dialog instanceof HTMLElement)) {
      return;
    }
    dialog.classList.remove("visible");
    dialog.setAttribute("aria-hidden", "true");
  }

  function currentWorkspaceSlug() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts[0] === "backtests" && parts[1] ? parts[1] : null;
  }

  function currentStrategyExecutionModel() {
    const workspace = currentWorkspace();
    return workspace?.defaultStrategyExecutionModel || currentProfile()?.executionModel || "ideal_same_close";
  }

  function currentStrategyPriceBasis() {
    const workspace = currentWorkspace();
    return workspace?.defaultStrategyPriceBasis || currentProfile()?.priceBasis || "adjusted_close";
  }

  function abortStrategyRankingRequest() {
    if (state.strategyRankingController) {
      state.strategyRankingController.abort();
      state.strategyRankingController = null;
    }
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
    ui.setText("guide-hero-title", workspace.guideTitle || "떨사오팔 전략이란?");
    ui.setText("guide-lead", workspace.guideLead || "");
    ui.setText("guide-why-title", workspace.guideWhyTitle || "왜 이 종목인가");
    ui.setText("guide-why-copy", workspace.guideWhyCopy || "");
    document.title = `${workspace.navLabel} - Buy-Low-Sell-High`;
    const tags = document.getElementById("workspace-tags");
    if (tags) {
      tags.innerHTML = (workspace.warningTags || [])
        .map((tag) => `<span class="badge info">${ui.escapeHtml(tag)}</span>`)
        .join("");
    }
    const mentorButton = document.getElementById("mentor-tab-button");
    const mentorPanel = document.querySelector('[data-tab-panel="mentor"]');
    const mentorLegacyCard = document.getElementById("mentor-legacy-card");
    const officialSubtitle = document.getElementById("official-reference-subtitle");
    const officialNote = document.getElementById("official-reference-note");
    const officialEnabled = workspaceSupportsOfficialReference(workspace);
    const mentorEnabled = workspaceSupportsMentorReference(workspace);
    if (mentorButton) {
      mentorButton.style.display = officialEnabled ? "" : "none";
      mentorButton.textContent = mentorEnabled ? "멘토 래퍼런스" : "공식 기준선";
    }
    if (mentorPanel instanceof HTMLElement) {
      mentorPanel.style.display = officialEnabled ? "" : "none";
    }
    if (mentorLegacyCard instanceof HTMLElement) {
      mentorLegacyCard.style.display = mentorEnabled ? "" : "none";
    }
    if (officialSubtitle) {
      officialSubtitle.textContent = `${workspace.navLabel} Yahoo adjusted_close 기준 내부 공식 연구 기준선입니다.`;
    }
    if (officialNote) {
      officialNote.textContent = mentorEnabled
        ? "현재 워크스페이스의 공식 기준선과 레거시 멘토 원본 자료를 함께 보여줍니다. 멘토 이미지는 legacy comparison 전용입니다."
        : "현재 워크스페이스의 대표 프로필을 내부 공식 기준선으로 고정해 같은 Yahoo 일봉 데이터셋에서 비교합니다.";
    }
    if (!officialEnabled && state.activeTab === "mentor") {
      activateTab("strategy");
    }
  }

  function applyWorkspaceDefaults(workspace) {
    if (!workspace) {
      return;
    }
    const sweepModel = document.getElementById("sweep-model");
    if (sweepModel) {
      sweepModel.value = workspace.defaultSweepExecutionModel || "next_open";
    }
    const sweepPriceBasis = document.getElementById("sweep-price-basis");
    if (sweepPriceBasis) {
      sweepPriceBasis.value = workspace.defaultSweepPriceBasis || "adjusted_close";
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
    if (!state.strategyRegime || !workspaceSupportsStrategyRegime(currentWorkspace())) {
      state.strategyRegime = makeDefaultStrategyRegime(profile);
    }
    ui.setText("sb-model", profile.executionModel || "ideal_same_close");
  }

  function renderStrategyRegimeCard() {
    const card = document.getElementById("strategy-regime-card");
    const fieldset = document.getElementById("strategy-regime-fieldset");
    if (!(card instanceof HTMLElement) || !(fieldset instanceof HTMLFieldSetElement)) {
      return;
    }
    const workspace = currentWorkspace();
    if (!workspaceSupportsStrategyRegime(workspace)) {
      card.style.display = "none";
      closeStrategyRegimeHelp();
      return;
    }
    card.style.display = "";
    const regime = currentStrategyRegimeState();
    const profile = currentProfile();
    if (!state.strategyRegime) {
      state.strategyRegime = makeDefaultStrategyRegime(profile);
    }
    const setValue = (id, value) => {
      const input = document.getElementById(id);
      if (input) {
        input.value = String(value);
      }
    };
    const enabledInput = document.getElementById("strategy-regime-enabled");
    if (enabledInput instanceof HTMLInputElement) {
      enabledInput.checked = Boolean(regime.enabled);
    }
    setValue("strategy-regime-symbol", regime.symbol || "QQQ");
    setValue("strategy-regime-rsi-period", regime.rsiPeriodWeeks);
    setValue("strategy-regime-bear-high-threshold", regime.bearHighThreshold);
    setValue("strategy-regime-bear-mid-low-threshold", regime.bearMidLowThreshold);
    setValue("strategy-regime-bear-mid-high-threshold", regime.bearMidHighThreshold);
    setValue("strategy-regime-bull-low-threshold", regime.bullLowThreshold);
    setValue("strategy-regime-bull-mid-low-threshold", regime.bullMidLowThreshold);
    setValue("strategy-regime-bull-mid-high-threshold", regime.bullMidHighThreshold);
    setValue("strategy-regime-base-stop", regime.baseStopSessions);
    setValue("strategy-regime-base-buy", regime.baseBuyPct);
    setValue("strategy-regime-base-sell", regime.baseSellPct);
    setValue("strategy-regime-bull-stop", regime.bullStopSessions);
    setValue("strategy-regime-bull-buy", regime.bullBuyPct);
    setValue("strategy-regime-bull-sell", regime.bullSellPct);
    setValue("strategy-regime-bear-stop", regime.bearStopSessions);
    setValue("strategy-regime-bear-buy", regime.bearBuyPct);
    setValue("strategy-regime-bear-sell", regime.bearSellPct);
    fieldset.disabled = false;
    renderStrategyComboSubtitle();
  }

  function syncStrategyRegimeStateFromInputs() {
    const regime = currentStrategyRegimeState();
    const getNumber = (id, fallback) => {
      const input = document.getElementById(id);
      const value = Number(input?.value ?? fallback);
      return Number.isFinite(value) ? value : fallback;
    };
    const enabledInput = document.getElementById("strategy-regime-enabled");
    regime.enabled = enabledInput instanceof HTMLInputElement ? enabledInput.checked : Boolean(regime.enabled);
    regime.symbol = document.getElementById("strategy-regime-symbol")?.value || "QQQ";
    regime.rsiPeriodWeeks = getNumber("strategy-regime-rsi-period", 14);
    const defenseThreshold = getNumber(
      "strategy-regime-bear-mid-high-threshold",
      getNumber("strategy-regime-bear-mid-low-threshold", getNumber("strategy-regime-bear-high-threshold", 45)),
    );
    const attackThreshold = getNumber(
      "strategy-regime-bull-mid-low-threshold",
      getNumber("strategy-regime-bull-low-threshold", getNumber("strategy-regime-bull-mid-high-threshold", 55)),
    );
    regime.bearHighThreshold = defenseThreshold;
    regime.bearMidLowThreshold = defenseThreshold;
    regime.bearMidHighThreshold = defenseThreshold;
    regime.bullLowThreshold = attackThreshold;
    regime.bullMidLowThreshold = attackThreshold;
    regime.bullMidHighThreshold = attackThreshold;
    regime.baseStopSessions = getNumber("strategy-regime-base-stop", regime.baseStopSessions || 40);
    regime.baseBuyPct = getNumber("strategy-regime-base-buy", 0);
    regime.baseSellPct = getNumber("strategy-regime-base-sell", 0);
    regime.bullStopSessions = getNumber("strategy-regime-bull-stop", regime.baseStopSessions || 40);
    regime.bullBuyPct = getNumber("strategy-regime-bull-buy", 0);
    regime.bullSellPct = getNumber("strategy-regime-bull-sell", 0);
    regime.bearStopSessions = getNumber("strategy-regime-bear-stop", regime.baseStopSessions || 40);
    regime.bearBuyPct = getNumber("strategy-regime-bear-buy", 0);
    regime.bearSellPct = getNumber("strategy-regime-bear-sell", 0);
    state.strategyRegime = regime;
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
    if (strategyId === BUY_HOLD_STRATEGY_ID && state.strategyExplorer?.benchmark) {
      const benchmark = state.strategyExplorer.benchmark;
      return {
        strategy_id: benchmark.strategy_id,
        label: benchmark.label,
        combo_key: benchmark.combo_key,
        thread_count: 0,
        stop_sessions: 0,
        mentor_profiles: [],
        config_hash: "buy_hold",
        metrics: benchmark.metrics,
        yearly: {},
        monthly: benchmark.monthly,
        segments: benchmark.segments,
        daily: benchmark.daily,
        isBenchmark: true,
      };
    }
    const context = buildStrategyDetailContext(strategyId);
    if (!context) {
      return null;
    }
    const payload = state.strategyDetails[makeStrategyDetailStateKey(context)] || null;
    if (!payload || !strategyDetailMatchesContext(payload, context)) {
      return null;
    }
    const rankingRow = findStrategyRankingRow(strategyId);
    if (rankingRow && !strategyDetailMatchesRanking(payload, rankingRow)) {
      return null;
    }
    return payload;
  }

  function isBuyHoldStrategyId(strategyId) {
    return strategyId === BUY_HOLD_STRATEGY_ID;
  }

  function buildStrategyBenchmarkRow(slice) {
    if (!state.strategyExplorer) {
      return null;
    }
    const activeSlice = slice || {
      start: state.strategyExplorer.meta.period_start,
      end: state.strategyExplorer.meta.period_end,
    };
    const benchmarkStrategy = getStrategyById(BUY_HOLD_STRATEGY_ID);
    if (!benchmarkStrategy) {
      return null;
    }
    const sliceSeries = rebaseDaily(strategyDailySlice(benchmarkStrategy, activeSlice.start, activeSlice.end));
    const summary = summarizeRebasedSlice(sliceSeries);
    const drawdownSummary = summarizeSliceDrawdown(sliceSeries);
    if (!summary) {
      return null;
    }
    return {
      combo_key: "Buy & Hold",
      strategy_id: BUY_HOLD_STRATEGY_ID,
      label: benchmarkStrategy.label,
      display_params: "Buy & Hold",
      thread_count: 0,
      stop_sessions: 0,
      buy_pct: 0,
      sell_pct: 0,
      full_return_pct: summary.returnPct,
      cagr_pct: summary.cagrPct,
      max_drawdown_pct: drawdownSummary?.maxDrawdownPct ?? 0,
      trade_count: 0,
      rank: null,
      rank_display: "-",
      is_benchmark: true,
    };
  }

  function baseStrategyRankingRows() {
    if (!state.strategyRanking) {
      return [];
    }
    return (state.strategyRanking.rows || []).map((row) => ({
      ...row,
      rank_display: String(row.rank),
      is_benchmark: false,
    }));
  }

  function filteredStrategyRankingRows() {
    const rows = baseStrategyRankingRows().filter((row) => {
      for (const [filterKey, config] of Object.entries(activeStrategyFilterConfig())) {
        const selectedValues = strategyFilterValues(filterKey);
        if (selectedValues.length && !selectedValues.includes(row[config.rowKey])) {
          return false;
        }
      }
      return true;
    });
    const sortKey = state.strategyRankingSortKey;
    const direction = state.strategyRankingSortDirection === "asc" ? 1 : -1;
    rows.sort((left, right) => {
      let result = 0;
      if (sortKey === "rank") {
        result = (left.rank || 0) - (right.rank || 0);
      } else {
        result = Number(left[sortKey] || 0) - Number(right[sortKey] || 0);
      }
      if (result === 0) {
        result = (left.rank || 0) - (right.rank || 0);
      }
      if (result === 0) {
        result = String(left.combo_key || "").localeCompare(String(right.combo_key || ""));
      }
      return result * direction;
    });
    return rows;
  }

  function pagedStrategyRankingRows() {
    const actualRows = filteredStrategyRankingRows();
    const totalPages = Math.max(1, Math.ceil(actualRows.length / state.strategyRankingPageSize));
    state.strategyRankingPage = Math.max(1, Math.min(totalPages, state.strategyRankingPage));
    const startIndex = (state.strategyRankingPage - 1) * state.strategyRankingPageSize;
    return {
      benchmarkRow: buildStrategyBenchmarkRow(currentStrategySlice()),
      actualRows,
      pageRows: actualRows.slice(startIndex, startIndex + state.strategyRankingPageSize),
      totalPages,
      startIndex,
    };
  }

  function strategyRankingRows() {
    const { benchmarkRow, pageRows } = pagedStrategyRankingRows();
    return benchmarkRow ? [benchmarkRow, ...pageRows] : pageRows;
  }

  function ensureFocusedStrategy() {
    if (!state.strategyRanking) {
      state.focusedStrategyId = null;
      return;
    }
    const validIds = new Set(filteredStrategyRankingRows().map((strategy) => strategy.strategy_id));
    if (state.focusedStrategyId && validIds.has(state.focusedStrategyId) && !isBuyHoldStrategyId(state.focusedStrategyId)) {
      return;
    }
    state.focusedStrategyId =
      state.selectedStrategyIds.find((strategyId) => validIds.has(strategyId) && !isBuyHoldStrategyId(strategyId))
      || filteredStrategyRankingRows()[0]?.strategy_id
      || null;
  }

  function ensureStrategySelection() {
    if (!state.strategyRanking) {
      return;
    }
    const validIds = new Set(filteredStrategyRankingRows().map((strategy) => strategy.strategy_id));
    if (state.strategyExplorer?.benchmark) {
      validIds.add(BUY_HOLD_STRATEGY_ID);
    }
    state.selectedStrategyIds = state.selectedStrategyIds.filter((strategyId) => validIds.has(strategyId)).slice(0, MAX_STRATEGY_SELECTION);
    if (state.selectedStrategyIds.length) {
      ensureFocusedStrategy();
      return;
    }
    const defaults = strategyRankingRows()
      .slice(0, 4)
      .map((row) => row.strategy_id)
      .filter((strategyId) => validIds.has(strategyId))
      .slice(0, 3);
    state.selectedStrategyIds = defaults.length ? defaults : filteredStrategyRankingRows().slice(0, 3).map((strategy) => strategy.strategy_id);
    ensureFocusedStrategy();
  }

  function setStrategyDateInputs(start, end) {
    document.getElementById("strategy-slice-start").value = start;
    document.getElementById("strategy-slice-end").value = end;
  }

  function setStrategyApplyPending(isPending) {
    const button = document.getElementById("strategy-apply-button");
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    button.disabled = isPending;
    button.textContent = isPending ? "적용 중..." : "구간 적용";
  }

  function abortStrategyDetailRequests() {
    Object.values(state.strategyDetailControllers).forEach((controller) => {
      if (controller) {
        controller.abort();
      }
    });
    state.strategyDetailControllers = {};
    state.strategyDetailPending = {};
  }

  function abortThreadTimelineRequest() {
    if (!state.threadTimelineController) {
      return;
    }
    state.threadTimelineController.abort();
    state.threadTimelineController = null;
  }

  function beginStrategySliceReload(message) {
    state.strategySliceRequestId += 1;
    state.strategyRanking = null;
    state.strategyRankingLoading = true;
    state.strategyRankingError = "";
    state.selectedStrategyIds = [];
    state.focusedStrategyId = null;
    abortStrategyDetailRequests();
    abortThreadTimelineRequest();
    state.strategyDetails = {};
    state.threadTimeline = null;
    state.threadTimelineCache = {};
    state.strategyRankingOpenFilterKey = null;
    resetStrategyRankingPage();
    abortStrategyRankingRequest();
    resetStrategyMetaNotice();
    renderStrategyRankingMessage(message);
    renderStrategyViews();
    return state.strategySliceRequestId;
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

  function currentStrategyContextBase() {
    if (!state.dataStatus) {
      return null;
    }
    const slice = currentStrategySlice();
    if (!slice) {
      return null;
    }
    const actualSliceStart = state.strategyRanking?.meta?.period_start || slice.start;
    const actualSliceEnd = state.strategyRanking?.meta?.period_end || slice.end;
    const regimeOverrides = currentStrategyRegimeOverrides();
    return {
      profileId: state.profileId,
      csvPath: state.dataStatus.snapshot_path || "",
      executionModel: currentStrategyExecutionModel(),
      priceBasis: currentStrategyPriceBasis(),
      sliceStart: actualSliceStart,
      sliceEnd: actualSliceEnd,
      requestedSliceStart: slice.start,
      requestedSliceEnd: slice.end,
      regimeEnabled: Boolean(state.strategyRanking?.meta?.regime_enabled || regimeOverrides),
      regimeConfigHash: String(state.strategyRanking?.meta?.regime_config_hash || currentStrategyRegimeKey() || ""),
    };
  }

  function buildStrategyDetailContext(strategyId) {
    const base = currentStrategyContextBase();
    if (!base) {
      return null;
    }
    return {
      ...base,
      strategyId,
    };
  }

  function buildThreadTimelineContext(strategyId) {
    const base = currentStrategyContextBase();
    if (!base) {
      return null;
    }
    return {
      ...base,
      strategyId,
    };
  }

  function makeStrategyDetailStateKey(context) {
    return [
      context.profileId,
      context.strategyId,
      context.csvPath,
      context.executionModel,
      context.priceBasis,
      context.sliceStart,
      context.sliceEnd,
      context.regimeConfigHash,
    ].join(":");
  }

  function makeThreadTimelineStateKey(context) {
    return [
      context.profileId,
      context.strategyId,
      context.csvPath,
      context.executionModel,
      context.priceBasis,
      context.sliceStart,
      context.sliceEnd,
      context.regimeConfigHash,
    ].join(":");
  }

  function strategyDetailMatchesContext(payload, context) {
    if (!payload || !context || !payload.meta) {
      return false;
    }
    return payload.strategy_id === context.strategyId
      && payload.meta.strategy_id === context.strategyId
      && payload.meta.period_start === context.sliceStart
      && payload.meta.period_end === context.sliceEnd
      && payload.meta.execution_model === context.executionModel
      && payload.meta.price_basis === context.priceBasis
      && String(payload.meta.regime_config_hash || "") === String(context.regimeConfigHash || "")
      && Boolean(payload.meta.regime_enabled) === Boolean(context.regimeEnabled);
  }

  function threadTimelineMatchesContext(payload, context) {
    if (!payload || !context || !payload.meta) {
      return false;
    }
    return payload.meta.strategy_id === context.strategyId
      && payload.meta.period_start === context.sliceStart
      && payload.meta.period_end === context.sliceEnd
      && payload.meta.execution_model === context.executionModel
      && payload.meta.price_basis === context.priceBasis
      && String(payload.meta.regime_config_hash || "") === String(context.regimeConfigHash || "")
      && Boolean(payload.meta.regime_enabled) === Boolean(context.regimeEnabled);
  }

  function strategyDetailReturnPct(payload) {
    const daily = payload?.daily || [];
    if (!daily.length) {
      return null;
    }
    const start = parseMoney(daily[0].total_equity);
    const end = parseMoney(daily[daily.length - 1].total_equity);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) {
      return null;
    }
    return ((end - start) / start) * 100;
  }

  function normalizeStrategyDetailPayload(payload, context) {
    if (!payload || !context) {
      return payload;
    }
    if (payload.meta) {
      return payload;
    }
    const daily = payload.daily || [];
    const actualStart = daily[0]?.session_date || context.sliceStart;
    const actualEnd = daily[daily.length - 1]?.session_date || context.sliceEnd;
    return {
      ...payload,
      meta: {
        strategy_id: payload.strategy_id || context.strategyId,
        symbol: payload.symbol || state.dataStatus?.symbol || "",
        initial_capital: String(state.strategyExplorer?.meta?.initial_capital || "10000"),
        price_basis: context.priceBasis,
        execution_model: context.executionModel,
        period_start: actualStart,
        period_end: actualEnd,
        data_hash: String(state.strategyRanking?.meta?.data_hash || state.strategyExplorer?.meta?.data_hash || ""),
        config_hash: String(payload.config_hash || ""),
        code_commit: String(state.strategyRanking?.meta?.code_commit || state.strategyExplorer?.meta?.code_commit || ""),
        regime_enabled: Boolean(state.strategyRanking?.meta?.regime_enabled || context.regimeEnabled),
        regime_symbol: String(state.strategyRanking?.meta?.regime_symbol || "QQQ"),
        regime_data_hash: String(state.strategyRanking?.meta?.regime_data_hash || ""),
        regime_config_hash: String(state.strategyRanking?.meta?.regime_config_hash || context.regimeConfigHash || ""),
      },
    };
  }

  function findStrategyRankingRow(strategyId) {
    return (state.strategyRanking?.rows || []).find((row) => row.strategy_id === strategyId) || null;
  }

  function strategyDetailMatchesRanking(payload, rankingRow) {
    if (!rankingRow) {
      return true;
    }
    const detailReturnPct = strategyDetailReturnPct(payload);
    if (!Number.isFinite(detailReturnPct)) {
      return false;
    }
    return Math.abs(detailReturnPct - Number(rankingRow.full_return_pct || 0)) <= STRATEGY_DETAIL_RETURN_TOLERANCE_PCT;
  }

  function shouldAcceptStrategyDetailPayload({ activeRequestId, requestId, payload, context, rankingRow }) {
    if (activeRequestId !== requestId) {
      return false;
    }
    if (!strategyDetailMatchesContext(payload, context)) {
      return false;
    }
    return strategyDetailMatchesRanking(payload, rankingRow);
  }

  function shouldAcceptThreadTimelinePayload({ activeRequestId, requestId, payload, context }) {
    if (activeRequestId !== requestId) {
      return false;
    }
    return threadTimelineMatchesContext(payload, context);
  }

  function updateStrategyDetailMismatchNotice() {
    const issue = state.selectedStrategyIds
      .filter((strategyId) => !isBuyHoldStrategyId(strategyId))
      .map((strategyId) => {
        const context = buildStrategyDetailContext(strategyId);
        if (!context) {
          return null;
        }
        const payload = state.strategyDetails[makeStrategyDetailStateKey(context)];
        if (!payload) {
          return null;
        }
        if (!strategyDetailMatchesContext(payload, context)) {
          return "선택 콤보 상세가 현재 구간과 일치하지 않아 다시 불러오는 중입니다.";
        }
        const rankingRow = findStrategyRankingRow(strategyId);
        if (rankingRow && !strategyDetailMatchesRanking(payload, rankingRow)) {
          return `${rankingRow.display_params || rankingRow.label} 상세가 현재 랭킹과 일치하지 않아 차트를 보류했습니다.`;
        }
        return null;
      })
      .find(Boolean)
      || "";
    setStrategyDetailMismatchNotice(issue);
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
    const elapsedDays = (parseDateValue(series[series.length - 1].date) - parseDateValue(series[0].date)) / (1000 * 60 * 60 * 24);
    const growthRatio = start === 0 ? 0 : end / start;
    const cagrPct =
      start === 0
      || !Number.isFinite(growthRatio)
      || growthRatio <= 0
      || !Number.isFinite(elapsedDays)
      || elapsedDays <= 0
        ? (start === 0 ? 0 : ((end - start) / start) * 100)
        : ((growthRatio ** (365 / elapsedDays)) - 1) * 100;
    return {
      returnPct: start === 0 ? 0 : ((end - start) / start) * 100,
      cagrPct,
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

  async function ensureStrategyDetails(strategyIds, requestId = state.strategySliceRequestId) {
    const ids = [...new Set((strategyIds || []).filter((strategyId) => strategyId && !isBuyHoldStrategyId(strategyId)))];
    if (!ids.length || !state.dataStatus) {
      return;
    }
    await Promise.all(
      ids.map(async (strategyId) => {
        const context = buildStrategyDetailContext(strategyId);
        if (!context) {
          return;
        }
        const cacheKey = makeStrategyDetailStateKey(context);
        const rankingRow = findStrategyRankingRow(strategyId);
        const cached = state.strategyDetails[cacheKey];
        if (cached && strategyDetailMatchesContext(cached, context) && strategyDetailMatchesRanking(cached, rankingRow)) {
          return;
        }
        const pending = state.strategyDetailPending[cacheKey];
        if (pending) {
          await pending;
          return;
        }
        const params = new URLSearchParams({
          profileId: context.profileId,
          csvPath: context.csvPath,
          strategyId,
          executionModel: context.executionModel,
          priceBasis: context.priceBasis,
        });
        params.set("sliceStart", context.sliceStart);
        params.set("sliceEnd", context.sliceEnd);
        appendStrategyRegimeParams(params);
        const controller = new AbortController();
        state.strategyDetailControllers[cacheKey] = controller;
        const loader = ui.fetchJson(`/api/backtests/strategy-detail?${params.toString()}`, { signal: controller.signal })
          .then((rawPayload) => {
            const payload = normalizeStrategyDetailPayload(rawPayload, context);
            if (!shouldAcceptStrategyDetailPayload({
              activeRequestId: state.strategySliceRequestId,
              requestId,
              payload,
              context,
              rankingRow,
            })) {
              if (state.strategySliceRequestId === requestId && strategyDetailMatchesContext(payload, context) && !strategyDetailMatchesRanking(payload, rankingRow)) {
                setStrategyDetailMismatchNotice(`${rankingRow?.display_params || strategyId} 상세가 현재 랭킹과 일치하지 않아 차트를 보류했습니다.`);
              }
              return null;
            }
            state.strategyDetails[cacheKey] = payload;
            return payload;
          })
          .catch((error) => {
            if (ui.isAbortError && ui.isAbortError(error)) {
              return null;
            }
            throw error;
          })
          .finally(() => {
            delete state.strategyDetailPending[cacheKey];
            delete state.strategyDetailControllers[cacheKey];
          });
        state.strategyDetailPending[cacheKey] = loader;
        await loader;
      }),
    );
  }

  async function toggleStrategySelection(strategyId) {
    const current = new Set(state.selectedStrategyIds);
    if (current.has(strategyId)) {
      current.delete(strategyId);
    } else if (current.size < MAX_STRATEGY_SELECTION) {
      current.add(strategyId);
    }
    state.selectedStrategyIds = [...current];
    await ensureStrategyDetails(state.selectedStrategyIds, state.strategySliceRequestId);
    renderStrategyRanking();
    renderStrategyViews();
  }

  async function setFocusedStrategy(strategyId) {
    if (!strategyId || strategyId === state.focusedStrategyId) {
      return;
    }
    await ensureStrategyDetails([strategyId], state.strategySliceRequestId);
    state.focusedStrategyId = strategyId;
    resetThreadHistoryPage();
    renderStrategyRanking();
    await loadThreadTimeline(state.strategySliceRequestId);
  }

  function renderStrategyRankingMessage(message) {
    const body = document.getElementById("strategy-ranking-body");
    if (!body) {
      return;
    }
    body.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center">${ui.escapeHtml(message)}</td></tr>`;
    document.getElementById("strategy-selector-note").textContent = `선택 ${state.selectedStrategyIds.length} / ${MAX_STRATEGY_SELECTION}`;
    ui.setText("strategy-ranking-meta", "총 0개");
    ui.setText("strategy-ranking-page-status", "1 / 1");
  }

  function renderStrategyRankingFilters() {
    normalizeStrategyRankingFilters();
    const chipRow = document.getElementById("strategy-filter-chip-row");
    const activeConfig = activeStrategyFilterConfig();
    if (chipRow) {
      chipRow.innerHTML = Object.entries(activeConfig)
        .map(([key, config]) => `<button class="strategy-filter-chip${(!strategyFilterAllSelected(key) || state.strategyRankingOpenFilterKey === key) ? " active" : ""}" type="button" data-strategy-filter-button="${ui.escapeHtml(key)}">
            <span class="strategy-filter-chip-label">${ui.escapeHtml(config.label)}</span>
            <span class="strategy-filter-chip-value">${ui.escapeHtml(strategyFilterButtonSummary(key))}</span>
          </button>`)
        .join("");
      chipRow.querySelectorAll("[data-strategy-filter-button]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const key = button.getAttribute("data-strategy-filter-button");
          if (!key) {
            return;
          }
          state.strategyRankingOpenFilterKey = state.strategyRankingOpenFilterKey === key ? null : key;
          renderStrategyRankingFilters();
        });
      });
    }

    const dropdown = document.getElementById("strategy-ranking-filter-dropdown");
    if (!(dropdown instanceof HTMLElement)) {
      return;
    }
    const openKey = state.strategyRankingOpenFilterKey;
    if (!openKey || !activeConfig[openKey]) {
      dropdown.hidden = true;
      dropdown.innerHTML = "";
      return;
    }
    const button = document.querySelector(`[data-strategy-filter-button="${openKey}"]`);
    if (!(button instanceof HTMLButtonElement)) {
      state.strategyRankingOpenFilterKey = null;
      dropdown.hidden = true;
      dropdown.innerHTML = "";
      return;
    }
    const values = availableStrategyFilterValues(openKey);
    const selectedValues = strategyFilterValues(openKey);
    dropdown.innerHTML = `
      <div class="strategy-filter-dropdown-head">
        <div class="strategy-filter-dropdown-title">${ui.escapeHtml(activeConfig[openKey].label)}</div>
        <div class="strategy-filter-dropdown-all">복수 선택</div>
      </div>
      <div class="strategy-filter-option-list">
        <label class="strategy-filter-option">
          <input type="checkbox" data-strategy-filter-option-key="${ui.escapeHtml(openKey)}" data-strategy-filter-option-value="__all__"${selectedValues.length ? "" : " checked"}>
          <span>all</span>
        </label>
        ${values.map((value) => `
          <label class="strategy-filter-option">
            <input type="checkbox" data-strategy-filter-option-key="${ui.escapeHtml(openKey)}" data-strategy-filter-option-value="${ui.escapeHtml(String(value))}"${selectedValues.includes(value) ? " checked" : ""}>
            <span>${ui.escapeHtml(formatStrategyFilterOptionLabel(openKey, value))}</span>
          </label>
        `).join("")}
      </div>
    `;
    const rect = button.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 8}px`;
    dropdown.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - 280))}px`;
    dropdown.hidden = false;
    dropdown.onclick = (event) => {
      event.stopPropagation();
    };
    dropdown.querySelectorAll("[data-strategy-filter-option-value]").forEach((input) => {
      input.addEventListener("change", (event) => {
        const target = event.currentTarget;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        const filterKey = target.getAttribute("data-strategy-filter-option-key");
        const optionValue = target.getAttribute("data-strategy-filter-option-value");
        if (!filterKey || !activeConfig[filterKey]) {
          return;
        }
        if (optionValue === "__all__") {
          state.strategyRankingFilters[filterKey] = [];
          state.strategyRankingOpenFilterKey = null;
          applyStrategyFilterSelection();
          return;
        }
        const numericValue = Number(optionValue);
        const currentValues = new Set(strategyFilterValues(filterKey));
        if (target.checked) {
          currentValues.add(numericValue);
        } else {
          currentValues.delete(numericValue);
        }
        state.strategyRankingFilters[filterKey] = [...currentValues].sort((left, right) => Number(left) - Number(right));
        applyStrategyFilterSelection();
        state.strategyRankingOpenFilterKey = filterKey;
      });
    });
  }

  function renderStrategySortHeaders() {
    document.querySelectorAll("[data-strategy-sort-key]").forEach((header) => {
      const sortKey = header.getAttribute("data-strategy-sort-key");
      if (!sortKey) {
        return;
      }
      const baseLabel = header.getAttribute("data-strategy-sort-label") || header.textContent.replace(/[▲▼]\s*$/, "").trim();
      header.setAttribute("data-strategy-sort-label", baseLabel);
      header.textContent = `${baseLabel}${strategySortIndicator(sortKey)}`;
    });
  }

  function renderStrategyRanking() {
    const body = document.getElementById("strategy-ranking-body");
    const meta = document.getElementById("strategy-ranking-meta");
    const pageStatus = document.getElementById("strategy-ranking-page-status");
    const prevButton = document.getElementById("strategy-ranking-prev");
    const nextButton = document.getElementById("strategy-ranking-next");
    if (!body) {
      return;
    }
    renderStrategySortHeaders();
    renderStrategyComboSubtitle();
    renderStrategyRankingFilters();
    if (state.strategyRankingLoading) {
      renderStrategyRankingMessage("콤보 랭킹을 계산하는 중입니다.");
      return;
    }
    if (state.strategyRankingError) {
      renderStrategyRankingMessage(state.strategyRankingError);
      return;
    }
    const { actualRows, totalPages, startIndex } = pagedStrategyRankingRows();
    const rows = strategyRankingRows();
    if (!actualRows.length && !rows.length) {
      renderStrategyRankingMessage("전략 랭킹을 불러오지 못했습니다.");
      return;
    }
    if (meta) {
      meta.textContent = `총 ${ui.formatNumber(actualRows.length)}개`;
    }
    if (pageStatus) {
      pageStatus.textContent = `${state.strategyRankingPage} / ${totalPages}`;
    }
    if (prevButton instanceof HTMLButtonElement) {
      prevButton.disabled = state.strategyRankingPage <= 1;
    }
    if (nextButton instanceof HTMLButtonElement) {
      nextButton.disabled = state.strategyRankingPage >= totalPages;
    }
    body.innerHTML = rows
      .map((row, rowIndex) => {
        const active = state.selectedStrategyIds.includes(row.strategy_id);
        const focused = row.strategy_id === state.focusedStrategyId;
        const focusDisabled = Boolean(row.is_benchmark);
        const displayRank = row.is_benchmark ? "-" : String(startIndex + rowIndex);
        return `<tr class="click-row${active ? " selected-row" : ""}" data-strategy-id="${ui.escapeHtml(row.strategy_id)}">
          <td><button type="button" class="focus-toggle${focused ? " active" : ""}" data-focus-strategy-id="${ui.escapeHtml(row.strategy_id)}"${focusDisabled ? " disabled" : ""}>${focusDisabled ? "불가" : (focused ? "Focus" : "Set")}</button></td>
          <td>${active ? '<span class="badge info">선택</span>' : '<span class="badge neutral">대기</span>'}</td>
          <td class="num">${ui.escapeHtml(row.is_benchmark ? "-" : String(row.rank_display ?? row.rank ?? displayRank))}</td>
          <td>${ui.escapeHtml(row.display_params || row.combo_key)}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.full_return_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.cagr_pct))}</td>
          <td class="num">${ui.escapeHtml(ui.formatPercent(row.max_drawdown_pct))}</td>
          <td class="num">${ui.escapeHtml(row.is_benchmark ? "-" : ui.formatNumber(row.trade_count))}</td>
        </tr>`;
      })
      .join("");
    body.querySelectorAll("[data-strategy-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const strategyId = row.getAttribute("data-strategy-id");
        if (!strategyId) {
          return;
        }
        await toggleStrategySelection(strategyId);
      });
    });
    body.querySelectorAll("[data-focus-strategy-id]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const strategyId = button.getAttribute("data-focus-strategy-id");
        if (!strategyId || isBuyHoldStrategyId(strategyId)) {
          return;
        }
        await setFocusedStrategy(strategyId);
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
      button.addEventListener("click", async () => {
        const presetId = button.getAttribute("data-preset-id");
        const preset = state.strategyExplorer.meta.slice_presets.find((item) => item.preset_id === presetId);
        if (!preset) {
          return;
        }
        state.selectedStrategyPresetId = preset.preset_id;
        setStrategyDateInputs(preset.start, preset.end);
        resetThreadHistoryPage();
        try {
          await reloadStrategySlice();
        } catch (error) {
          renderStrategyRankingMessage(error instanceof Error ? error.message : "콤보 랭킹을 불러오지 못했습니다.");
        }
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
      setEmptyChart("strategy-equity-chart", "선택 콤보 상세를 불러오는 중입니다.");
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
      setEmptyChart("strategy-drawdown-chart", "선택 콤보 상세를 불러오는 중입니다.");
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
      body.innerHTML = '<tr><td colspan="13" class="muted" style="text-align:center">선택 구간에 표시할 거래 이력이 없습니다.</td></tr>';
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
            <td class="num">${ui.escapeHtml(ui.formatMoney(interval.total_fees || 0))}</td>
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
    const feeNote = state.threadTimeline ? formatFeeNote(state.threadTimeline.meta) : "수수료 기준: 0.25% + 기타거래세";
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
        <div class="meta-item"><span>진입 수수료</span><strong>${ui.escapeHtml(ui.formatMoney(interval.entry_fee || 0))}</strong></div>
        <div class="meta-item"><span>종료 수수료</span><strong>${ui.escapeHtml(ui.formatMoney(interval.exit_fee || 0))}</strong></div>
        <div class="meta-item"><span>총 수수료</span><strong>${ui.escapeHtml(ui.formatMoney(interval.total_fees || 0))}</strong></div>
        <div class="meta-item"><span>PNL</span><strong>${ui.escapeHtml(interval.pnl ? ui.formatMoney(interval.pnl) : "-")}</strong></div>
        <div class="meta-item"><span>Return</span><strong>${ui.escapeHtml(interval.return_pct ? ui.formatPercent(interval.return_pct) : "-")}</strong></div>
        <div class="meta-item"><span>보유 기간</span><strong>${ui.escapeHtml(formatHoldingSessions(interval.holding_sessions))}</strong></div>
      </div>
      <div class="muted" style="font-size:12px;margin-top:10px">${ui.escapeHtml(feeNote)}</div>
    </section>`;
  }

  function renderThreadEntrySessionDetail(session) {
    const feeNote = state.threadTimeline ? formatFeeNote(state.threadTimeline.meta) : "수수료 기준: 0.25% + 기타거래세";
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
            <div class="meta-item"><span>진입 수수료</span><strong>${ui.escapeHtml(ui.formatMoney(row.entry_fee || 0))}</strong></div>
          </div>
          <div class="muted" style="font-size:12px;margin-top:10px">${ui.escapeHtml(feeNote)}</div>
        </section>`,
      )
      .join("");
    return `<section class="thread-detail-stack">
      <div class="thread-batch-cards">${cards}</div>
    </section>`;
  }

  function renderThreadExitSessionDetail(session) {
    const totalPnl = (session.exit_batch || []).reduce((sum, row) => sum + parseMoney(row.pnl), 0);
    const feeNote = state.threadTimeline ? formatFeeNote(state.threadTimeline.meta) : "수수료 기준: 0.25% + 기타거래세";
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
            <div class="meta-item"><span>진입 수수료</span><strong>${ui.escapeHtml(ui.formatMoney(row.entry_fee || 0))}</strong></div>
            <div class="meta-item"><span>종료 수수료</span><strong>${ui.escapeHtml(ui.formatMoney(row.exit_fee || 0))}</strong></div>
            <div class="meta-item"><span>총 수수료</span><strong>${ui.escapeHtml(ui.formatMoney(row.total_fees || 0))}</strong></div>
            <div class="meta-item"><span>PNL</span><strong>${ui.escapeHtml(ui.formatMoney(row.pnl))}</strong></div>
            <div class="meta-item"><span>Return</span><strong>${ui.escapeHtml(ui.formatPercent(row.return_pct))}</strong></div>
            <div class="meta-item"><span>보유 기간</span><strong>${ui.escapeHtml(formatHoldingSessions(row.holding_sessions))}</strong></div>
          </div>
          <div class="muted" style="font-size:12px;margin-top:10px">${ui.escapeHtml(feeNote)}</div>
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
    if (!hasElement("strategy-rolling-chart")) {
      return;
    }
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
      setEmptyChart("strategy-rolling-chart", "선택 콤보 상세를 불러오는 중입니다.");
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
    if (!hasElement("strategy-monthly-chart")) {
      return;
    }
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
      setEmptyChart("strategy-monthly-chart", "선택 콤보 상세를 불러오는 중입니다.");
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
    const head = document.getElementById("strategy-segment-head");
    const body = document.getElementById("strategy-segment-body");
    if (!head || !body) {
      return;
    }
    if (!state.strategyExplorer || !state.selectedStrategyIds.length) {
      body.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center">선택 전략이 없습니다.</td></tr>';
      return;
    }
    const slice = currentStrategySlice();
    const strategies = state.selectedStrategyIds.map((strategyId) => getStrategyById(strategyId)).filter(Boolean);
    if (!strategies.length) {
      body.innerHTML = '<tr><td colspan="3" class="muted" style="text-align:center">선택 콤보 상세를 불러오는 중입니다.</td></tr>';
      return;
    }
    head.innerHTML = `<tr>
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
    body.innerHTML = rows
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
    updateStrategyDetailMismatchNotice();
    renderStrategyKpis();
    renderStrategyEquityChart();
    renderStrategyDrawdownChart();
    renderStrategyRollingChart();
    renderStrategyMonthlyChart();
    renderStrategySegmentTable();
    renderThreadViews();
  }

  function renderOfficialMeta() {
    ui.setText("official-combo", state.officialExplorer?.official_profile?.combo_key || "-");
    ui.setText("official-ranking-basis", state.officialExplorer?.meta?.selection_basis || "-");
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
      <th class="sticky-3 benchmark-col">${ui.escapeHtml(payload.meta.symbol)}</th>
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

  async function loadOfficialMatrix() {
    const workspace = currentWorkspace();
    if (!workspaceSupportsOfficialReference(workspace) || !state.dataStatus) {
      state.officialMatrix = null;
      renderOfficialMatrix();
      return;
    }
    if (state.officialMatrix) {
      renderOfficialMatrix();
      return;
    }
    const body = document.getElementById("official-matrix-body");
    if (body) {
      body.innerHTML = '<tr><td class="muted" style="text-align:center">공식 매트릭스를 불러오는 중입니다.</td></tr>';
    }
    const csvPath = state.dataStatus.snapshot_path || "";
    const profileId = workspace.defaultProfileId || state.profileId;
    try {
      state.officialMatrix = await ui.fetchJson(
        `/api/backtests/official-matrix?${new URLSearchParams({ profileId, csvPath }).toString()}`,
      );
      renderOfficialMatrix();
    } catch (error) {
      state.officialMatrix = null;
      if (body) {
        const message = error instanceof Error ? error.message : "공식 매트릭스를 불러오지 못했습니다.";
        body.innerHTML = `<tr><td class="muted" style="text-align:center">${ui.escapeHtml(message)}</td></tr>`;
      }
    }
  }

  function renderStrategyExplorer(payload) {
    state.strategyExplorer = payload;
    const activePreset = payload.meta.slice_presets.find((preset) => preset.preset_id === state.selectedStrategyPresetId) || payload.meta.slice_presets[0];
    if (activePreset) {
      setStrategyDateInputs(activePreset.start, activePreset.end);
    }
    renderStrategySlicePresets();
    resetStrategyMetaNotice();
  }

  function currentSweepRows() {
    const payload = state.sweepArtifact?.payload;
    if (!payload) {
      return [];
    }
    const minReturn = Number(document.getElementById("sweep-filter-min-return").value || 0);
    const maxMdd = Number(document.getElementById("sweep-filter-max-mdd").value || -100);
    const minCagr = Number(document.getElementById("sweep-filter-min-cagr").value || -100);
    const paretoMode = document.getElementById("sweep-filter-pareto").value || "all";
    return payload.rows.filter((row) => {
      if (row.metrics.full_return_pct < minReturn) {
        return false;
      }
      if (row.metrics.max_drawdown_pct < maxMdd) {
        return false;
      }
      if (row.metrics.cagr_pct < minCagr) {
        return false;
      }
      if (paretoMode === "return_mdd" && !row.flags.pareto_return_mdd) {
        return false;
      }
      return true;
    });
  }

  function renderSweepSummary(payload, filteredRows) {
    ui.setText("sweep-kpi-count", ui.formatNumber(payload.meta.combo_count));
    ui.setText("sweep-kpi-best-full", payload.summary.best_full_return_combo);
    ui.setText("sweep-kpi-best-robust", payload.summary.best_robust_combo);
    ui.setText("sweep-kpi-pareto", ui.formatNumber(payload.summary.pareto_return_mdd_count));
    document.getElementById("sweep-meta-note").textContent = "";
  }

  function renderSweepWarnings(payload, filteredRows) {
    const rows = payload.warnings.slice();
    if (filteredRows.length) {
      const leader = filteredRows[0];
      if (leader.metrics.max_drawdown_pct < -60) {
        rows.push(`필터 기준 1위 ${leader.combo_key} 의 MDD가 ${leader.metrics.max_drawdown_pct.toFixed(2)}% 입니다.`);
      }
      if (leader.metrics.cagr_pct < 0) {
        rows.push(`필터 기준 1위 ${leader.combo_key} 의 CAGR이 ${leader.metrics.cagr_pct.toFixed(2)}% 입니다.`);
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
            color: filteredRows.map((row) => row.metrics.cagr_pct),
            colorscale: "RdYlGn",
            line: {
              color: filteredRows.map((row) => (row.flags.pareto_return_mdd ? "#241d15" : "transparent")),
              width: 1.4,
            },
            colorbar: { title: "CAGR %" },
          },
          hovertemplate: "%{text}<br>MDD %{x:.2f}%<br>Return %{y:.2f}%<br>CAGR %{marker.color:.2f}%<extra></extra>",
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
          y: filteredRows.map((row) => row.metrics.cagr_pct),
          type: "box",
          boxpoints: "outliers",
          marker: { color: "#d78a4b" },
          line: { color: "#91502d" },
          hovertemplate: `${axis}=%{x}<br>CAGR %{y:.2f}%<extra></extra>`,
        },
      ],
      {
        ...chartLayoutBase(),
        xaxis: { ...chartLayoutBase().xaxis, title: axis },
        yaxis: { ...chartLayoutBase().yaxis, title: "CAGR %" },
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
            color: filteredRows.map((row) => row.metrics.cagr_pct),
            colorscale: "RdYlGn",
            showscale: true,
            colorbar: { title: "CAGR %" },
          },
          dimensions: [
            { label: "thread", values: filteredRows.map((row) => row.params.thread_count) },
            { label: "stop", values: filteredRows.map((row) => row.params.stop_sessions) },
            { label: "buy %", values: filteredRows.map((row) => row.params.buy_pct) },
            { label: "sell %", values: filteredRows.map((row) => row.params.sell_pct) },
            { label: "full return", values: filteredRows.map((row) => row.metrics.full_return_pct) },
            { label: "CAGR", values: filteredRows.map((row) => row.metrics.cagr_pct) },
            { label: "MDD", values: filteredRows.map((row) => row.metrics.max_drawdown_pct) },
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
      tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center">필터 결과가 없습니다.</td></tr>';
      return;
    }
    tbody.innerHTML = filteredRows.slice(0, 10).map((row) => {
      const pareto = [];
      if (row.flags.pareto_return_mdd) {
        pareto.push("R/MDD");
      }
      return `<tr>
        <td class="mono">${ui.escapeHtml(row.combo_key)}</td>
        <td class="num">${ui.escapeHtml(`T${row.params.thread_count} S${row.params.stop_sessions} BUY${formatSignedSweepPercent(row.params.buy_pct)} SELL${formatSignedSweepPercent(row.params.sell_pct)}`)}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.full_return_pct))}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.cagr_pct))}</td>
        <td class="num">${ui.escapeHtml(ui.formatPercent(row.metrics.max_drawdown_pct))}</td>
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
        '<tr><td colspan="6" class="muted" style="text-align:center">스윕 결과를 불러오지 않았습니다.</td></tr>';
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

  async function loadThreadTimeline(requestId = state.strategySliceRequestId) {
    if (!state.focusedStrategyId || !state.dataStatus) {
      abortThreadTimelineRequest();
      state.threadTimeline = null;
      resetThreadHistoryPage();
      renderThreadViews();
      return;
    }
    const context = buildThreadTimelineContext(state.focusedStrategyId);
    if (!context) {
      abortThreadTimelineRequest();
      state.threadTimeline = null;
      resetThreadHistoryPage();
      renderThreadViews();
      return;
    }
    const cacheKey = makeThreadTimelineStateKey(context);
    if (state.threadTimelineCache[cacheKey] && threadTimelineMatchesContext(state.threadTimelineCache[cacheKey], context)) {
      state.threadTimeline = state.threadTimelineCache[cacheKey];
      resetThreadHistoryPage();
      renderThreadViews();
      return;
    }
    abortThreadTimelineRequest();
    const controller = new AbortController();
    state.threadTimelineController = controller;
    state.threadTimeline = null;
    resetThreadHistoryPage();
    renderThreadViews();
    const params = new URLSearchParams({
      profileId: context.profileId,
      csvPath: context.csvPath,
      strategyId: context.strategyId,
      executionModel: context.executionModel,
      priceBasis: context.priceBasis,
    });
    params.set("sliceStart", context.sliceStart);
    params.set("sliceEnd", context.sliceEnd);
    appendStrategyRegimeParams(params);
    try {
      const payload = await ui.fetchJson(`/api/backtests/thread-timeline?${params.toString()}`, { signal: controller.signal });
      if (state.threadTimelineController !== controller) {
        return;
      }
      state.threadTimelineController = null;
      if (!shouldAcceptThreadTimelinePayload({
        activeRequestId: state.strategySliceRequestId,
        requestId,
        payload,
        context,
      })) {
        return;
      }
      if (state.focusedStrategyId !== payload.meta.strategy_id) {
        return;
      }
      state.threadTimelineCache[cacheKey] = payload;
      state.threadTimeline = payload;
      resetThreadHistoryPage();
      renderThreadViews();
    } catch (error) {
      if (state.threadTimelineController === controller) {
        state.threadTimelineController = null;
      }
      if (ui.isAbortError && ui.isAbortError(error)) {
        return;
      }
      state.threadTimeline = null;
      resetThreadHistoryPage();
      renderThreadViews();
    }
  }

  async function loadStrategyRanking(requestId = state.strategySliceRequestId) {
    if (!state.dataStatus || !state.strategyExplorer) {
      state.strategyRanking = null;
      if (state.strategySliceRequestId === requestId) {
        state.strategyRankingLoading = false;
        state.strategyRankingError = "";
      }
      return null;
    }
    abortStrategyRankingRequest();
    const controller = new AbortController();
    state.strategyRankingController = controller;
    const csvPath = state.dataStatus.snapshot_path || "";
    const slice = currentStrategySlice();
    const executionModel = currentStrategyExecutionModel();
    const priceBasis = currentStrategyPriceBasis();
    const params = new URLSearchParams({
      profileId: state.profileId,
      csvPath,
      executionModel,
      priceBasis,
      limit: "0",
    });
    if (slice?.start) {
      params.set("sliceStart", slice.start);
    }
    if (slice?.end) {
      params.set("sliceEnd", slice.end);
    }
    appendStrategyRegimeParams(params);
    state.strategyRankingLoading = true;
    state.strategyRankingError = "";
    renderStrategyRankingMessage("콤보 랭킹을 계산하는 중입니다.");
    resetStrategyMetaNotice();
    try {
      const payload = await ui.fetchJson(`/api/backtests/strategy-ranking?${params.toString()}`, { signal: controller.signal });
      if (state.strategyRankingController !== controller || state.strategySliceRequestId !== requestId) {
        return null;
      }
      state.strategyRanking = payload;
      state.strategyRankingLoading = false;
      state.strategyRankingError = "";
      state.strategyRankingController = null;
      return payload;
    } catch (error) {
      if (state.strategyRankingController === controller) {
        state.strategyRankingController = null;
      }
      if (ui.isAbortError && ui.isAbortError(error)) {
        return null;
      }
      if (state.strategySliceRequestId === requestId) {
        state.strategyRanking = null;
        state.strategyRankingLoading = false;
        state.strategyRankingError = error instanceof Error ? error.message : "콤보 랭킹을 불러오지 못했습니다.";
        renderStrategyRankingMessage(state.strategyRankingError);
      }
      throw error;
    }
  }

  function scheduleStrategyDetailsAndTimelineLoad(requestId = state.strategySliceRequestId) {
    const selectedIds = [...state.selectedStrategyIds];
    void ensureStrategyDetails(selectedIds, requestId)
      .then(() => {
        if (state.strategySliceRequestId !== requestId) {
          return;
        }
        renderStrategyRanking();
        renderStrategyViews();
      })
      .catch((error) => {
        if (state.strategySliceRequestId !== requestId) {
          return;
        }
        if (ui.isAbortError && ui.isAbortError(error)) {
          return;
        }
        setStrategyDetailError(error instanceof Error ? error.message : "선택 콤보 상세를 불러오지 못했습니다.");
      });
    if (state.strategySliceRequestId === requestId) {
      void loadThreadTimeline(requestId);
    }
  }

  async function reloadStrategySlice() {
    if (!state.strategyExplorer) {
      return;
    }
    const requestId = beginStrategySliceReload("콤보 랭킹을 계산하는 중입니다.");
    renderStrategySlicePresets();
    const ranking = await loadStrategyRanking(requestId);
    if (!ranking || state.strategySliceRequestId !== requestId) {
      return;
    }
    state.selectedStrategyIds = [];
    state.strategyRankingLoading = false;
    state.strategyRankingError = "";
    ensureStrategySelection();
    renderStrategyRanking();
    renderStrategyViews();
    scheduleStrategyDetailsAndTimelineLoad(requestId);
  }

  async function loadStrategyData() {
    const requestId = beginStrategySliceReload("콤보 랭킹을 계산하는 중입니다.");
    const csvPath = state.dataStatus?.snapshot_path || "";
    const workspace = currentWorkspace();
    const executionModel = workspace?.defaultStrategyExecutionModel || currentProfile()?.executionModel || "ideal_same_close";
    const priceBasis = workspace?.defaultStrategyPriceBasis || currentProfile()?.priceBasis || "adjusted_close";
    const officialEnabled = workspaceSupportsOfficialReference(workspace);
    const requests = [
      ui.fetchJson(`/api/backtests/strategy-explorer?${new URLSearchParams({ profileId: state.profileId, csvPath, executionModel, priceBasis }).toString()}`),
    ];
    if (officialEnabled) {
      requests.unshift(
        ui.fetchJson(`/api/backtests/official-explorer?${new URLSearchParams({ profileId: state.profileId, csvPath }).toString()}`),
      );
    }
    const [firstPayload, secondPayload] = await Promise.all(requests);
    abortStrategyDetailRequests();
    abortThreadTimelineRequest();
    state.strategyDetails = {};
    state.strategyDetailPending = {};
    state.strategyDetailControllers = {};
    state.threadTimelineCache = {};
    state.officialExplorer = officialEnabled ? firstPayload : null;
    state.officialMatrix = null;
    renderOfficialMeta();
    renderStrategyExplorer(officialEnabled ? secondPayload : firstPayload);
    const ranking = await loadStrategyRanking(requestId);
    if (!ranking || state.strategySliceRequestId !== requestId) {
      return;
    }
    state.selectedStrategyIds = [];
    state.strategyRankingLoading = false;
    state.strategyRankingError = "";
    ensureStrategySelection();
    renderStrategyRanking();
    renderStrategyViews();
    scheduleStrategyDetailsAndTimelineLoad(requestId);
  }

  async function loadLatestSweep() {
    const csvPath = state.dataStatus?.snapshot_path || "";
    const workspace = currentWorkspace();
    const params = new URLSearchParams({
      profileId: state.profileId,
      csvPath,
      sweepId: SWEEP_DEFINITION_ID,
      executionModel: document.getElementById("sweep-model").value || workspace?.defaultSweepExecutionModel || "next_open",
      priceBasis: document.getElementById("sweep-price-basis").value || workspace?.defaultSweepPriceBasis || "adjusted_close",
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
    applyWorkspaceDefaults(workspace);
    renderStrategyRegimeCard();
    renderDataStatus(dataStatus);
    await Promise.all([loadStrategyData(), loadLatestSweep()]);
  }

  window.__strategyDashboardTestHooks = {
    makeStrategyDetailStateKey,
    makeThreadTimelineStateKey,
    normalizeStrategyDetailPayload,
    strategyDetailMatchesContext,
    threadTimelineMatchesContext,
    strategyDetailReturnPct,
    strategyDetailMatchesRanking,
    shouldAcceptStrategyDetailPayload,
    shouldAcceptThreadTimelinePayload,
  };

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.getAttribute("data-tab");
        if (tabId) {
          activateTab(tabId);
          if (tabId === "mentor") {
            void loadOfficialMatrix();
          }
        }
      });
    });

    bootstrap().catch((error) => {
      renderStrategyRankingMessage(error.message);
      document.getElementById("sweep-meta-note").textContent = error.message;
    });

    document.getElementById("strategy-apply-button").addEventListener("click", async (event) => {
      event.preventDefault();
      syncStrategyRegimeStateFromInputs();
      renderStrategyRegimeCard();
      state.selectedStrategyPresetId = "custom";
      resetThreadHistoryPage();
      setStrategyApplyPending(true);
      try {
        await reloadStrategySlice();
      } catch (error) {
        renderStrategyRankingMessage(error instanceof Error ? error.message : "콤보 랭킹을 불러오지 못했습니다.");
      } finally {
        setStrategyApplyPending(false);
      }
    });

    document.querySelectorAll("[data-strategy-sort-key]").forEach((header) => {
      header.addEventListener("click", () => {
        const sortKey = header.getAttribute("data-strategy-sort-key");
        if (!sortKey) {
          return;
        }
        if (state.strategyRankingSortKey === sortKey) {
          state.strategyRankingSortDirection = state.strategyRankingSortDirection === "asc" ? "desc" : "asc";
        } else {
          state.strategyRankingSortKey = sortKey;
          state.strategyRankingSortDirection = sortKey === "rank" ? "asc" : "desc";
        }
        resetStrategyRankingPage();
        renderStrategyRanking();
      });
    });

    const regimeEnabled = document.getElementById("strategy-regime-enabled");
    if (regimeEnabled instanceof HTMLInputElement) {
      regimeEnabled.addEventListener("change", () => {
        syncStrategyRegimeStateFromInputs();
        renderStrategyRegimeCard();
      });
    }

    const strategyRegimeHelpOpen = document.getElementById("strategy-regime-help-open");
    if (strategyRegimeHelpOpen instanceof HTMLButtonElement) {
      strategyRegimeHelpOpen.addEventListener("click", () => {
        openStrategyRegimeHelp();
      });
    }

    const strategyRegimeHelpClose = document.getElementById("strategy-regime-help-close");
    if (strategyRegimeHelpClose instanceof HTMLButtonElement) {
      strategyRegimeHelpClose.addEventListener("click", () => {
        closeStrategyRegimeHelp();
      });
    }

    const strategyRegimeHelpBackdrop = document.getElementById("strategy-regime-help-backdrop");
    if (strategyRegimeHelpBackdrop instanceof HTMLElement) {
      strategyRegimeHelpBackdrop.addEventListener("click", () => {
        closeStrategyRegimeHelp();
      });
    }

    [
      "strategy-regime-rsi-period",
      "strategy-regime-bear-high-threshold",
      "strategy-regime-bear-mid-low-threshold",
      "strategy-regime-bear-mid-high-threshold",
      "strategy-regime-bull-low-threshold",
      "strategy-regime-bull-mid-low-threshold",
      "strategy-regime-bull-mid-high-threshold",
      "strategy-regime-base-stop",
      "strategy-regime-base-buy",
      "strategy-regime-base-sell",
      "strategy-regime-bull-stop",
      "strategy-regime-bull-buy",
      "strategy-regime-bull-sell",
      "strategy-regime-bear-stop",
      "strategy-regime-bear-buy",
      "strategy-regime-bear-sell",
    ].forEach((id) => {
      const input = document.getElementById(id);
      if (!(input instanceof HTMLInputElement)) {
        return;
      }
      input.addEventListener("change", () => {
        syncStrategyRegimeStateFromInputs();
      });
    });

    const strategyRankingPrev = document.getElementById("strategy-ranking-prev");
    if (strategyRankingPrev) {
      strategyRankingPrev.addEventListener("click", () => {
        if (state.strategyRankingPage <= 1) {
          return;
        }
        state.strategyRankingPage -= 1;
        renderStrategyRanking();
      });
    }

    const strategyRankingNext = document.getElementById("strategy-ranking-next");
    if (strategyRankingNext) {
      strategyRankingNext.addEventListener("click", () => {
        const totalPages = Math.max(1, Math.ceil(filteredStrategyRankingRows().length / state.strategyRankingPageSize));
        if (state.strategyRankingPage >= totalPages) {
          return;
        }
        state.strategyRankingPage += 1;
        renderStrategyRanking();
      });
    }

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
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        state.strategyRankingOpenFilterKey
        && !target.closest("[data-strategy-filter-button]")
        && !target.closest("#strategy-ranking-filter-dropdown")
      ) {
        state.strategyRankingOpenFilterKey = null;
        renderStrategyRankingFilters();
      }
      const drawer = document.getElementById("thread-drawer");
      if (!drawer.classList.contains("visible")) {
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
      document.getElementById("sweep-filter-min-cagr").value = "-100";
      document.getElementById("sweep-filter-pareto").value = "all";
      if (state.sweepArtifact) {
        renderSweepArtifact(state.sweepArtifact);
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        if (state.strategyRankingOpenFilterKey) {
          state.strategyRankingOpenFilterKey = null;
          renderStrategyRankingFilters();
        }
        closeStrategyRegimeHelp();
        closeThreadDrawer();
      }
    });
  });
})();
