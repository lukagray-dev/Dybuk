// Main entry point for Dybuk Desktop UI (Strict ES6 / TypeScript)

import { initSidebar } from './left-sidebar/sidebar.js';
import { initEditor } from './main-content/canvas/editor.js';
import { initEmptyState } from './main-content/empty-state.js';
import { initTitlebar } from './titlebar/titlebar.js';

export function initApp(): void {
  // Initialize native titlebar controls and menus
  initTitlebar();

  // Initialize left sidebar (document list, creation dropdown, search)
  initSidebar();

  // Initialize main editor canvas & topbar
  initEditor();

  // Initialize empty state buttons and dropdowns
  initEmptyState();
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initApp());
} else {
  initApp();
}
