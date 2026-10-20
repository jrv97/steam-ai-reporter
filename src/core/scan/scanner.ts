import type { AppId } from "../types";
import { appIdFromHref } from "./appid";
import { DATA_CANDIDATE, LINK_CANDIDATE, namingOf, SKIPPED } from "./candidates";
import { createHostFinder } from "./hosts";
import { HOST_APPID, HOST_HIDEABLE, HOST_STATE, isInSarNode, isSarNode, SAR_NODE } from "./marks";
import { placeHost, type Placement, PLACEMENTS } from "./placements";
import type { CapsuleHost, CapsuleRenderer } from "./renderer";

/** Quiet time after the last mutation before a scan. */
export const DEBOUNCE_MS = 200;
/** The longest a mutation waits for its scan while the page keeps changing. */
export const MAX_WAIT_MS = 1000;

/** What one scan did; for debug logs and tests. */
export interface ScanReport {
  /** `page`: the whole body (start, bfcache restore). `added`: only added subtrees. */
  readonly kind: "page" | "added";
  /** Subtrees scanned. */
  readonly roots: number;
  /** Distinct elements that named an app and were checked for a host. */
  readonly candidates: number;
  readonly found: number;
  readonly changed: number;
}

export interface ScannerOptions {
  readonly document: Document;
  readonly renderer: CapsuleRenderer;
  /** Defaults to `PLACEMENTS`. */
  readonly placements?: readonly Placement[];
  readonly onReport?: (report: ScanReport) => void;
}

export interface Scanner {
  /** Scans the page in the next animation frame, then scans added subtrees as they come. */
  start(): void;
  /** Disconnects the observer and drops pending work. `start` may be called again. */
  stop(): void;
}

interface HostRecord {
  readonly appId: AppId;
  readonly placement: Placement;
}

/** What the read phase decided; the write phase only applies it. */
interface ScanPlan {
  readonly found: CapsuleHost[];
  readonly changed: CapsuleHost[];
  /** Elements carrying our marks that we did not mark: carousel clones or a previous instance. */
  readonly stale: Element[];
  readonly report: ScanReport;
}

/**
 * Finds capsule hosts (rq6, S5) and hands them to the renderer. One `MutationObserver` on `body`
 * collects added subtrees, debounced by `DEBOUNCE_MS` up to `MAX_WAIT_MS`; each scan reads the DOM
 * first and writes after, in one animation frame. Hosts are remembered in a `WeakMap`, so a
 * rescan finds nothing new. The observer disconnects on `pagehide` and resumes on a bfcache
 * `pageshow`.
 */
