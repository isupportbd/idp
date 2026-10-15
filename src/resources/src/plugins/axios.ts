import axios, { type AxiosResponse, type AxiosError, type InternalAxiosRequestConfig } from "axios";

if (import.meta.env.VITE_API_URL) {
  axios.defaults.baseURL = import.meta.env.VITE_API_URL;
}

axios.defaults.withCredentials = true;
axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
axios.defaults.headers.common.Accept = "application/json";

const ACCESS_TOKEN_KEY = "idp_access_token";
const REFRESH_TOKEN_KEY = "idp_refresh_token";
const AUTH_USER_KEY = "idp_auth_user";

const REFRESH_URL = "/api/auth/refresh-token";

// Attach Bearer token from localStorage to every outgoing API request
axios.interceptors.request.use((config) => {
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {}
  return config;
});

const isAuthPage = () =>
  window.location.pathname === "/register" ||
  window.location.pathname === "/login" ||
  window.location.pathname === "/landing" ||
  window.location.pathname === "/forgot-password" ||
  window.location.pathname === "/forget-password" ||
  window.location.pathname === "/reset-password" ||
  window.location.pathname === "/verify-email";

/**
 * Why: Exchange the stored refresh token for a new access token. The refresh
 *      token was previously persisted but never used, so any access-token
 *      expiry caused a silent logout and a hard reload.
 * How: Single-flight — concurrent 401s share one refresh request so we never
 *      overwrite the rotated refresh token twice (which would revoke the
 *      session).
 */
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  let refreshToken: string | null = null;
  try {
    refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {}
  if (!refreshToken) return null;

  try {
    const response = await axios.post(
      REFRESH_URL,
      { refresh_token: refreshToken },
      { headers: { Authorization: undefined } } as InternalAxiosRequestConfig
    );
    const data = response.data?.data;
    if (!data?.access_token) return null;

    try {
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      if (data.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      if (data.user) localStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    } catch {}

    return data.access_token as string;
  } catch {
    return null;
  }
}

function clearStoredAuth() {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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
    const originalConfig = error?.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const configUrl: string = originalConfig?.url || "";

    const onAuthPage = isAuthPage();
    const isRefreshCall = configUrl.includes(REFRESH_URL);
    const isBootstrapCall = configUrl.includes("/api/auth/me");

    // Attempt a single silent refresh on an expired access token. This covers
    // authenticated pages AND the bootstrap /me call (so a reload with an
    // expired access token restores the session instead of logging the user out).
    if (
      status === 401 &&
      originalConfig &&
      !originalConfig._retry &&
      !onAuthPage &&
      !isRefreshCall
    ) {
      originalConfig._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;

      if (newToken) {
        originalConfig.headers = originalConfig.headers || {};
        originalConfig.headers.Authorization = `Bearer ${newToken}`;
        return axios.request(originalConfig);
      }
    }

    // Only a genuine 401 (not a 403 authorization failure) ends the session.
    // The old code also logged the user out on any 403 whose message contained
    // "inactive", which is fragile string matching against server copy.
    const shouldRedirect = !onAuthPage && !isBootstrapCall && !isRefreshCall && status === 401;

    if (shouldRedirect) {
      clearStoredAuth();
      redirectToLogin();
    }

    return Promise.reject(error);
  }
);

export default axios;
