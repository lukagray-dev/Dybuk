import { lockActiveDocument, saveActiveDocument } from '../main-content/canvas/editor.js';
import { invokeIpc } from '../shared/ipc.js';
import { appState } from '../shared/state.js';

export function setupMenus(): void {
  const menuTriggers = document.querySelectorAll<HTMLButtonElement>('.menu-trigger');
  const dropdownMenus = document.querySelectorAll<HTMLElement>('.dropdown-menu');

  // Open/toggle dropdown when menu trigger is clicked
  menuTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const menuName = trigger.dataset.menu || null;
      const current = appState.getActiveMenu();
      appState.setActiveMenu(current === menuName ? null : menuName);
    });

    // Hover-switch when a menu is already open
    trigger.addEventListener('mouseenter', () => {
      const current = appState.getActiveMenu();
      if (current && trigger.dataset.menu) {
        appState.setActiveMenu(trigger.dataset.menu);
      }
    });
  });

  // Sync active menu state with DOM classes
  appState.subscribe(() => {
    const active = appState.getActiveMenu();

    menuTriggers.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.menu === active);
    });

    dropdownMenus.forEach((menu) => {
      menu.classList.toggle('open', menu.dataset.menu === active);
    });
  });

  // Dismiss menus on outside click
  window.addEventListener('click', () => {
    if (appState.getActiveMenu()) {
      appState.setActiveMenu(null);
    }
  });

  // Wire specific menu actions
  setupFilesMenuActions();
  setupViewMenuActions();
  setupWindowMenuActions();
  setupHelpMenuActions();
}

function setupFilesMenuActions(): void {
  document.getElementById('menu-item-new-doc')?.addEventListener('click', () => {
    appState.setActiveMenu(null);
    console.debug('[Menu:Files] New Document requested');
  });

  document.getElementById('menu-item-open-doc')?.addEventListener('click', () => {
    appState.setActiveMenu(null);
    console.debug('[Menu:Files] Open Document requested');
  });

  document.getElementById('menu-item-save')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await saveActiveDocument();
  });

  document.getElementById('menu-item-save-as')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await saveActiveDocument();
  });

  document.getElementById('menu-item-lock')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await lockActiveDocument();
  });

  document.getElementById('menu-item-settings')?.addEventListener('click', () => {
    appState.setActiveMenu(null);
    console.debug('[Menu:Files] Settings requested');
  });
}

function setupViewMenuActions(): void {
  document.getElementById('menu-item-toggle-recents')?.addEventListener('click', () => {
    appState.setActiveMenu(null);
    appState.toggleSidebar();
  });
}

function setupWindowMenuActions(): void {
  document.getElementById('menu-item-close-window')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('close_window');
  });

  document.getElementById('menu-item-exit')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('exit_application');
  });
}

function setupHelpMenuActions(): void {
  document.getElementById('menu-item-documentation')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_documentation');
  });

  document.getElementById('menu-item-report-bug')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_report_bug');
  });

  document.getElementById('menu-item-follow-creator')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_follow_creator');
  });

  document.getElementById('menu-item-see-repo')?.addEventListener('click', async () => {
    appState.setActiveMenu(null);
    await invokeIpc('open_repository');
  });
}