export function createScanner(options: ScannerOptions): Scanner {
  const { document, renderer, onReport } = options;
  const placements = options.placements ?? PLACEMENTS;
  const view = document.defaultView;
  const hosts = new WeakMap<Element, HostRecord>();
  const observer = new MutationObserver(onMutations);
  let pending = new Set<Element>();
  let pageScanDue = false;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  let frame: number | undefined;

  function onMutations(records: readonly MutationRecord[]): void {
    let added = false;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node instanceof Element && !isSarNode(node)) {
          pending.add(node);
          added = true;
        }
      }
    }
    if (added) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(requestFrame, DEBOUNCE_MS);
      maxWaitTimer ??= setTimeout(requestFrame, MAX_WAIT_MS);
    }
  }

  function clearTimers(): void {
    clearTimeout(debounceTimer);
    clearTimeout(maxWaitTimer);
    debounceTimer = undefined;
    maxWaitTimer = undefined;
  }

  function requestFrame(): void {
    clearTimers();
    frame ??= requestAnimationFrame(runScan);
  }

  function runScan(): void {
    frame = undefined;
    clearTimers();
    const kind = pageScanDue ? "page" : "added";
    const roots = pageScanDue ? [document.body] : liveRoots(pending);
    pageScanDue = false;
    pending = new Set();
    if (roots.length === 0) {
      return;
    }
    const plan = read(kind, roots);
    write(plan);
    onReport?.(plan.report);
  }

  /** The known host that is `element` or encloses it, for `appId` or for any app. */
  function knownHostAround(element: Element, appId?: AppId): Element | undefined {
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const record = hosts.get(node);
      if (record !== undefined && (appId === undefined || record.appId === appId)) {
        return node;
      }
    }
    return undefined;
  }

  /** Whether `host` holds a known host of the same app, which then stays the host. */
  function holdsKnownHost(host: Element, appId: AppId): boolean {
    for (const marked of host.querySelectorAll(`[${HOST_APPID}='${String(appId)}']`)) {
      if (hosts.get(marked)?.appId === appId) {
        return true;
      }
    }
    return false;
  }

  function read(kind: ScanReport["kind"], roots: readonly Element[]): ScanPlan {
    const base = document.baseURI;
    const pageAppId = appIdFromHref(document.URL, document.URL);
    const finder = createHostFinder(document);
    const candidates = new Set<Element>();
    const changedHosts = new Set<Element>();
    const stale: Element[] = [];
    for (const selector of [DATA_CANDIDATE, LINK_CANDIDATE]) {
      for (const root of roots) {
        if (root.matches(selector)) {
          candidates.add(root);
        }
        for (const element of root.querySelectorAll(selector)) {
          candidates.add(element);
        }
      }
    }
    for (const root of roots) {
      const known = kind === "added" ? knownHostAround(root) : undefined;
      if (known !== undefined) {
        changedHosts.add(known);
      }
      if (root.hasAttribute(HOST_APPID) && !hosts.has(root)) {
        stale.push(root);
      }
      for (const marked of root.querySelectorAll(`[${HOST_APPID}]`)) {
        if (!hosts.has(marked)) {
          stale.push(marked);
        }
      }
    }

    const fresh = new Map<Element, AppId>();
    let checked = 0;
    for (const candidate of candidates) {
      const appId = namingOf(candidate, base);
      if (typeof appId !== "number" || appId === pageAppId || candidate.closest(SKIPPED) !== null) {
        continue;
      }
      checked++;
      const host = finder.hostOf(candidate, appId);
      if (host === undefined || fresh.has(host)) {
        continue;
      }
      const known = knownHostAround(host, appId);
      if (known !== undefined) {
        if (kind === "added") {
          changedHosts.add(known);
        }
        continue;
      }
      fresh.set(host, appId);
    }

    const found: CapsuleHost[] = [];
    for (const [element, appId] of fresh) {
      if (enclosedByFresh(element, appId, fresh) || holdsKnownHost(element, appId)) {
        continue;
      }
      const placed = placeHost(element, placements);
      if (placed !== undefined) {
        found.push({ element, appId, placement: placed.placement, anchor: placed.anchor });
      }
    }
    const changed: CapsuleHost[] = [];
    for (const element of changedHosts) {
      const record = hosts.get(element);
      const anchor = record?.placement.anchor(element);
      if (record !== undefined && anchor !== undefined) {
        changed.push({ element, appId: record.appId, placement: record.placement, anchor });
      }
    }
    const report: ScanReport = {
      kind,
      roots: roots.length,
      candidates: checked,
      found: found.length,
      changed: changed.length,
    };
    return { found, changed, stale, report };
  }

  function write(plan: ScanPlan): void {
    for (const element of plan.stale) {
      element.removeAttribute(HOST_APPID);
      element.removeAttribute(HOST_STATE);
      element.removeAttribute(HOST_HIDEABLE);
      for (const copy of element.querySelectorAll(SAR_NODE)) {
        copy.remove();
      }
    }
    for (const host of plan.found) {
      host.element.setAttribute(HOST_APPID, String(host.appId));
      host.element.setAttribute(HOST_STATE, "pending");
      if (!host.placement.hideable) {
        host.element.setAttribute(HOST_HIDEABLE, "false");
      }
      hosts.set(host.element, { appId: host.appId, placement: host.placement });
    }
    if (plan.found.length > 0 || plan.changed.length > 0) {
      renderer.render({ found: plan.found, changed: plan.changed });
    }
  }

  function connect(): void {
    observer.observe(document.body, { childList: true, subtree: true });
    pageScanDue = true;
    requestFrame();
  }

  function disconnect(): void {
    observer.disconnect();
    clearTimers();
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    pending = new Set();
    pageScanDue = false;
  }

  function onPageShow(event: PageTransitionEvent): void {
    if (event.persisted) {
      connect();
    }
  }

  return {
    start() {
      disconnect();
      connect();
      view?.addEventListener("pagehide", disconnect);
      view?.addEventListener("pageshow", onPageShow);
    },
    stop() {
      disconnect();
      view?.removeEventListener("pagehide", disconnect);
      view?.removeEventListener("pageshow", onPageShow);
    },
  };
}

/** The pending roots still in the page and outside our own nodes. */
function liveRoots(pending: ReadonlySet<Element>): Element[] {
  const roots: Element[] = [];
  for (const root of pending) {
    if (root.isConnected && !isInSarNode(root)) {
      roots.push(root);
    }
  }
  return roots;
}

/** Whether a fresh host of the same app encloses `element`: the outer one is the host. */
function enclosedByFresh(
  element: Element,
  appId: AppId,
  fresh: ReadonlyMap<Element, AppId>,
): boolean {
  for (let node = element.parentElement; node !== null; node = node.parentElement) {
    if (fresh.get(node) === appId) {
      return true;
    }
  }
  return false;
}
