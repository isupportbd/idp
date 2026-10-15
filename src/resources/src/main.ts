import "@/plugins/axios";
import { createHead } from "@vueuse/head";
import { createPinia } from "pinia";
import { createApp } from "vue";
import { DialogPlugin } from "@/plugins/dialog";
import { GumPlugin } from "@/plugins/gum";
import { PulsePlugin } from "@/plugins/pulse";
import App from "./App.vue";
import router from "./router";

import "bootstrap-icons/font/bootstrap-icons.css";
// NOTE: Bootstrap's CSS is compiled by custom.scss (`@use "bootstrap/scss/bootstrap"`),
// so the prebuilt bootstrap.min.css must NOT also be imported here — doing so shipped
// the entire framework stylesheet twice (~230 KB of duplicate CSS).
import "@/assets/scss/custom.scss";
import "@/assets/scss/idp-dark.scss";

const app = createApp(App);
const pinia = createPinia();
const head = createHead({ titleTemplate: (title) => (title ? `${title} - IDP` : "IDP") });

app.use(pinia);
app.use(router);
app.use(head);
app.use(DialogPlugin);
app.use(GumPlugin);
// Globally prevent accidental mouse wheel scrolling / incrementing / decrementing on number inputs
const blockNumberWheel = (event: Event) => {
  const e = event as WheelEvent;
  const target = e.target as HTMLElement | null;
  const active = document.activeElement as HTMLElement | null;

  if (
    (target && target.tagName === "INPUT" && (target as HTMLInputElement).type === "number") ||
    (active && active.tagName === "INPUT" && (active as HTMLInputElement).type === "number")
  ) {
    e.preventDefault();
  }
};

// Global non-passive wheel listener on window/document handles number inputs directly
document.addEventListener("wheel", blockNumberWheel, { passive: false, capture: true });


app.use(PulsePlugin);

// Bootstrap's JS is only used through data attributes (data-bs-toggle), which
// rely on document-level event delegation. Loading the bundle as a separate
// chunk shortly after mount keeps it out of the critical entry bundle without
// disabling dropdowns/collapses.
const loadBootstrapJs = () => {
  import("bootstrap/dist/js/bootstrap.bundle.min.js").catch(() => {});
};

if (typeof window !== "undefined") {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") {
    w.requestIdleCallback(loadBootstrapJs, { timeout: 2000 });
  } else {
    window.setTimeout(loadBootstrapJs, 300);
  }
}

app.mount("#app");
