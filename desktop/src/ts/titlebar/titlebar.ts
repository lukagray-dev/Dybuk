// Titlebar initialization entry point

import { setupBrandLogoToggle, setupWindowActions } from './actions.js';
import { setupMenus } from './menu.js';

export function initTitlebar(): void {
  setupWindowActions();
  setupBrandLogoToggle();
  setupMenus();
}
