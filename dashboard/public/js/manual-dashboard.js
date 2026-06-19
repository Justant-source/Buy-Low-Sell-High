(function () {
  const ui = window.SOXLDashboard;
  const state = {
    profiles: [],
    currentProfileId: "mentor_default_5x30",
  };

  function currentProfileId() {
    return document.getElementById("profile-select").value || state.currentProfileId;
  }

  function populateProfiles(payload) {
    state.profiles = payload.profiles || [];
    const select = document.getElementById("profile-select");
    select.innerHTML = state.profiles
      .map((profile) => `<option value="${ui.escapeHtml(profile.profileId)}">${ui.escapeHtml(profile.profileId)}</option>`)
      .join("");
    select.value = payload.defaultProfileId || state.currentProfileId;
    state.currentProfileId = select.value;
  }

  function renderRecommendations(payload) {
    const rows = payload.recommendations || [];
    const buyCount = rows.filter((row) => row.action === "BUY").length;
    const exitCount = rows.filter((row) => row.action === "TAKE_PROFIT" || row.action === "TIME_STOP").length;
    ui.setText("kpi-buy-recs", ui.formatNumber(buyCount));
    ui.setText("kpi-exit-recs", ui.formatNumber(exitCount));
    const tbody = document.getElementById("manual-recs-tbody");
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
    ui.setText("kpi-fill-count", ui.formatNumber(ledger.summary.fill_count));
    ui.setText("kpi-cash", ledger.summary.total_cash);
    ui.setText("kpi-qty", ledger.summary.total_quantity);

    const threadSelect = document.getElementById("thread-select");
    threadSelect.innerHTML = ledger.threads
      .map((thread) => `<option value="${ui.escapeHtml(String(thread.thread_id))}">${ui.escapeHtml(String(thread.thread_id))}</option>`)
      .join("");

    const threadsTbody = document.getElementById("manual-threads-tbody");
    threadsTbody.innerHTML = ledger.threads
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

    const issuesList = document.getElementById("ledger-issues-list");
    if (!ledger.issues.length) {
      issuesList.innerHTML = '<div class="stack-row"><span class="title">이슈 없음</span><span class="badge success">clean</span></div>';
    } else {
      issuesList.innerHTML = ledger.issues
        .map((issue) => `<div class="stack-row"><span class="title">${ui.escapeHtml(issue)}</span><span class="badge danger">issue</span></div>`)
        .join("");
    }

    const fillsTbody = document.getElementById("fills-tbody");
    const fills = [...ledger.fills].reverse();
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
    const profileId = currentProfileId();
    state.currentProfileId = profileId;
    const [ledger, recommendations] = await Promise.all([
      ui.fetchJson(`/api/manual/ledger?profileId=${encodeURIComponent(profileId)}`),
      ui.fetchJson(`/api/manual/today?profileId=${encodeURIComponent(profileId)}`),
    ]);
    renderLedger(ledger);
    renderRecommendations(recommendations);
    document.getElementById("manual-error").classList.remove("visible");
    document.getElementById("manual-error").textContent = "";
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

  document.getElementById("fill-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await ui.postJson("/api/manual/fills", {
        profileId: currentProfileId(),
        threadId: Number(document.getElementById("thread-select").value),
        side: document.getElementById("side-select").value,
        quantity: document.getElementById("qty-input").value.trim(),
        price: document.getElementById("price-input").value.trim(),
        fee: document.getElementById("fee-input").value.trim() || "0",
        filledAt: document.getElementById("filled-at-input").value.trim() || undefined,
      });
      document.getElementById("qty-input").value = "";
      document.getElementById("price-input").value = "";
      document.getElementById("filled-at-input").value = "";
      await refreshPage();
    } catch (error) {
      const box = document.getElementById("manual-error");
      box.textContent = error.message;
      box.classList.add("visible");
    }
  });

  document.getElementById("fills-tbody").addEventListener("click", async (event) => {
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
      const box = document.getElementById("manual-error");
      box.textContent = error.message;
      box.classList.add("visible");
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    bootstrap().catch((error) => {
      const box = document.getElementById("manual-error");
      box.textContent = error.message;
      box.classList.add("visible");
    });
  });
})();
