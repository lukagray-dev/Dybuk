// Project workspaces manager for the left sidebar
//
// Hey friend! This module is the brain behind the "Projects" section in Dybuk's sidebar.
// It handles:
// 1. Loading projects that the user has opened from their computer.
// 2. Rendering each project as a collapsible sub-section (modeled after Operon).
// 3. Showing all Markdown (.md) and Dybuk vault (.dybuk) files inside each project folder.
// 4. Giving each project header a "New document in project" button (with .md and .dybuk dropdown)
//    and a "Close project" button.
// 5. Giving each file item a three-dots (...) options button for Copy Path, Reveal in Explorer, and Delete.
// 6. Allowing the user to collapse/expand projects and open any file in the editor canvas!

import { openDocument } from '../main-content/canvas/editor.js';
import { appState } from '../shared/state.js';
import { dismissContextMenu, showProjectItemContextMenu } from './context-menu.js';
import { showCreateDocumentDialog } from './dialog.js';
import { listProjectsIpc, openProjectPickerIpc, removeProjectIpc } from './ipc.js';
import { DocumentType, ProjectEntry, ProjectFileEntry } from './types.js';

/** In-memory cache of currently open projects */
let openProjects: ProjectEntry[] = [];

/** Set of normalized paths for projects that the user has collapsed in the UI */
const collapsedProjects: Set<string> = new Set();

/** Current live search query from the sidebar search box */
let currentSearchQuery = '';

/** Active new document dropdown attached to a project header button */
let activeProjectNewDropdown: HTMLElement | null = null;

// Global dismiss for the project header dropdown
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    if (activeProjectNewDropdown && !activeProjectNewDropdown.contains(e.target as Node)) {
      dismissProjectNewDropdown();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      dismissProjectNewDropdown();
    }
  });
}

/**
 * Dismisses any open "New Document in Project" dropdown menu.
 */
function dismissProjectNewDropdown(): void {
  if (activeProjectNewDropdown) {
    activeProjectNewDropdown.remove();
    activeProjectNewDropdown = null;
  }
}

/**
 * Initializes the projects subsystem:
 * - Wires the "+ Add Project Folder" action button in the section header.
 * - Loads any previously saved projects from disk.
 */
export function initProjects(): void {
  setupAddProjectButton();
  refreshProjects();
}

/**
 * Configures the "+ Add Project Folder" button located on the Projects section header.
 */
function setupAddProjectButton(): void {
  const btnAdd = document.getElementById('btn-add-project');
  btnAdd?.addEventListener('click', async (e) => {
    e.stopPropagation(); // Don't trigger the section expand/collapse toggle
    await triggerOpenProjectPicker();
  });
}

/**
 * Opens the native folder picker, lets the user select a folder,
 * adds it to our project list, and updates the sidebar UI.
 *
 * This function can also be called directly from the titlebar File -> Open Project menu!
 */
export async function triggerOpenProjectPicker(): Promise<ProjectEntry | null> {
  try {
    const pickedProject = await openProjectPickerIpc();
    if (pickedProject) {
      // Check if project is already present in our list
      const existingIdx = openProjects.findIndex(
        (p) => p.path.toLowerCase() === pickedProject.path.toLowerCase()
      );

      if (existingIdx >= 0) {
        // Replace with updated scan
        openProjects[existingIdx] = pickedProject;
      } else {
        // Add new project to the top of the list
        openProjects.unshift(pickedProject);
      }

      // Automatically expand newly opened project
      collapsedProjects.delete(pickedProject.path.toLowerCase());

      // Re-render the sidebar to display the new project immediately
      renderProjectsSection();
      return pickedProject;
    }
  } catch (err) {
    console.error('Failed to open project folder:', err);
  }
  return null;
}

/**
 * Loads all saved projects from the backend (projects.json) and re-renders them.
 */
export async function refreshProjects(): Promise<void> {
  try {
    openProjects = await listProjectsIpc();
    renderProjectsSection();
  } catch (err) {
    console.error('Failed to load projects list:', err);
  }
}

/**
 * Updates the search filter term for projects.
 * Called automatically by the sidebar search input listener.
 */
export function setProjectsSearchFilter(query: string): void {
  currentSearchQuery = query.trim().toLowerCase();
  renderProjectsSection();
}

