(function () {
  const ui = window.SOXLDashboard || {
    escapeHtml(value) {
      return String(value ?? "");
    },
    formatPercent(value) {
      return `${Number(value).toFixed(2)}%`;
    },
  };

  const PARAM_LABELS = {
    thread_count: "Thread 수",
    stop_sessions: "손절일",
    buy_pct: "매수 %",
    sell_pct: "매도 %",
  };
  const PARAM_ORDER = ["thread_count", "stop_sessions", "buy_pct", "sell_pct"];
  const PARAM_SHORT_LABELS = {
    thread_count: "thread",
    stop_sessions: "stop",
    buy_pct: "buy %",
    sell_pct: "sell %",
  };
  const PLATEAU_LABELS = {
    P: "PLATEAU",
    M: "MIXED",
    I: "ISLAND",
    E: "EDGE",
  };
  const PLATEAU_SORT = {
    P: 4,
    M: 3,
    I: 2,
    E: 1,
  };
  const PRESET_LABELS = {
    all: "전체",
    plateau_robust: "PLATEAU + ROBUST",
    recent_safe: "Recent MDD ≥ -45%",
    recent_extreme_safe: "Recent MDD ≥ -35%",
  };
  const DEFAULT_EMPTY_MESSAGE = "최신 스윕 산출물이 없습니다. Codex에서 생성한 뒤 다시 읽어오세요.";

  const state = {
    mounted: false,
    root: null,
    payload: null,
    rows: [],
    parameterHash: "",
    parameterValues: {},
    plateau: "all",
    tier: "all",
    meanCagrMin: 0,
    recentMddFloor: -100,
    preset: "all",
    boxAxis: "thread_count",
    sortBy: "compoundRatioLog10",
    sortDesc: true,
    pcSelections: new Map(),
    tableSelections: new Map(),
  };

  function templateHtml() {
    return `
      <div class="sweep-ref-shell">
        <div class="sweep-ref-message" id="sweep-ref-top-message"></div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">과적합 방지 필터</div>
              <div class="card-sub">참고 대시보드와 같은 구조로 파라미터 조합을 필터링합니다.</div>
            </div>
          </div>
          <div class="sweep-ref-controls">
            <div class="field">
              <label for="sweep-ref-filter-plateau">분류 (Plateau)</label>
              <select class="select" id="sweep-ref-filter-plateau">
                <option value="all">모두 보기</option>
                <option value="P">PLATEAU</option>
                <option value="M">MIXED</option>
                <option value="I">ISLAND</option>
                <option value="E">EDGE</option>
              </select>
            </div>
            <div class="field">
              <label for="sweep-ref-filter-tier">Tier 1-4 통과</label>
              <select class="select" id="sweep-ref-filter-tier">
                <option value="all">모두</option>
                <option value="1">ROBUST</option>
                <option value="0">FAIL</option>
              </select>
            </div>
            <div class="field">
              <label for="sweep-ref-mean-cagr">최소 mean_CAGR <span class="sweep-ref-inline-value" id="sweep-ref-mean-cagr-value">0</span>%</label>
              <input id="sweep-ref-mean-cagr" type="range" min="0" max="50" value="0" step="1">
            </div>
            <div class="field">
              <label for="sweep-ref-recent-mdd">최대 recent MDD <span class="sweep-ref-inline-value" id="sweep-ref-recent-mdd-value">-100</span>%</label>
              <input id="sweep-ref-recent-mdd" type="range" min="-100" max="0" value="-100" step="1">
            </div>
          </div>
          <div class="sweep-ref-preset-row">
            <button class="btn active" type="button" data-sweep-ref-preset="all" data-base-label="${PRESET_LABELS.all}">${PRESET_LABELS.all}</button>
            <button class="btn" type="button" data-sweep-ref-preset="plateau_robust" data-base-label="${PRESET_LABELS.plateau_robust}">${PRESET_LABELS.plateau_robust}</button>
            <button class="btn" type="button" data-sweep-ref-preset="recent_safe" data-base-label="${PRESET_LABELS.recent_safe}">${PRESET_LABELS.recent_safe}</button>
            <button class="btn" type="button" data-sweep-ref-preset="recent_extreme_safe" data-base-label="${PRESET_LABELS.recent_extreme_safe}">${PRESET_LABELS.recent_extreme_safe}</button>
          </div>
          <div class="sweep-ref-help-row">
            <button class="badge neutral sweep-ref-help-trigger" type="button" data-help-key="plateau">Plateau 도움말</button>
            <button class="badge neutral sweep-ref-help-trigger" type="button" data-help-key="tier">Tier 도움말</button>
            <button class="badge neutral sweep-ref-help-trigger" type="button" data-help-key="compound">compound_ratio 도움말</button>
          </div>
        </div>

        <div class="sweep-ref-stats">
          <div class="sweep-ref-stat-card"><span class="sweep-ref-stat-label">선택된 combos</span><span class="sweep-ref-stat-value" id="sweep-ref-stat-count">0</span></div>
          <div class="sweep-ref-stat-card"><span class="sweep-ref-stat-label">mean CAGR 평균</span><span class="sweep-ref-stat-value" id="sweep-ref-stat-mean-cagr">—</span></div>
          <div class="sweep-ref-stat-card"><span class="sweep-ref-stat-label">full MDD 평균</span><span class="sweep-ref-stat-value" id="sweep-ref-stat-full-mdd">—</span></div>
          <div class="sweep-ref-stat-card"><span class="sweep-ref-stat-label">recent MDD 평균</span><span class="sweep-ref-stat-value" id="sweep-ref-stat-recent-mdd">—</span></div>
          <div class="sweep-ref-stat-card"><span class="sweep-ref-stat-label">PLATEAU 비율</span><span class="sweep-ref-stat-value" id="sweep-ref-stat-plateau">—</span></div>
        </div>

        <div class="card">
          <div class="card-head">
            <div>
              <div class="card-title">평행 좌표 그래프 (Parallel Coordinates)</div>
              <div class="card-sub">파라미터와 핵심 성과 지표를 한 번에 비교합니다.</div>
            </div>
          </div>
          <div class="sweep-ref-legend">
            <div class="sweep-ref-legend-item"><span class="sweep-ref-legend-swatch plateau"></span>PLATEAU</div>
            <div class="sweep-ref-legend-item"><span class="sweep-ref-legend-swatch mixed"></span>MIXED / ISLAND / EDGE</div>
            <div class="sweep-ref-legend-item"><span class="sweep-ref-legend-swatch fail"></span>Tier FAIL</div>
            <div class="sweep-ref-legend-item sweep-ref-legend-tail">투명도 = compound_ratio log10</div>
          </div>
          <div class="sweep-ref-canvas-wrap">
            <canvas id="sweep-ref-pc-canvas" width="1200" height="420"></canvas>
            <div class="sweep-ref-tooltip" id="sweep-ref-pc-tooltip"></div>
          </div>
          <div class="sweep-ref-filter-strip" id="sweep-ref-pc-filters"></div>
          <div class="notice">각 파라미터 아래 필터로 특정 값만 남길 수 있습니다. 선 다발이 두터운 구간이 비교적 안정적인 영역입니다.</div>
        </div>

        <div class="row row-2">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">CAGR vs MDD — Pareto 영역</div>
                <div class="card-sub">full-period MDD와 mean_CAGR 기준 frontier를 봅니다.</div>
              </div>
            </div>
            <div class="sweep-ref-canvas-wrap">
              <canvas id="sweep-ref-scatter-canvas" width="600" height="380"></canvas>
            </div>
            <div class="notice">좌상단이 아니라 우상단에 가까울수록 높은 CAGR과 덜 음수인 MDD 조합입니다.</div>
          </div>
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">파라미터별 mean_CAGR 분포</div>
                <div class="card-sub">파라미터 값별로 mean_CAGR box 분포를 비교합니다.</div>
              </div>
              <select class="select" id="sweep-ref-box-axis" style="width: 180px"></select>
            </div>
            <div class="sweep-ref-canvas-wrap">
              <canvas id="sweep-ref-box-canvas" width="600" height="380"></canvas>
            </div>
          </div>
        </div>

        <div class="row row-2">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Recent CAGR vs Recent MDD</div>
                <div class="card-sub">최근 2개 평가 윈도우를 합친 성과입니다.</div>
              </div>
            </div>
            <div class="sweep-ref-canvas-wrap">
              <canvas id="sweep-ref-recent-scatter-canvas" width="600" height="380"></canvas>
            </div>
          </div>
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">파라미터별 PLATEAU 비율</div>
                <div class="card-sub">robust 중심에 가까운 값이 어디인지 봅니다.</div>
              </div>
            </div>
            <div class="sweep-ref-canvas-wrap">
              <canvas id="sweep-ref-plateau-canvas" width="600" height="380"></canvas>
            </div>
          </div>
        </div>

        <div class="row row-2">
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Tier 통과 분포 (Stacked)</div>
                <div class="card-sub">파라미터 값별 ROBUST / FAIL 비중입니다.</div>
              </div>
            </div>
            <div class="sweep-ref-canvas-wrap">
              <canvas id="sweep-ref-tier-canvas" width="600" height="380"></canvas>
            </div>
          </div>
          <div class="card">
            <div class="card-head">
              <div>
                <div class="card-title">Sweet Spot Score vs Recent MDD</div>
                <div class="card-sub">compound_ratio와 recent MDD를 함께 봅니다.</div>
              </div>
            </div>
            <div class="sweep-ref-canvas-wrap">
              <canvas id="sweep-ref-score-canvas" width="600" height="380"></canvas>
            </div>
          </div>
        </div>

        <div class="card wide-table">
          <div class="card-head">
            <div>
              <div class="card-title">필터된 combo 표 (compound_ratio 기준 Top 100)</div>
              <div class="card-sub">기본 정렬은 compound_ratio desc 입니다.</div>
            </div>
          </div>
          <div class="sweep-ref-filter-strip" id="sweep-ref-table-filters"></div>
          <div class="tbl-wrap" style="margin-top: 14px">
            <table class="tbl sweep-ref-table">
              <thead>
                <tr>
                  <th data-sort-key="comboKey">Combo</th>
                  <th class="num" data-sort-key="thread_count">Thread</th>
                  <th class="num" data-sort-key="stop_sessions">Stop</th>
                  <th class="num" data-sort-key="buy_pct">Buy %</th>
                  <th class="num" data-sort-key="sell_pct">Sell %</th>
                  <th class="num" data-sort-key="meanCagr">mean_CAGR</th>
                  <th class="num" data-sort-key="fullMdd">Full MDD</th>
                  <th class="num" data-sort-key="recentMdd">Recent MDD</th>
                  <th class="num" data-sort-key="worstWindowCagr">worst_window</th>
                  <th data-sort-key="plateauSort">plateau</th>
                  <th data-sort-key="tierPassSort">tier_pass</th>
                  <th class="num" data-sort-key="compoundRatioLog10">compound_ratio</th>
                </tr>
              </thead>
              <tbody id="sweep-ref-table-body">
                <tr><td colspan="12" class="muted" style="text-align: center">${ui.escapeHtml(DEFAULT_EMPTY_MESSAGE)}</td></tr>
              </tbody>
            </table>
          </div>
          <div class="sweep-ref-table-count" id="sweep-ref-table-count"></div>
        </div>
      </div>
      <div class="sweep-ref-help-tooltip" id="sweep-ref-help-tooltip"></div>
    `;
  }

  function mount(options = {}) {
    if (state.mounted) {
      return;
    }
    const rootId = options.rootId || "sweep-reference-root";
    const root = document.getElementById(rootId);
    if (!(root instanceof HTMLElement)) {
      return;
    }
    root.innerHTML = templateHtml();
    state.root = root;
    state.mounted = true;
    bindEvents();
    setEmptyState(DEFAULT_EMPTY_MESSAGE);
  }

  function bindEvents() {
    const plateau = document.getElementById("sweep-ref-filter-plateau");
    const tier = document.getElementById("sweep-ref-filter-tier");
    const meanCagr = document.getElementById("sweep-ref-mean-cagr");
    const recentMdd = document.getElementById("sweep-ref-recent-mdd");
    const boxAxis = document.getElementById("sweep-ref-box-axis");
    if (plateau instanceof HTMLSelectElement) {
      plateau.addEventListener("change", () => {
        state.plateau = plateau.value;
        renderAll();
      });
    }
    if (tier instanceof HTMLSelectElement) {
      tier.addEventListener("change", () => {
        state.tier = tier.value;
        renderAll();
      });
    }
    if (meanCagr instanceof HTMLInputElement) {
      meanCagr.addEventListener("input", () => {
        state.meanCagrMin = Number(meanCagr.value || 0);
        setText("sweep-ref-mean-cagr-value", String(state.meanCagrMin));
        renderAll();
      });
    }
    if (recentMdd instanceof HTMLInputElement) {
      recentMdd.addEventListener("input", () => {
        state.recentMddFloor = Number(recentMdd.value || -100);
        setText("sweep-ref-recent-mdd-value", String(state.recentMddFloor));
        renderAll();
      });
    }
    if (boxAxis instanceof HTMLSelectElement) {
      boxAxis.addEventListener("change", () => {
        state.boxAxis = boxAxis.value;
        renderAll();
      });
    }
    document.querySelectorAll("[data-sweep-ref-preset]").forEach((button) => {
      button.addEventListener("click", () => {
        state.preset = button.getAttribute("data-sweep-ref-preset") || "all";
        document.querySelectorAll("[data-sweep-ref-preset]").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        renderAll();
      });
    });
    document.querySelectorAll(".sweep-ref-table th[data-sort-key]").forEach((header) => {
      header.addEventListener("click", () => {
        const sortKey = header.getAttribute("data-sort-key");
        if (!sortKey) {
          return;
        }
        if (state.sortBy === sortKey) {
          state.sortDesc = !state.sortDesc;
        } else {
          state.sortBy = sortKey;
          state.sortDesc = true;
        }
        renderTable();
      });
    });
    document.querySelectorAll(".sweep-ref-help-trigger").forEach((button) => {
      button.addEventListener("mouseenter", (event) => {
        showHelpTooltip(button.getAttribute("data-help-key") || "", event.currentTarget);
      });
      button.addEventListener("mouseleave", hideHelpTooltip);
      button.addEventListener("focus", (event) => {
        showHelpTooltip(button.getAttribute("data-help-key") || "", event.currentTarget);
      });
      button.addEventListener("blur", hideHelpTooltip);
    });
    window.addEventListener("resize", () => {
      positionPcFilters();
      renderAll();
    });
    const pcCanvas = document.getElementById("sweep-ref-pc-canvas");
    if (pcCanvas instanceof HTMLCanvasElement) {
      pcCanvas.addEventListener("mousemove", handlePcHover);
      pcCanvas.addEventListener("mouseleave", () => {
        const tooltip = document.getElementById("sweep-ref-pc-tooltip");
        if (tooltip) {
          tooltip.style.opacity = "0";
        }
      });
    }
  }

  function helpText(key) {
    const baseline = state.payload?.meta?.baseline_thresholds || { mean_cagr_pct: 0, std_cagr_limit_pct: 0 };
    if (key === "plateau") {
      return `<strong>Plateau 분석</strong><br><br>인근 ±1 step combo들의 일관성으로 robust 중심부를 찾습니다.<br><br><strong>PLATEAU</strong>: 인근 80% 이상이 tier 통과이고 인근 평균 mean_CAGR가 타겟의 70% 이상입니다.<br><br><strong>ISLAND</strong>: 인근 평균 mean_CAGR가 타겟의 50% 미만으로 떨어집니다.<br><br><strong>EDGE</strong>: 인근 combo가 4개 미만인 경계값입니다.`;
    }
    if (key === "tier") {
      return `<strong>Tier 1-4 시스템</strong><br><br><strong>Tier 1</strong>: trade return이 -100% 이하로 붕괴한 구간이 없습니다.<br><br><strong>Tier 2</strong>: 최근 8개 연간 평가 window의 CAGR이 모두 양수입니다.<br><br><strong>Tier 3</strong>: mean_CAGR가 baseline ${baseline.mean_cagr_pct.toFixed(2)}%를 초과합니다.<br><br><strong>Tier 4</strong>: std_CAGR가 limit ${baseline.std_cagr_limit_pct.toFixed(2)}% 미만입니다.`;
    }
    return `<strong>compound_ratio</strong><br><br>최근 평가 window들을 독립적으로 $10k에서 다시 시작한다고 가정했을 때의 누적 배율입니다.<br><br>${ui.escapeHtml(state.payload?.meta?.compound_ratio_definition || "")}`;
  }

  function showHelpTooltip(key, target) {
    const tooltip = document.getElementById("sweep-ref-help-tooltip");
    if (!(tooltip instanceof HTMLElement) || !(target instanceof Element)) {
      return;
    }
    tooltip.innerHTML = helpText(key);
    const rect = target.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX + 16}px`;
    tooltip.style.top = `${rect.bottom + window.scrollY + 10}px`;
    tooltip.style.opacity = "1";
  }

  function hideHelpTooltip() {
    const tooltip = document.getElementById("sweep-ref-help-tooltip");
    if (tooltip instanceof HTMLElement) {
      tooltip.style.opacity = "0";
    }
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function setHtml(id, html) {
    const element = document.getElementById(id);
    if (element) {
      element.innerHTML = html;
    }
  }

  function orderedParameterKeys(source = state.parameterValues) {
    return Object.keys(source || {}).sort((left, right) => {
      const leftIndex = PARAM_ORDER.indexOf(left);
      const rightIndex = PARAM_ORDER.indexOf(right);
      const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
      const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
      if (normalizedLeft !== normalizedRight) {
        return normalizedLeft - normalizedRight;
      }
      return left.localeCompare(right);
    });
  }

  function orderedParameterEntries(source = state.parameterValues) {
    return orderedParameterKeys(source).map((key) => [key, source[key]]);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function syncNumericFilterBounds() {
    const meanCagrInput = document.getElementById("sweep-ref-mean-cagr");
    if (meanCagrInput instanceof HTMLInputElement) {
      state.meanCagrMin = clamp(state.meanCagrMin, 0, 50);
      meanCagrInput.min = "0";
      meanCagrInput.max = "50";
      meanCagrInput.step = "1";
      meanCagrInput.value = String(state.meanCagrMin);
      setText("sweep-ref-mean-cagr-value", String(state.meanCagrMin));
    }

    const recentMddInput = document.getElementById("sweep-ref-recent-mdd");
    if (!(recentMddInput instanceof HTMLInputElement)) {
      return;
    }
    const recentValues = state.rows
      .map((row) => Number(row.recentMdd))
      .filter((value) => Number.isFinite(value));
    let minRecentMdd = -100;
    let maxRecentMdd = 0;
    if (recentValues.length) {
      minRecentMdd = Math.floor(Math.min(...recentValues));
      maxRecentMdd = Math.ceil(Math.max(...recentValues));
      if (minRecentMdd === maxRecentMdd) {
        minRecentMdd -= 1;
        maxRecentMdd += 1;
      }
    }
    state.recentMddFloor = clamp(state.recentMddFloor, minRecentMdd, maxRecentMdd);
    recentMddInput.min = String(minRecentMdd);
    recentMddInput.max = String(maxRecentMdd);
    recentMddInput.step = "1";
    recentMddInput.value = String(state.recentMddFloor);
    setText("sweep-ref-recent-mdd-value", String(state.recentMddFloor));
  }

  function makeDisplayRow(row) {
    const compoundRatio = Number(row.metrics?.compound_ratio || 0);
    const compoundRatioLog10 = Number(
      Number.isFinite(row.metrics?.compound_ratio_log10) ? row.metrics.compound_ratio_log10 : Math.log10(Math.max(compoundRatio, 0.0001)),
    );
    return {
      raw: row,
      comboKey: String(row.combo_key),
      thread_count: Number(row.params?.thread_count ?? 0),
      stop_sessions: Number(row.params?.stop_sessions ?? 0),
      buy_pct: Number(row.params?.buy_pct ?? 0),
      sell_pct: Number(row.params?.sell_pct ?? 0),
      meanCagr: Number(row.metrics?.mean_cagr_pct ?? row.metrics?.cagr_pct ?? 0),
      stdCagr: Number(row.metrics?.std_cagr_pct ?? row.metrics?.segment_stddev_pct ?? 0),
      fullMdd: Number(row.metrics?.max_drawdown_pct ?? 0),
      recentMdd: Number(row.metrics?.recent_mdd_pct ?? row.metrics?.max_drawdown_pct ?? 0),
      recentCagr: Number(row.metrics?.recent_cagr_pct ?? row.metrics?.cagr_pct ?? 0),
      worstWindowCagr: Number(row.metrics?.worst_window_cagr_pct ?? row.metrics?.worst_segment_return_pct ?? 0),
      compoundRatio,
      compoundRatioLog10,
      plateauClass: row.plateau_class || "M",
      plateauSort: PLATEAU_SORT[row.plateau_class || "M"] || 0,
      tierPass: Boolean(row.tier_pass),
      tierPassSort: row.tier_pass ? 1 : 0,
      pareto: Boolean(row.flags?.pareto_return_mdd),
    };
  }

  function render(artifactRecord) {
    if (!state.mounted) {
      mount();
    }
    if (!state.mounted) {
      return;
    }
    const payload = artifactRecord?.payload || null;
    state.payload = payload;
    state.rows = payload?.rows ? payload.rows.map(makeDisplayRow) : [];
    if (!payload) {
      setEmptyState(DEFAULT_EMPTY_MESSAGE);
      return;
    }
    const parameterValues = normalizeParameterValues(payload.meta?.parameter_values || {});
    const parameterHash = JSON.stringify(parameterValues);
    if (state.parameterHash !== parameterHash) {
      state.parameterHash = parameterHash;
      state.parameterValues = parameterValues;
      rebuildParameterControls();
    }
    syncNumericFilterBounds();
    updateTopMessage();
    updatePresetLabels();
    renderAll();
  }

  function normalizeParameterValues(values) {
    const normalized = {};
    orderedParameterEntries(values || {}).forEach(([key, items]) => {
      normalized[key] = [...items].map((value) => Number(value)).sort((left, right) => left - right);
    });
    return normalized;
  }

  function rebuildParameterControls() {
    const keys = orderedParameterKeys();
    if (!keys.length) {
      return;
    }
    if (!keys.includes(state.boxAxis)) {
      state.boxAxis = keys[0];
    }
    const axisSelect = document.getElementById("sweep-ref-box-axis");
    if (axisSelect instanceof HTMLSelectElement) {
      axisSelect.innerHTML = keys
        .map((key) => `<option value="${ui.escapeHtml(key)}"${key === state.boxAxis ? " selected" : ""}>${ui.escapeHtml(PARAM_LABELS[key] || key)}</option>`)
        .join("");
    }
    buildMultiSelectFilters("sweep-ref-pc-filters", state.pcSelections, true);
    buildMultiSelectFilters("sweep-ref-table-filters", state.tableSelections, false);
    positionPcFilters();
  }

  function buildMultiSelectFilters(containerId, targetMap, pcMode) {
    const container = document.getElementById(containerId);
    if (!(container instanceof HTMLElement)) {
      return;
    }
    container.innerHTML = "";
    orderedParameterEntries().forEach(([key, values]) => {
      const selected = new Set(values);
      targetMap.set(key, selected);
      container.appendChild(createMultiSelect(key, values, selected, () => {
        if (pcMode) {
          renderAll();
        } else {
          renderTable();
        }
      }));
    });
  }

  function createMultiSelect(key, values, selected, onChange) {
    const wrapper = document.createElement("div");
    wrapper.className = "sweep-ref-multiselect-group";
    wrapper.setAttribute("data-param-key", key);
    wrapper.innerHTML = `
      <label>${ui.escapeHtml(PARAM_LABELS[key] || key)}</label>
      <div class="sweep-ref-multiselect">
        <button class="sweep-ref-multiselect-btn" type="button"><span class="sweep-ref-multiselect-text">모두 (${values.length})</span><span>▼</span></button>
        <div class="sweep-ref-multiselect-menu">
          <label class="sweep-ref-multiselect-item sweep-ref-multiselect-all">
            <input type="checkbox" checked>
            <span>모두 선택/해제</span>
          </label>
          ${values.map((value) => `
            <label class="sweep-ref-multiselect-item">
              <input type="checkbox" value="${ui.escapeHtml(String(value))}" checked>
              <span>${ui.escapeHtml(String(value))}</span>
            </label>
          `).join("")}
        </div>
      </div>
    `;
    const button = wrapper.querySelector(".sweep-ref-multiselect-btn");
    const menu = wrapper.querySelector(".sweep-ref-multiselect-menu");
    const text = wrapper.querySelector(".sweep-ref-multiselect-text");
    const allToggle = wrapper.querySelector(".sweep-ref-multiselect-all input");
    const inputs = Array.from(wrapper.querySelectorAll(".sweep-ref-multiselect-item input")).filter((input) => input !== allToggle);
    function updateText() {
      if (selected.size === values.length) {
        text.textContent = `모두 (${values.length})`;
      } else if (selected.size === 0) {
        text.textContent = "없음";
      } else if (selected.size <= 2) {
        text.textContent = Array.from(selected).join(", ");
      } else {
        text.textContent = `${selected.size}개 선택`;
      }
      allToggle.checked = selected.size === values.length;
    }
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      document.querySelectorAll(".sweep-ref-multiselect-menu.open").forEach((node) => {
        if (node !== menu) {
          node.classList.remove("open");
        }
      });
      menu.classList.toggle("open");
    });
    inputs.forEach((input) => {
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (input.checked) {
          selected.add(value);
        } else {
          selected.delete(value);
        }
        updateText();
        onChange();
      });
    });
    allToggle.addEventListener("change", () => {
      if (allToggle.checked) {
        selected.clear();
        values.forEach((value) => selected.add(value));
        inputs.forEach((input) => {
          input.checked = true;
        });
      } else {
        selected.clear();
        inputs.forEach((input) => {
          input.checked = false;
        });
      }
      updateText();
      onChange();
    });
    document.addEventListener("click", () => {
      menu.classList.remove("open");
    });
    menu.addEventListener("click", (event) => event.stopPropagation());
    updateText();
    return wrapper;
  }

  function updateTopMessage() {
    if (!state.payload) {
      setText("sweep-ref-top-message", DEFAULT_EMPTY_MESSAGE);
      return;
    }
    const rows = state.rows;
    const fullGatePass = rows.filter((row) => row.fullMdd >= -80).length;
    const recent50 = rows.filter((row) => row.recentMdd >= -50).length;
    const recent30 = rows.filter((row) => row.recentMdd >= -30).length;
    const windowCount = state.payload.meta?.evaluation_windows?.length || 0;
    setHtml(
      "sweep-ref-top-message",
      `<strong>알림</strong>: full-period MDD ≥ -80% 통과 combo는 <strong>${ui.escapeHtml(String(fullGatePass))}</strong>개입니다. `
      + `recent 기준 -50% 이상 <strong>${ui.escapeHtml(String(recent50))}</strong>개 / -30% 이상 <strong>${ui.escapeHtml(String(recent30))}</strong>개. `
      + `최근 성과는 최신 ${ui.escapeHtml(String(Math.min(windowCount, state.payload.meta?.recent_window_span || 2)))}개 평가 window를 합산해 계산합니다.`,
    );
  }

  function updatePresetLabels() {
    const allRows = state.rows;
    const counts = {
      all: allRows.length,
      plateau_robust: allRows.filter((row) => row.plateauClass === "P" && row.tierPass).length,
      recent_safe: allRows.filter((row) => row.recentMdd >= -45).length,
      recent_extreme_safe: allRows.filter((row) => row.recentMdd >= -35).length,
    };
    document.querySelectorAll("[data-sweep-ref-preset]").forEach((button) => {
      const preset = button.getAttribute("data-sweep-ref-preset") || "all";
      const baseLabel = button.getAttribute("data-base-label") || PRESET_LABELS[preset] || preset;
      button.textContent = preset === "all" ? baseLabel : `${baseLabel} (${counts[preset] || 0})`;
    });
  }

  function currentPcRows() {
    return state.rows.filter((row) => {
      if (state.plateau !== "all" && row.plateauClass !== state.plateau) {
        return false;
      }
      if (state.tier !== "all" && String(row.tierPass ? 1 : 0) !== state.tier) {
        return false;
      }
      if (row.meanCagr < state.meanCagrMin) {
        return false;
      }
      if (row.recentMdd < state.recentMddFloor) {
        return false;
      }
      if (state.preset === "plateau_robust" && !(row.plateauClass === "P" && row.tierPass)) {
        return false;
      }
      if (state.preset === "recent_safe" && row.recentMdd < -45) {
        return false;
      }
      if (state.preset === "recent_extreme_safe" && row.recentMdd < -35) {
        return false;
      }
      return matchesParamSelection(row, state.pcSelections);
    });
  }

  function currentTableRows() {
    return currentPcRows().filter((row) => matchesParamSelection(row, state.tableSelections));
  }

  function matchesParamSelection(row, selectionMap) {
    for (const [key, selected] of selectionMap.entries()) {
      if (!selected.has(row[key])) {
        return false;
      }
    }
    return true;
  }

  function renderAll() {
    const filtered = currentPcRows();
    updateStats(filtered);
    drawParallelCoordinates(filtered);
    drawParetoScatter(filtered);
    drawBox(filtered);
    drawRecentScatter(filtered);
    drawPlateauRatio(filtered);
    drawTierStack(filtered);
    drawScoreVsRecent(filtered);
    renderTable();
  }

  function updateStats(rows) {
    if (!rows.length) {
      setText("sweep-ref-stat-count", "0");
      setText("sweep-ref-stat-mean-cagr", "—");
      setText("sweep-ref-stat-full-mdd", "—");
      setText("sweep-ref-stat-recent-mdd", "—");
      setText("sweep-ref-stat-plateau", "—");
      return;
    }
    setText("sweep-ref-stat-count", rows.length.toLocaleString());
    setText("sweep-ref-stat-mean-cagr", `${average(rows, "meanCagr").toFixed(1)}%`);
    setText("sweep-ref-stat-full-mdd", `${average(rows, "fullMdd").toFixed(1)}%`);
    setText("sweep-ref-stat-recent-mdd", `${average(rows, "recentMdd").toFixed(1)}%`);
    setText("sweep-ref-stat-plateau", `${Math.round((rows.filter((row) => row.plateauClass === "P").length / rows.length) * 100)}%`);
  }

  function average(rows, key) {
    return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
  }

  function setEmptyState(message) {
    updateStats([]);
    setText("sweep-ref-top-message", message);
    drawEmptyCanvas("sweep-ref-pc-canvas", message);
    drawEmptyCanvas("sweep-ref-scatter-canvas", message);
    drawEmptyCanvas("sweep-ref-box-canvas", message);
    drawEmptyCanvas("sweep-ref-recent-scatter-canvas", message);
    drawEmptyCanvas("sweep-ref-plateau-canvas", message);
    drawEmptyCanvas("sweep-ref-tier-canvas", message);
    drawEmptyCanvas("sweep-ref-score-canvas", message);
    setHtml("sweep-ref-table-body", `<tr><td colspan="12" class="muted" style="text-align: center">${ui.escapeHtml(message)}</td></tr>`);
    setText("sweep-ref-table-count", "표시: 0 / 필터 통과: 0 / 전체: 0");
  }

  function drawEmptyCanvas(id, message) {
    const canvas = document.getElementById(id);
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#6b7280";
    ctx.font = "13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
  }

  function numericExtent(values, options = {}) {
    const finite = values.filter((value) => Number.isFinite(value));
    if (!finite.length) {
      return { min: options.fallbackMin ?? 0, max: options.fallbackMax ?? 1 };
    }
    let min = Math.min(...finite, ...(options.include || []));
    let max = Math.max(...finite, ...(options.include || []));
    if (min === max) {
      const pad = Math.abs(min) || 1;
      min -= pad * 0.25;
      max += pad * 0.25;
    }
    const span = max - min;
    return {
      min: min - span * (options.padRatio ?? 0.08),
      max: max + span * (options.padRatio ?? 0.08),
    };
  }

  function niceNum(range, round) {
    const exponent = Math.floor(Math.log10(range || 1));
    const fraction = range / (10 ** exponent);
    let niceFraction;
    if (round) {
      if (fraction < 1.5) {
        niceFraction = 1;
      } else if (fraction < 3) {
        niceFraction = 2;
      } else if (fraction < 7) {
        niceFraction = 5;
      } else {
        niceFraction = 10;
      }
    } else if (fraction <= 1) {
      niceFraction = 1;
    } else if (fraction <= 2) {
      niceFraction = 2;
    } else if (fraction <= 5) {
      niceFraction = 5;
    } else {
      niceFraction = 10;
    }
    return niceFraction * (10 ** exponent);
  }

  function buildNiceTicks(min, max, maxTicks = 6) {
    const span = niceNum(max - min || 1, false);
    const step = niceNum(span / Math.max(maxTicks - 1, 1), true);
    const niceMin = Math.floor(min / step) * step;
    const niceMax = Math.ceil(max / step) * step;
    const ticks = [];
    for (let value = niceMin; value <= niceMax + (step / 2); value += step) {
      ticks.push(Number(value.toFixed(6)));
    }
    return { min: niceMin, max: niceMax, step, ticks };
  }

  function axis(value, min, max, start, size, invert = false) {
    if (max === min) {
      return start + size / 2;
    }
    const ratio = (value - min) / (max - min);
    return invert ? (start + size - (ratio * size)) : (start + (ratio * size));
  }

  function pointStyle(row) {
    if (!row.tierPass) {
      return { color: "rgba(163, 163, 163, 0.34)", stroke: "rgba(120, 120, 120, 0.18)", radius: 2.6 };
    }
    if (row.plateauClass === "P") {
      return { color: "rgba(25, 118, 210, 0.66)", stroke: "rgba(12, 74, 161, 0.34)", radius: 3.8 };
    }
    return { color: "rgba(245, 158, 11, 0.48)", stroke: "rgba(180, 83, 9, 0.24)", radius: 3.1 };
  }

  function positionPcFilters() {
    const canvas = document.getElementById("sweep-ref-pc-canvas");
    const container = document.getElementById("sweep-ref-pc-filters");
    if (!(canvas instanceof HTMLCanvasElement) || !(container instanceof HTMLElement)) {
      return;
    }
    const groups = Array.from(container.children);
    if (!groups.length) {
      return;
    }
    const paramCount = orderedParameterKeys().length;
    const scale = canvas.offsetWidth / canvas.width || 1;
    const padLeft = 36;
    const plotWidth = canvas.width - 72;
    const xStep = paramCount > 1 ? plotWidth / (paramCount + 3) : plotWidth;
    container.style.minHeight = "88px";
    groups.forEach((group, index) => {
      if (!(group instanceof HTMLElement)) {
        return;
      }
      const x = (padLeft + (index * xStep)) * scale;
      group.style.left = `${x}px`;
    });
  }

  function pcDimensions() {
    const paramKeys = orderedParameterKeys();
    const dims = paramKeys.map((key) => ({
      key,
      label: PARAM_SHORT_LABELS[key] || key,
      values: state.parameterValues[key],
      categorical: true,
    }));
    dims.push(
      { key: "meanCagr", label: "mean CAGR", categorical: false },
      { key: "fullMdd", label: "full MDD", categorical: false },
      { key: "recentMdd", label: "recent MDD", categorical: false },
      { key: "compoundRatioLog10", label: "compound log10", categorical: false },
    );
    return dims;
  }

  function drawParallelCoordinates(rows) {
    const canvas = document.getElementById("sweep-ref-pc-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (!rows.length) {
      drawEmptyCanvas("sweep-ref-pc-canvas", "표시할 스윕 결과가 없습니다.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const dims = pcDimensions();
    const pad = { top: 20, right: 36, bottom: 52, left: 36 };
    const plotWidth = canvas.width - pad.left - pad.right;
    const plotHeight = canvas.height - pad.top - pad.bottom;
    const xStep = plotWidth / Math.max(dims.length - 1, 1);
    const numericRanges = {};
    dims.filter((dim) => !dim.categorical).forEach((dim) => {
      const tickRange = buildNiceTicks(
        ...Object.values(numericExtent(rows.map((row) => row[dim.key]), { include: dim.key === "recentMdd" ? [-50, -30] : [] })),
      );
      numericRanges[dim.key] = tickRange;
    });
    dims.forEach((dim, index) => {
      const x = pad.left + (index * xStep);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + plotHeight);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#0f172a";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(dim.label, x, canvas.height - 18);
      ctx.fillStyle = "#64748b";
      ctx.font = "10px Inter, sans-serif";
      if (dim.categorical) {
        dim.values.forEach((value, valueIndex) => {
          const y = axis(valueIndex, 0, Math.max(dim.values.length - 1, 1), pad.top, plotHeight, true);
          ctx.fillText(String(value), x, y + 3);
        });
      } else {
        const range = numericRanges[dim.key];
        range.ticks.forEach((tick) => {
          const y = axis(tick, range.min, range.max, pad.top, plotHeight, true);
          ctx.fillText(String(Number(tick.toFixed(1))), x, y + 3);
        });
      }
    });
    const sorted = rows.slice().sort((left, right) => Number(left.tierPass) - Number(right.tierPass));
    const compoundRange = numericExtent(rows.map((row) => row.compoundRatioLog10), { include: [0] });
    function yFor(dim, row) {
      if (dim.categorical) {
        const idx = dim.values.indexOf(row[dim.key]);
        return axis(idx, 0, Math.max(dim.values.length - 1, 1), pad.top, plotHeight, true);
      }
      const range = numericRanges[dim.key];
      return axis(row[dim.key], range.min, range.max, pad.top, plotHeight, true);
    }
    sorted.forEach((row) => {
      const style = pointStyle(row);
      const alphaBase = axis(row.compoundRatioLog10, compoundRange.min, compoundRange.max, 0.12, 0.72, false);
      const alpha = Math.max(0.08, Math.min(0.82, alphaBase));
      const color = style.color.replace(/[\d.]+\)$/, `${alpha})`);
      ctx.strokeStyle = color;
      ctx.lineWidth = row.plateauClass === "P" ? 1.3 : 1;
      ctx.beginPath();
      dims.forEach((dim, index) => {
        const x = pad.left + (index * xStep);
        const y = yFor(dim, row);
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    });
    canvas.__pcData = { rows: sorted, dims, pad, xStep, plotHeight, numericRanges };
    positionPcFilters();
  }

  function handlePcHover(event) {
    const canvas = event.currentTarget;
    if (!(canvas instanceof HTMLCanvasElement) || !canvas.__pcData) {
      return;
    }
    const tooltip = document.getElementById("sweep-ref-pc-tooltip");
    if (!(tooltip instanceof HTMLElement)) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (event.clientX - rect.left) * scaleX;
    const my = (event.clientY - rect.top) * scaleY;
    const { rows, dims, pad, xStep, plotHeight, numericRanges } = canvas.__pcData;
    const axisIndex = Math.round((mx - pad.left) / xStep);
    if (axisIndex < 0 || axisIndex >= dims.length) {
      tooltip.style.opacity = "0";
      return;
    }
    const dim = dims[axisIndex];
    let nearest = null;
    let minDistance = 22;
    rows.forEach((row) => {
      let y;
      if (dim.categorical) {
        const idx = dim.values.indexOf(row[dim.key]);
        y = axis(idx, 0, Math.max(dim.values.length - 1, 1), pad.top, plotHeight, true);
      } else {
        const range = numericRanges[dim.key];
        y = axis(row[dim.key], range.min, range.max, pad.top, plotHeight, true);
      }
      const distance = Math.abs(my - y);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = row;
      }
    });
    if (!nearest) {
      tooltip.style.opacity = "0";
      return;
    }
    tooltip.innerHTML = `<strong>${ui.escapeHtml(nearest.comboKey)}</strong>`
      + `<br>${ui.escapeHtml(`T${nearest.thread_count} / ${nearest.stop_sessions}S / BUY ${formatSigned(nearest.buy_pct)} / SELL ${formatSigned(nearest.sell_pct)}`)}`
      + `<br>mean_CAGR ${nearest.meanCagr.toFixed(1)}% | full_MDD ${nearest.fullMdd.toFixed(1)}%`
      + `<br>recent_CAGR ${nearest.recentCagr.toFixed(1)}% | recent_MDD ${nearest.recentMdd.toFixed(1)}%`
      + `<br>compound_ratio ${formatMultiplier(nearest.compoundRatio)} | ${PLATEAU_LABELS[nearest.plateauClass]} / ${nearest.tierPass ? "ROBUST" : "FAIL"}`;
    tooltip.style.left = `${event.pageX + 12}px`;
    tooltip.style.top = `${event.pageY + 8}px`;
    tooltip.style.opacity = "1";
  }

  function drawGrid(ctx, pad, width, height, xTicks, yTicks, scales) {
    ctx.strokeStyle = "rgba(226, 232, 240, 0.9)";
    ctx.lineWidth = 1;
    xTicks.forEach((tick) => {
      const x = axis(tick, scales.x.min, scales.x.max, pad.left, width, false);
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, pad.top + height);
      ctx.stroke();
    });
    yTicks.forEach((tick) => {
      const y = axis(tick, scales.y.min, scales.y.max, pad.top, height, true);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + width, y);
      ctx.stroke();
    });
  }

  function drawAxes(ctx, canvas, pad, width, height, xTicks, yTicks, scales, labels) {
    drawGrid(ctx, pad, width, height, xTicks, yTicks, scales);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + height);
    ctx.lineTo(pad.left + width, pad.top + height);
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    xTicks.forEach((tick) => {
      const x = axis(tick, scales.x.min, scales.x.max, pad.left, width, false);
      ctx.fillText(labels.xTick ? labels.xTick(tick) : formatAxisTick(tick), x, pad.top + height + 15);
    });
    ctx.textAlign = "right";
    yTicks.forEach((tick) => {
      const y = axis(tick, scales.y.min, scales.y.max, pad.top, height, true);
      ctx.fillText(labels.yTick ? labels.yTick(tick) : formatAxisTick(tick), pad.left - 6, y + 3);
    });
    ctx.textAlign = "center";
    ctx.font = "12px Inter, sans-serif";
    ctx.fillText(labels.x, pad.left + (width / 2), canvas.height - 4);
    ctx.save();
    ctx.translate(14, pad.top + (height / 2));
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(labels.y, 0, 0);
    ctx.restore();
  }

  function formatAxisTick(value) {
    if (Math.abs(value) >= 100 || Number.isInteger(value)) {
      return String(Math.round(value));
    }
    return value.toFixed(1);
  }

  function drawParetoScatter(rows) {
    const canvas = document.getElementById("sweep-ref-scatter-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (!rows.length) {
      drawEmptyCanvas("sweep-ref-scatter-canvas", "표시할 스윕 결과가 없습니다.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = { top: 18, right: 18, bottom: 42, left: 52 };
    const width = canvas.width - pad.left - pad.right;
    const height = canvas.height - pad.top - pad.bottom;
    const xRange = buildNiceTicks(...Object.values(numericExtent(rows.map((row) => row.meanCagr), { include: [0] })));
    const yRange = buildNiceTicks(...Object.values(numericExtent(rows.map((row) => row.fullMdd), { include: [-80, 0] })));
    drawAxes(ctx, canvas, pad, width, height, xRange.ticks, yRange.ticks, { x: xRange, y: yRange }, {
      x: "mean CAGR %",
      y: "full MDD %",
    });
    if (-80 >= yRange.min && -80 <= yRange.max) {
      const gateY = axis(-80, yRange.min, yRange.max, pad.top, height, true);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "#b91c1c";
      ctx.beginPath();
      ctx.moveTo(pad.left, gateY);
      ctx.lineTo(pad.left + width, gateY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#b91c1c";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("MDD -80% 게이트", pad.left + width - 4, gateY - 4);
    }
    const paretoRows = rows.filter((row) => row.pareto).sort((left, right) => left.fullMdd - right.fullMdd);
    if (paretoRows.length > 1) {
      ctx.strokeStyle = "rgba(15, 23, 42, 0.34)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      paretoRows.forEach((row, index) => {
        const x = axis(row.meanCagr, xRange.min, xRange.max, pad.left, width, false);
        const y = axis(row.fullMdd, yRange.min, yRange.max, pad.top, height, true);
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
    }
    rows.forEach((row) => {
      const style = pointStyle(row);
      const x = axis(row.meanCagr, xRange.min, xRange.max, pad.left, width, false);
      const y = axis(row.fullMdd, yRange.min, yRange.max, pad.top, height, true);
      ctx.fillStyle = style.color;
      ctx.strokeStyle = row.pareto ? "rgba(15, 23, 42, 0.55)" : style.stroke;
      ctx.lineWidth = row.pareto ? 1.3 : 1;
      ctx.beginPath();
      ctx.arc(x, y, style.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawBox(rows) {
    const canvas = document.getElementById("sweep-ref-box-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (!rows.length) {
      drawEmptyCanvas("sweep-ref-box-canvas", "표시할 스윕 결과가 없습니다.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const values = state.parameterValues[state.boxAxis] || [];
    const pad = { top: 18, right: 18, bottom: 62, left: 52 };
    const width = canvas.width - pad.left - pad.right;
    const height = canvas.height - pad.top - pad.bottom;
    const yRange = buildNiceTicks(...Object.values(numericExtent(rows.map((row) => row.meanCagr), { include: [0] })));
    drawAxes(ctx, canvas, pad, width, height, [], yRange.ticks, { x: { min: 0, max: 1 }, y: yRange }, {
      x: PARAM_LABELS[state.boxAxis] || state.boxAxis,
      y: "mean CAGR %",
    });
    const bandWidth = width / Math.max(values.length, 1);
    values.forEach((value, index) => {
      const group = rows.filter((row) => row[state.boxAxis] === value).map((row) => row.meanCagr).sort((left, right) => left - right);
      const centerX = pad.left + (bandWidth * (index + 0.5));
      ctx.fillStyle = "#0f172a";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(value), centerX, pad.top + height + 18);
      if (!group.length) {
        return;
      }
      const q1 = percentile(group, 0.25);
      const median = percentile(group, 0.5);
      const q3 = percentile(group, 0.75);
      const low = group[0];
      const high = group[group.length - 1];
      const boxWidth = Math.min(62, bandWidth * 0.62);
      const yLow = axis(low, yRange.min, yRange.max, pad.top, height, true);
      const yHigh = axis(high, yRange.min, yRange.max, pad.top, height, true);
      const yQ1 = axis(q1, yRange.min, yRange.max, pad.top, height, true);
      const yQ3 = axis(q3, yRange.min, yRange.max, pad.top, height, true);
      const yMedian = axis(median, yRange.min, yRange.max, pad.top, height, true);
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, yLow);
      ctx.lineTo(centerX, yHigh);
      ctx.stroke();
      ctx.fillStyle = "rgba(25, 118, 210, 0.18)";
      ctx.fillRect(centerX - (boxWidth / 2), yQ3, boxWidth, yQ1 - yQ3);
      ctx.strokeStyle = "#1976d2";
      ctx.strokeRect(centerX - (boxWidth / 2), yQ3, boxWidth, yQ1 - yQ3);
      ctx.strokeStyle = "#0f4c81";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(centerX - (boxWidth / 2), yMedian);
      ctx.lineTo(centerX + (boxWidth / 2), yMedian);
      ctx.stroke();
      ctx.fillStyle = "#64748b";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(`n=${group.length}`, centerX, pad.top + height + 34);
    });
  }

  function percentile(values, ratio) {
    if (!values.length) {
      return 0;
    }
    const index = Math.min(values.length - 1, Math.floor((values.length - 1) * ratio));
    return values[index];
  }

  function drawRecentScatter(rows) {
    const canvas = document.getElementById("sweep-ref-recent-scatter-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (!rows.length) {
      drawEmptyCanvas("sweep-ref-recent-scatter-canvas", "표시할 스윕 결과가 없습니다.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = { top: 18, right: 18, bottom: 42, left: 52 };
    const width = canvas.width - pad.left - pad.right;
    const height = canvas.height - pad.top - pad.bottom;
    const xRange = buildNiceTicks(...Object.values(numericExtent(rows.map((row) => row.recentCagr), { include: [0] })));
    const yRange = buildNiceTicks(...Object.values(numericExtent(rows.map((row) => row.recentMdd), { include: [-50, -30, 0] })));
    drawAxes(ctx, canvas, pad, width, height, xRange.ticks, yRange.ticks, { x: xRange, y: yRange }, {
      x: "Recent CAGR %",
      y: "Recent MDD %",
    });
    [-50, -30].forEach((guide, index) => {
      if (guide < yRange.min || guide > yRange.max) {
        return;
      }
      const y = axis(guide, yRange.min, yRange.max, pad.top, height, true);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = index === 0 ? "#b91c1c" : "#d97706";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + width, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = index === 0 ? "#b91c1c" : "#d97706";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(index === 0 ? "-50% 가이드" : "-30% 가이드", pad.left + width - 4, y - 4);
    });
    rows.forEach((row) => {
      const style = pointStyle(row);
      const x = axis(row.recentCagr, xRange.min, xRange.max, pad.left, width, false);
      const y = axis(row.recentMdd, yRange.min, yRange.max, pad.top, height, true);
      ctx.fillStyle = style.color;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, style.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function drawPlateauRatio(rows) {
    const canvas = document.getElementById("sweep-ref-plateau-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (!rows.length) {
      drawEmptyCanvas("sweep-ref-plateau-canvas", "표시할 스윕 결과가 없습니다.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = { top: 18, right: 18, bottom: 92, left: 52 };
    const width = canvas.width - pad.left - pad.right;
    const height = canvas.height - pad.top - pad.bottom;
    const bars = buildGroupedBars(rows, (subset) => (subset.filter((row) => row.plateauClass === "P").length / subset.length));
    const yRange = { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    drawAxes(ctx, canvas, pad, width, height, [], yRange.ticks, { x: { min: 0, max: 1 }, y: yRange }, {
      x: "파라미터 값",
      y: "PLATEAU 비율",
      yTick: (tick) => `${Math.round(tick * 100)}%`,
    });
    drawGroupedBarsChart(ctx, bars, pad, width, height, yRange, (value) => `${Math.round(value * 100)}%`);
  }

  function drawTierStack(rows) {
    const canvas = document.getElementById("sweep-ref-tier-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (!rows.length) {
      drawEmptyCanvas("sweep-ref-tier-canvas", "표시할 스윕 결과가 없습니다.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = { top: 18, right: 92, bottom: 92, left: 52 };
    const width = canvas.width - pad.left - pad.right;
    const height = canvas.height - pad.top - pad.bottom;
    const bars = buildGroupedBars(rows, (subset) => (subset.filter((row) => row.tierPass).length / subset.length));
    const yRange = { min: 0, max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
    drawAxes(ctx, canvas, pad, width, height, [], yRange.ticks, { x: { min: 0, max: 1 }, y: yRange }, {
      x: "파라미터 값",
      y: "ROBUST 비율",
      yTick: (tick) => `${Math.round(tick * 100)}%`,
    });
    const barWidth = width / Math.max(bars.length, 1);
    bars.forEach((bar, index) => {
      const x = pad.left + (index * barWidth) + 4;
      const innerWidth = Math.max(6, barWidth - 8);
      const yRobust = axis(bar.value, 0, 1, pad.top, height, true);
      const yBase = axis(0, 0, 1, pad.top, height, true);
      ctx.fillStyle = "#bdbdbd";
      ctx.fillRect(x, pad.top, innerWidth, yBase - pad.top);
      ctx.fillStyle = "#2e7d32";
      ctx.fillRect(x, yRobust, innerWidth, yBase - yRobust);
      drawGroupedBarLabels(
        ctx,
        bar,
        x + (innerWidth / 2),
        pad.top + height + 12,
        bar.value > 0.12 ? `${Math.round(bar.value * 100)}%` : "",
        yRobust - 4,
      );
    });
    ctx.fillStyle = "#2e7d32";
    ctx.fillRect(pad.left + width + 10, pad.top + 12, 12, 10);
    ctx.fillStyle = "#0f172a";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("ROBUST", pad.left + width + 28, pad.top + 21);
    ctx.fillStyle = "#bdbdbd";
    ctx.fillRect(pad.left + width + 10, pad.top + 30, 12, 10);
    ctx.fillStyle = "#0f172a";
    ctx.fillText("FAIL", pad.left + width + 28, pad.top + 39);
  }

  function buildGroupedBars(rows, metricFn) {
    const bars = [];
    orderedParameterEntries().forEach(([key, values]) => {
      values.forEach((value) => {
        const subset = rows.filter((row) => row[key] === value);
        bars.push({
          key,
          label: PARAM_SHORT_LABELS[key] || key,
          valueLabel: String(value),
          value: subset.length ? metricFn(subset) : 0,
          count: subset.length,
        });
      });
    });
    return bars;
  }

  function drawGroupedBarsChart(ctx, bars, pad, width, height, yRange, valueLabelFn) {
    const palette = {
      thread_count: "#1976d2",
      stop_sessions: "#059669",
      buy_pct: "#7c3aed",
      sell_pct: "#ea580c",
    };
    const barWidth = width / Math.max(bars.length, 1);
    bars.forEach((bar, index) => {
      const x = pad.left + (index * barWidth) + 4;
      const innerWidth = Math.max(6, barWidth - 8);
      const y = axis(bar.value, yRange.min, yRange.max, pad.top, height, true);
      const yBase = axis(0, yRange.min, yRange.max, pad.top, height, true);
      ctx.fillStyle = palette[bar.key] || "#64748b";
      ctx.fillRect(x, y, innerWidth, yBase - y);
      drawGroupedBarLabels(
        ctx,
        bar,
        x + (innerWidth / 2),
        pad.top + height + 12,
        bar.value > 0.08 ? valueLabelFn(bar.value) : "",
        y - 4,
      );
    });
  }

  function drawGroupedBarLabels(ctx, bar, centerX, baseY, topLabel, topLabelY) {
    ctx.save();
    ctx.translate(centerX, baseY);
    ctx.rotate(-Math.PI / 3);
    ctx.fillStyle = "#0f172a";
    ctx.font = "9px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${bar.label}=${bar.valueLabel}`, 0, 0);
    ctx.restore();
    if (topLabel) {
      ctx.fillStyle = "#0f172a";
      ctx.font = "9px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(topLabel, centerX, topLabelY ?? (baseY - 22));
    }
  }

  function drawScoreVsRecent(rows) {
    const canvas = document.getElementById("sweep-ref-score-canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }
    if (!rows.length) {
      drawEmptyCanvas("sweep-ref-score-canvas", "표시할 스윕 결과가 없습니다.");
      return;
    }
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const pad = { top: 18, right: 18, bottom: 42, left: 52 };
    const width = canvas.width - pad.left - pad.right;
    const height = canvas.height - pad.top - pad.bottom;
    const xRange = buildNiceTicks(...Object.values(numericExtent(rows.map((row) => row.compoundRatioLog10), { include: [0] })));
    const yRange = buildNiceTicks(...Object.values(numericExtent(rows.map((row) => row.recentMdd), { include: [-50, 0] })));
    drawAxes(ctx, canvas, pad, width, height, xRange.ticks, yRange.ticks, { x: xRange, y: yRange }, {
      x: "compound_ratio (log10)",
      y: "Recent MDD %",
      xTick: (tick) => formatMultiplierFromLog10(tick),
    });
    const safeX = axis(Math.max(0, xRange.min), xRange.min, xRange.max, pad.left, width, false);
    const safeY = axis(-50, yRange.min, yRange.max, pad.top, height, true);
    ctx.fillStyle = "rgba(34, 197, 94, 0.08)";
    ctx.fillRect(safeX, pad.top, pad.left + width - safeX, safeY - pad.top);
    ctx.fillStyle = "#166534";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("통합 최적 영역", safeX + 6, pad.top + 14);
    rows.forEach((row) => {
      const style = pointStyle(row);
      const x = axis(row.compoundRatioLog10, xRange.min, xRange.max, pad.left, width, false);
      const y = axis(row.recentMdd, yRange.min, yRange.max, pad.top, height, true);
      ctx.fillStyle = style.color;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, style.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  function formatMultiplier(value) {
    if (!Number.isFinite(value) || value <= 0) {
      return "—";
    }
    if (value >= 100) {
      return `${Math.round(value).toLocaleString()}x`;
    }
    if (value >= 10) {
      return `${value.toFixed(1)}x`;
    }
    return `${value.toFixed(2)}x`;
  }

  function formatMultiplierFromLog10(value) {
    const ratio = 10 ** value;
    if (ratio < 1) {
      return `${ratio.toFixed(2)}x`;
    }
    return ratio >= 10 ? `${Math.round(ratio)}x` : `${ratio.toFixed(1)}x`;
  }

  function renderTable() {
    const rows = currentTableRows().slice().sort(compareTableRows);
    const topRows = rows.slice(0, 100);
    setHtml(
      "sweep-ref-table-body",
      topRows.length
        ? topRows.map((row) => `
            <tr>
              <td class="mono">${ui.escapeHtml(row.comboKey)}</td>
              <td class="num">${ui.escapeHtml(String(row.thread_count))}</td>
              <td class="num">${ui.escapeHtml(String(row.stop_sessions))}</td>
              <td class="num">${ui.escapeHtml(formatSigned(row.buy_pct))}</td>
              <td class="num">${ui.escapeHtml(formatSigned(row.sell_pct))}</td>
              <td class="num ${row.meanCagr >= 0 ? "pos" : "neg"}">${ui.escapeHtml(row.meanCagr.toFixed(1))}%</td>
              <td class="num neg">${ui.escapeHtml(row.fullMdd.toFixed(1))}%</td>
              <td class="num neg">${ui.escapeHtml(row.recentMdd.toFixed(1))}%</td>
              <td class="num ${row.worstWindowCagr >= 0 ? "pos" : "neg"}">${ui.escapeHtml(row.worstWindowCagr.toFixed(1))}%</td>
              <td><span class="sweep-ref-plateau sweep-ref-plateau-${row.plateauClass}">${ui.escapeHtml(PLATEAU_LABELS[row.plateauClass])}</span></td>
              <td>${row.tierPass ? '<span class="sweep-ref-tier-pass">PASS</span>' : '<span class="badge neutral">—</span>'}</td>
              <td class="num">${ui.escapeHtml(formatMultiplier(row.compoundRatio))}</td>
            </tr>
          `).join("")
        : `<tr><td colspan="12" class="muted" style="text-align: center">필터 결과가 없습니다.</td></tr>`,
    );
    setText("sweep-ref-table-count", `표시: ${topRows.length} / 필터 통과: ${rows.length} / 전체: ${state.rows.length}`);
    updateSortIcons();
  }

  function compareTableRows(left, right) {
    const leftValue = left[state.sortBy];
    const rightValue = right[state.sortBy];
    if (typeof leftValue === "string" || typeof rightValue === "string") {
      return state.sortDesc
        ? String(rightValue).localeCompare(String(leftValue))
        : String(leftValue).localeCompare(String(rightValue));
    }
    if (rightValue === leftValue) {
      return left.comboKey.localeCompare(right.comboKey);
    }
    return state.sortDesc ? Number(rightValue) - Number(leftValue) : Number(leftValue) - Number(rightValue);
  }

  function updateSortIcons() {
    document.querySelectorAll(".sweep-ref-table th[data-sort-key]").forEach((header) => {
      header.querySelector(".sweep-ref-sort-icon")?.remove();
      const sortKey = header.getAttribute("data-sort-key");
      if (sortKey !== state.sortBy) {
        return;
      }
      const icon = document.createElement("span");
      icon.className = "sweep-ref-sort-icon";
      icon.textContent = state.sortDesc ? "▼" : "▲";
      header.appendChild(icon);
    });
  }

  function formatSigned(value) {
    return `${value >= 0 ? "+" : ""}${Number(value).toFixed(Number.isInteger(value) ? 0 : 1)}%`;
  }

  window.BLSHSweepReferencePanel = {
    mount,
    render,
  };
})();
