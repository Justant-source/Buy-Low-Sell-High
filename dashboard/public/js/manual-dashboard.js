(function () {
  const ui = window.SOXLDashboard;
  const state = {
    profiles: [],
    currentProfileId: "mentor_default_7x30",
  };

  function currentProfileId() {
    return document.getElementById("profile-select").value || state.currentProfileId;
  }

  function profileQuery() {
    return `profileId=${encodeURIComponent(currentProfileId())}`;
  }

  function showError(error) {
    const box = document.getElementById("manual-error");
    box.textContent = error instanceof Error ? error.message : String(error);
    box.classList.add("visible");
  }

  function clearError() {
    const box = document.getElementById("manual-error");
    box.textContent = "";
    box.classList.remove("visible");
  }

  function readPositiveIntegerQuantity() {
    const value = document.getElementById("qty-input").value.trim();
    if (!/^[1-9]\d*$/.test(value)) {
      throw new Error("Quantity는 1 이상의 정수여야 합니다.");
    }
    return value;
  }

  function populateProfiles(payload) {
    state.profiles = payload.profiles || [];
    const select = document.getElementById("profile-select");
    select.innerHTML = state.profiles
      .map(
        (profile) =>
          `<option value="${ui.escapeHtml(profile.profileId)}">${ui.escapeHtml(`${profile.profileId} · ${profile.threadCount}T/${profile.stopSessions}S`)}</option>`,
      )
      .join("");
    select.value = payload.defaultProfileId || state.currentProfileId;
    state.currentProfileId = select.value;
  }

  function comparisonBadge(status, quality) {
    if (status === "FILLED") {
      if (quality === "BETTER") {
        return "success";
      }
      if (quality === "WORSE") {
        return "danger";
      }
      return "info";
    }
    if (status === "PENDING_FILL") {
      return "warning";
    }
    return "neutral";
  }

  function renderComparison(payload) {
    const rows = payload.rows || [];
    const buyCount = rows.filter((row) => row.action === "BUY").length;
    const exitCount = rows.filter((row) => row.action === "TAKE_PROFIT" || row.action === "TIME_STOP").length;
    ui.setText("kpi-buy-recs", ui.formatNumber(buyCount));
    ui.setText("kpi-exit-recs", ui.formatNumber(exitCount));
    const tbody = document.getElementById("manual-recs-tbody");
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">권고 없음</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(
        (row) => `<tr>
          <td>${ui.escapeHtml(String(row.thread_id))}</td>
          <td><span class="badge ${ui.actionBadge(row.action)}">${ui.escapeHtml(row.action)}</span></td>
          <td>${ui.escapeHtml(row.expected_side || "-")}</td>
          <td><span class="badge ${comparisonBadge(row.status, row.execution_quality)}">${ui.escapeHtml(row.status)}</span></td>
          <td class="num">${ui.escapeHtml(row.basis_price)}</td>
          <td class="num">${ui.escapeHtml(row.actual_price || "-")}</td>
          <td class="num">${ui.escapeHtml(row.price_gap_pct ? ui.formatPercent(row.price_gap_pct) : "-")}</td>
          <td class="mono">${ui.escapeHtml(row.actual_filled_at || row.session_date)}</td>
        </tr>`,
      )
      .join("");
  }

  function renderThreads(payload) {
    ui.setText("ledger-path", payload.ledgerPath);
    ui.setText("kpi-open-threads", ui.formatNumber(payload.summary.open_threads));
    ui.setText("kpi-cash", payload.summary.total_cash);
    ui.setText("kpi-qty", payload.summary.total_quantity);

    const threadSelect = document.getElementById("thread-select");
    threadSelect.innerHTML = payload.threads
      .map((thread) => `<option value="${ui.escapeHtml(String(thread.thread_id))}">${ui.escapeHtml(String(thread.thread_id))}</option>`)
      .join("");

    const threadsTbody = document.getElementById("manual-threads-tbody");
    threadsTbody.innerHTML = payload.threads
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

  function renderReconcile(payload) {
    const issuesList = document.getElementById("ledger-issues-list");
    if (!payload.issues.length) {
      issuesList.innerHTML = '<div class="stack-row"><span class="title">이슈 없음</span><span class="badge success">clean</span></div>';
      return;
    }
    issuesList.innerHTML = payload.issues
      .map((issue) => `<div class="stack-row"><span class="title">${ui.escapeHtml(issue)}</span><span class="badge danger">issue</span></div>`)
      .join("");
  }

  function renderHistory(payload) {
    ui.setText("kpi-fill-count", ui.formatNumber(payload.summary.fill_count));
    const fillsTbody = document.getElementById("fills-tbody");
    const fills = [...payload.fills].reverse();
    if (!fills.length) {
      fillsTbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center">fill 이력이 없습니다.</td></tr>';
      return;
    }
    fillsTbody.innerHTML = fills
      .map((fill) => `<tr>
        <td class="mono">${ui.escapeHtml(ui.shortHash(fill.fill_id))}</td>
        <td>${ui.escapeHtml(String(fill.thread_id))}</td>
        <td><span class="badge ${fill.side === "BUY" ? "info" : "warning"}">${ui.escapeHtml(fill.side)}</span></td>
        <td class="num">${ui.escapeHtml(fill.quantity)}</td>
        <td class="num">${ui.escapeHtml(fill.price)}</td>
        <td class="num">${ui.escapeHtml(fill.fee)}</td>
        <td class="mono">${ui.escapeHtml(fill.filled_at)}</td>
        <td>${fill.reversed_by_fill_id ? '<span class="badge neutral">reversed</span>' : `<button class="btn" data-reverse-id="${ui.escapeHtml(fill.fill_id)}">reverse</button>`}</td>
      </tr>`)
      .join("");
  }

  async function refreshPage() {
    state.currentProfileId = currentProfileId();
    const [threads, history, reconcile, comparison] = await Promise.all([
      ui.fetchJson(`/api/manual/threads?${profileQuery()}`),
      ui.fetchJson(`/api/manual/history?${profileQuery()}`),
      ui.postJson("/api/manual/reconcile", { profileId: currentProfileId() }),
      ui.fetchJson(`/api/manual/comparison?${profileQuery()}`),
    ]);
    renderThreads(threads);
    renderHistory(history);
    renderReconcile(reconcile);
    renderComparison(comparison);
    clearError();
  }

  async function bootstrap() {
    const profiles = await ui.fetchJson("/api/profiles");
    populateProfiles(profiles);
    await refreshPage();
  }

  document.getElementById("profile-select").addEventListener("change", async () => {
    await refreshPage();
  });

  document.getElementById("refresh-button").addEventListener("click", async () => {
    await refreshPage();
  });

  document.getElementById("export-json-button").addEventListener("click", () => {
    window.location.href = `/api/manual/export?${profileQuery()}&format=json`;
  });

  document.getElementById("export-csv-button").addEventListener("click", () => {
    window.location.href = `/api/manual/export?${profileQuery()}&format=csv`;
  });

  document.getElementById("restore-button").addEventListener("click", async () => {
    try {
      const rawPayload = document.getElementById("restore-payload").value.trim();
      if (!rawPayload) {
        throw new Error("Restore JSON을 입력하세요.");
      }
      await ui.postJson("/api/manual/restore", {
        profileId: currentProfileId(),
        payload: JSON.parse(rawPayload),
        confirmToken: document.getElementById("restore-token-input").value.trim(),
      });
      document.getElementById("restore-payload").value = "";
      document.getElementById("restore-token-input").value = "";
      await refreshPage();
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("fill-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await ui.postJson("/api/manual/fills", {
        profileId: currentProfileId(),
        threadId: Number(document.getElementById("thread-select").value),
        side: document.getElementById("side-select").value,
        quantity: readPositiveIntegerQuantity(),
        price: document.getElementById("price-input").value.trim(),
        fee: document.getElementById("fee-input").value.trim() || "0",
        filledAt: document.getElementById("filled-at-input").value.trim() || undefined,
      });
      document.getElementById("qty-input").value = "";
      document.getElementById("price-input").value = "";
      document.getElementById("filled-at-input").value = "";
      await refreshPage();
    } catch (error) {
      showError(error);
    }
  });

  document.getElementById("fills-tbody").addEventListener("click", async (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const button = event.target.closest("[data-reverse-id]");
    if (!button) {
      return;
    }
    try {
      await ui.postJson(`/api/manual/fills/${encodeURIComponent(button.dataset.reverseId)}/reverse`, {
        profileId: currentProfileId(),
      });
      await refreshPage();
    } catch (error) {
      showError(error);
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((error) => {
      showError(error);
    });
  });
})();