/**
 * Toggles the collapsed/expanded state of an individual project sub-section.
 */
function toggleProjectCollapse(projectPath: string): void {
  const key = projectPath.toLowerCase();
  if (collapsedProjects.has(key)) {
    collapsedProjects.delete(key);
  } else {
    collapsedProjects.add(key);
  }
  renderProjectsSection();
}

/**
 * Renders the entire "Projects" section in the left sidebar.
 * Builds the project cards, collapsible headers, action buttons, and file trees.
 */
export function renderProjectsSection(): void {
  const container = document.getElementById('projects-items-container');
  const countBadge = document.getElementById('projects-count-badge');
  if (!container) return;

  // Update total projects count badge
  if (countBadge) {
    countBadge.textContent = String(openProjects.length);
  }

  // Clear previous contents
  container.innerHTML = '';

  // Case 1: No projects are open yet
  if (openProjects.length === 0) {
    container.innerHTML = `
      <div class="empty-section-msg">
        ${currentSearchQuery ? 'No matching projects' : 'No projects open yet'}
      </div>
    `;
    return;
  }

  const currentDoc = appState.getCurrentDoc();
  const currentPathNorm = currentDoc.path ? currentDoc.path.toLowerCase() : '';

  let visibleProjectsCount = 0;

  // Case 2: Render each project card
  openProjects.forEach((proj) => {
    const projPathNorm = proj.path.toLowerCase();

    // Filter project files according to the live search term
    const matchedFiles = proj.files.filter((file) => {
      if (!currentSearchQuery) return true;
      return (
        file.name.toLowerCase().includes(currentSearchQuery) ||
        file.relative_path.toLowerCase().includes(currentSearchQuery)
      );
    });

    const matchesProjectName = proj.name.toLowerCase().includes(currentSearchQuery);

    // If searching and neither the project name nor any of its files match, skip this project
    if (currentSearchQuery && !matchesProjectName && matchedFiles.length === 0) {
      return;
    }

    visibleProjectsCount++;

    const isCollapsed = collapsedProjects.has(projPathNorm);
    const hasActiveFile = currentPathNorm.length > 0 && currentPathNorm.startsWith(projPathNorm);

    // Create project container card
    const card = document.createElement('div');
    card.className = `project-card ${isCollapsed ? 'collapsed' : ''}`;

    // 1. Project Sub-section Header
    const header = document.createElement('div');
    header.className = `project-header ${hasActiveFile ? 'active' : ''}`;
    header.title = proj.path;
    header.innerHTML = `
      <div class="session-item-left">
        <span class="ui-icon icon-sidebar-chevron-down chevron-icon proj-chevron"></span>
        <span class="ui-icon icon-sidebar-folder"></span>
        <span class="session-title-text">${escapeHtml(proj.name)}</span>
      </div>
      <div class="project-header-actions">
        <button class="section-action-btn btn-proj-new-doc" title="New Document in Project">
          <span class="ui-icon icon-sidebar-new-doc"></span>
        </button>
        <button class="section-action-btn btn-proj-delete" title="Close Project (Remove from sidebar)">
          <span class="ui-icon icon-sidebar-trash"></span>
        </button>
      </div>
    `;

    // Clicking anywhere on the project header (except action buttons) expands/collapses it
    header.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.section-action-btn')) return;
      toggleProjectCollapse(proj.path);
    });

    // Create new document in this project button
    const newDocBtn = header.querySelector<HTMLButtonElement>('.btn-proj-new-doc');
    newDocBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      showNewDocumentDropdown(newDocBtn, proj);
    });

    // Close / Remove project button
    const deleteBtn = header.querySelector('.btn-proj-delete');
    deleteBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await removeProjectIpc(proj.path);
        // Remove from memory and re-render
        openProjects = openProjects.filter(
          (p) => p.path.toLowerCase() !== projPathNorm
        );
        collapsedProjects.delete(projPathNorm);
        renderProjectsSection();
      } catch (err) {
        console.error('Failed to remove project from sidebar:', err);
      }
    });

    card.appendChild(header);

    // 2. Project Files List Container
    const filesContainer = document.createElement('div');
    filesContainer.className = 'project-files';

    if (matchedFiles.length === 0) {
      filesContainer.innerHTML = `
        <div class="empty-section-msg">
          ${currentSearchQuery ? 'No matching files' : 'No markdown or dybuk files'}
        </div>
      `;
    } else {
      matchedFiles.forEach((file) => {
        const isFileActive = currentPathNorm === file.path.toLowerCase();
        const fileItem = createProjectFileItem(file, proj, isFileActive);
        filesContainer.appendChild(fileItem);
      });
    }

    card.appendChild(filesContainer);
    container.appendChild(card);
  });

  // If search query filtered out all projects
  if (visibleProjectsCount === 0 && openProjects.length > 0) {
    container.innerHTML = `
      <div class="empty-section-msg">No matching files in open projects</div>
    `;
  }
}

