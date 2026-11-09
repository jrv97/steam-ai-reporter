// The tab types the extension adapters take. They name no WebExtension API, so code and tests can
// import them without the `chrome` globals.

/**
 * The tab calls of the settings page's way back to the store; none needs a permission. Each
 * rejects on failure, also where an API is missing, such as `windows` on Firefox for Android.
 */
export interface BrowserTabs {
  /** The ID of the active tab in the current window, if the browser gives one. */
  activeTabId(): Promise<number | undefined>;
  /** The ID of the active tab in the last-focused window, if the browser gives one. */
  focusedTabId(): Promise<number | undefined>;
  /** The ID of the tab this page runs in, if it runs in one. */
  ownTabId(): Promise<number | undefined>;
  /** Activates a tab and resolves its window ID, or undefined when the browser returns no tab. */
  activate(id: number): Promise<number | undefined>;
  focusWindow(id: number): Promise<unknown>;
  close(id: number): Promise<unknown>;
}
