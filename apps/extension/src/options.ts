document.addEventListener("DOMContentLoaded", () => {
  // v1: Placeholder connect page shown via chrome.runtime.openOptionsPage()
  // Full provider connection flow will be implemented in a future iteration.
  const container = document.querySelector(".options-main");
  if (container !== null) {
    container.innerHTML = `<section class="connect-placeholder">
        <h2>Add a Provider</h2>
        <p class="connect-placeholder__subtitle">Provider connection flow coming soon.</p>
        <p>Configure AI providers (Ollama, Claude, Copilot CLI, etc.) to use with BYOM Wallet.</p>
      </section>`;
  }
});
