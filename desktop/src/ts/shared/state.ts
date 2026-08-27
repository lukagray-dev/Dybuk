// Central application state manager for Dybuk

type StateChangeListener = () => void;

export interface OpenDocumentState {
  path: string | null;
  name: string;
  isDybuk: boolean;
  isDirty: boolean;
  isUnlocked: boolean;
}

class AppStateManager {
  private sidebarOpen = false;
  private isMaximized = false;
  private activeMenu: string | null = null;
  private currentDoc: OpenDocumentState = {
    path: null,
    name: 'Untitled',
    isDybuk: false,
    isDirty: false,
    isUnlocked: true,
  };
  private listeners: Set<StateChangeListener> = new Set();

  public getSidebarOpen(): boolean {
    return this.sidebarOpen;
  }

  public setSidebarOpen(open: boolean): void {
    if (this.sidebarOpen !== open) {
      this.sidebarOpen = open;
      this.notify();
    }
  }

  public toggleSidebar(): boolean {
    this.sidebarOpen = !this.sidebarOpen;
    this.notify();
    return this.sidebarOpen;
  }

  public getIsMaximized(): boolean {
    return this.isMaximized;
  }

  public setIsMaximized(max: boolean): void {
    if (this.isMaximized !== max) {
      this.isMaximized = max;
      this.notify();
    }
  }

  public getActiveMenu(): string | null {
    return this.activeMenu;
  }

  public setActiveMenu(menu: string | null): void {
    if (this.activeMenu !== menu) {
      this.activeMenu = menu;
      this.notify();
    }
  }

  public getCurrentDoc(): OpenDocumentState {
    return { ...this.currentDoc };
  }

  public setCurrentDoc(doc: Partial<OpenDocumentState>): void {
    this.currentDoc = { ...this.currentDoc, ...doc };
    this.notify();
  }

  public subscribe(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const appState = new AppStateManager();