/**
 * Displays a dropdown menu anchored below the "+ New Document in Project" button.
 * Allows creating either a Standard Markdown file or an Encrypted Dybuk Vault in this folder.
 */
function showNewDocumentDropdown(anchorBtn: HTMLElement, project: ProjectEntry): void {
  dismissProjectNewDropdown();
  dismissContextMenu();

  const dropdown = document.createElement('div');
  dropdown.className = 'project-new-dropdown';

  dropdown.innerHTML = `
    <button type="button" class="context-menu-item" data-type="md">
      <svg class="sidebar-item-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
      <span>Standard Document (.md)</span>
    </button>
    <button type="button" class="context-menu-item" data-type="dybuk">
      <svg class="sidebar-item-icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <span>Encrypted Vault (.dybuk)</span>
    </button>
  `;

  document.body.appendChild(dropdown);
  activeProjectNewDropdown = dropdown;

  // Position adjacent to the trigger button
  const rect = anchorBtn.getBoundingClientRect();
  const menuWidth = 195;
  let left = rect.right - menuWidth;
  if (left < 10) left = 10;
  if (left + menuWidth > window.innerWidth - 10) {
    left = window.innerWidth - menuWidth - 10;
  }

  const top = rect.bottom + 4;
  dropdown.style.left = `${left}px`;
  dropdown.style.top = `${top}px`;

  // Wire options click
  dropdown.querySelectorAll<HTMLElement>('.context-menu-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      dismissProjectNewDropdown();
      const type = item.dataset.type as DocumentType;
      if (type) {
        const created = await showCreateDocumentDialog(type, project.path);
        if (created) {
          // Expand project so the new file is visible
          collapsedProjects.delete(project.path.toLowerCase());
          // Refresh projects list and open the new file into the editor!
          await refreshProjects();
          await openDocument(created.path, created.name, created.is_dybuk);
        }
      }
    });
  });
}

/**
 * Creates a single document DOM item representing a file inside a project.
 * Includes the three-dots (...) options button.
 */
function createProjectFileItem(
  file: ProjectFileEntry,
  project: ProjectEntry,
  isActive: boolean
): HTMLElement {
  const div = document.createElement('div');
  div.className = `doc-item ${isActive ? 'active' : ''}`;
  div.title = `${file.relative_path}\n${file.path}`;

  // Use appropriate SVG icon for Dybuk vaults vs standard Markdown
  const iconSvg = file.is_dybuk
    ? '<svg class="sidebar-item-icon" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
    : '<svg class="sidebar-item-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';

  div.innerHTML = `
    <div class="doc-item-left">
      ${iconSvg}
      <span class="doc-title-text">${escapeHtml(file.relative_path)}</span>
    </div>
    <button class="item-more-btn" title="Options">
      <span class="ui-icon icon-sidebar-more-vertical"></span>
    </button>
  `;

  // Clicking a file opens it into the central editor canvas!
  div.addEventListener('click', async (e) => {
    if ((e.target as HTMLElement).closest('.item-more-btn')) return;
    const success = await openDocument(file.path, file.name, file.is_dybuk);
    if (success) {
      renderProjectsSection();
    }
  });

  // Wire three-dots button to show context menu
  const moreBtn = div.querySelector<HTMLButtonElement>('.item-more-btn');
  moreBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    showProjectItemContextMenu(moreBtn, file, project, async () => {
      await refreshProjects();
    });
  });

  return div;
}

/**
 * Helper function to safely escape HTML special characters to prevent XSS.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
