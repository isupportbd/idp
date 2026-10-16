import axios, { type AxiosResponse, type AxiosError } from "axios";

if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

// Auth is COOKIE-based. The API issues httpOnly, signed access + refresh
// cookies (see src/framework/support/cookie.ts), and the server transparently
// mints a new access cookie from the refresh cookie when the access cookie has
// expired (see src/middlewares/auth-middleware.ts). Nothing secret is therefore
// stored in JS-accessible storage — an XSS payload can no longer read or exfiltrate
// a long-lived refresh token.
axios.defaults.withCredentials = true;
axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
axios.defaults.headers.common.Accept = "application/json";

const AUTH_USER_KEY = "idp_auth_user";

const isAuthPage = () =>
  window.location.pathname === "/register" ||
  window.location.pathname === "/login" ||
  window.location.pathname === "/landing" ||
  window.location.pathname === "/forgot-password" ||
  window.location.pathname === "/forget-password" ||
  window.location.pathname === "/reset-password" ||
  window.location.pathname === "/verify-email";

function clearStoredAuth() {
  // Only the (non-secret) cached profile is kept client-side; drop it so a
  // stale identity is never hydrated after the session ends.
  try {
    localStorage.removeItem(AUTH_USER_KEY);
  } catch {}
}

function redirectToLogin() {
  const redirect = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
  window.location.href = `/login?redirect=${redirect}`;
}

axios.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const status = error?.response?.status;
    const configUrl: string = error?.config?.url || "";

    const onAuthPage = isAuthPage();
    const isBootstrapCall = configUrl.includes("/api/auth/me");

    // The server already auto-refreshes from the refresh cookie, so a genuine
    // 401 (not a 403 authorization failure) means the whole session is gone.
    // End it client-side instead of attempting a client-token refresh.
    const shouldRedirect = !onAuthPage && !isBootstrapCall && status === 401;

    if (shouldRedirect) {
      clearStoredAuth();
      redirectToLogin();
    }

    return Promise.reject(error);
  }
);

export default axios;
