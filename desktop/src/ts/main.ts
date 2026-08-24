// Main entry point for Dybuk Desktop UI (Strict ES6 / TypeScript)

export function initApp(): void {
  const appElement = document.getElementById("app");
  if (appElement) {
    appElement.innerHTML = `
      <main class="editor-container">
        <!-- Main canvas initialized -->
      </main>
    `;
  }
}

// Auto-initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initApp());
} else {
  initApp();
}
