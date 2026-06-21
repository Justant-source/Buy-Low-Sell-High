(function () {
  function parseResponse(response) {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const payload = await parseResponse(response);
    if (!response.ok) {
      const message =
        typeof payload === "string"
          ? payload
          : payload && typeof payload.error === "string"
            ? payload.error
            : `Request failed: ${response.status}`;
      throw new Error(message);
    }
    return payload;
  }

  async function postJson(url, body) {
    return fetchJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  function isAbortError(error) {
    return Boolean(error && typeof error === "object" && error.name === "AbortError");
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return new Intl.NumberFormat("en-US").format(number);
  }

  function formatMoney(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(number);
  }

  function formatPercent(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return "-";
    }
    return `${number.toFixed(2)}%`;
  }

  function formatDateTime(value) {
    if (!value) {
      return "-";
    }
    return new Date(value).toLocaleString("ko-KR");
  }

  function shortHash(value) {
    if (!value || typeof value !== "string") {
      return "-";
    }
    return value.length > 12 ? `${value.slice(0, 10)}…` : value;
  }

  function updateLastUpdated() {
    const target = document.getElementById("last-updated");
    if (!target) {
      return;
    }
    target.textContent = `updated ${new Date().toLocaleTimeString("ko-KR")}`;
  }

  function setText(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent = value;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function actionBadge(action) {
    const upper = String(action || "").toUpperCase();
    if (upper.includes("BUY")) {
      return "info";
    }
    if (upper.includes("PROFIT")) {
      return "success";
    }
    if (upper.includes("STOP")) {
      return "danger";
    }
    if (upper.includes("HOLD")) {
      return "warning";
    }
    return "neutral";
  }

  window.SOXLDashboard = {
    fetchJson,
    postJson,
    isAbortError,
    formatNumber,
    formatMoney,
    formatPercent,
    formatDateTime,
    shortHash,
    setText,
    escapeHtml,
    actionBadge,
    updateLastUpdated,
  };

  document.addEventListener("DOMContentLoaded", updateLastUpdated);
})();
