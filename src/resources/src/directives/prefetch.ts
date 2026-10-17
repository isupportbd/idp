import type { Directive, DirectiveBinding } from "vue";
import router from "@/router";

/**
 * Why: Route components are lazy `import()` chunks, so the first click on a
 *      dashboard card pays the full network + parse cost before anything paints.
 * How: Warm the target route's chunk on `mouseenter` / `focusin` / `touchstart`,
 *      and (idle) once the element scrolls into the viewport. Navigation then
 *      resolves from the already-loaded module.
 *
 * Usable on a single `<router-link>`/`<a href>` or on a container (e.g. a grid)
 * — every descendant anchor is wired up.
 */

function onIdle(cb: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as any).requestIdleCallback(cb, { timeout: 2500 });
  } else {
    setTimeout(cb, 400);
  }
}

function targetAnchors(el: HTMLElement): HTMLAnchorElement[] {
  if (el.matches?.("a[href]")) return [el as HTMLAnchorElement];
  return Array.from(el.querySelectorAll<HTMLAnchorElement>("a[href]"));
}

function prefetchAnchor(anchor: HTMLAnchorElement, explicit?: string) {
  if ((anchor as any).__prefetched) return;
  const path = (explicit && explicit.trim()) || anchor.getAttribute("href") || "";
  if (!path || path.startsWith("#") || path.startsWith("http")) return;

  (anchor as any).__prefetched = true;
  try {
    for (const record of router.resolve(path).matched) {
      const components = (record.components || {}) as Record<string, any>;
      for (const comp of Object.values(components)) {
        // A lazy route component is the raw `() => import(...)` loader; an
        // already-resolved SFC is an object (or carries `__vccOpts`).
        if (typeof comp === "function" && !(comp as any).__vccOpts) {
          try {
            (comp as () => unknown)();
          } catch {
            /* Prefetch is best-effort — never surface a loader error. */
          }
        }
      }
    }
  } catch {
    /* Unknown path — ignore. */
  }
}

export const prefetch: Directive<HTMLElement, string | undefined> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string | undefined>) {
    const anchors = targetAnchors(el);
    if (anchors.length === 0) return;

    const observer = typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              onIdle(() => anchors.forEach((a) => prefetchAnchor(a, binding.value)));
              observer?.disconnect();
            }
          },
          { rootMargin: "250px" }
        )
      : null;

    const handlers = new Map<HTMLAnchorElement, () => void>();

    for (const anchor of anchors) {
      const run = () => prefetchAnchor(anchor, binding.value);
      handlers.set(anchor, run);
      anchor.addEventListener("mouseenter", run, { passive: true });
      anchor.addEventListener("focusin", run);
      anchor.addEventListener("touchstart", run, { passive: true });
      observer?.observe(anchor);
    }

    (el as any).__prefetchCleanup = () => {
      observer?.disconnect();
      for (const [anchor, run] of handlers) {
        anchor.removeEventListener("mouseenter", run);
        anchor.removeEventListener("focusin", run);
        anchor.removeEventListener("touchstart", run);
      }
      handlers.clear();
    };
  },

  unmounted(el: HTMLElement) {
    const cleanup = (el as any).__prefetchCleanup;
    if (typeof cleanup === "function") cleanup();
    delete (el as any).__prefetchCleanup;
  }
};
