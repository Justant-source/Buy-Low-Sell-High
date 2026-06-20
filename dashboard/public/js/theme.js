(function () {
  const KEY = "buylowsellhigh-theme";
  const root = document.documentElement;

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch (_error) {
      // ignore localStorage failures
    }
    document.querySelectorAll("[data-set-theme]").forEach((button) => {
      button.classList.toggle("active", button.dataset.setTheme === theme);
    });
  }

  const savedTheme = (() => {
    try {
      return localStorage.getItem(KEY);
    } catch (_error) {
      return null;
    }
  })() || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  root.setAttribute("data-theme", savedTheme);

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-set-theme]").forEach((button) => {
      button.classList.toggle("active", button.dataset.setTheme === savedTheme);
    });
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-set-theme]");
    if (!button) {
      return;
    }
    applyTheme(button.dataset.setTheme);
  });
})();
