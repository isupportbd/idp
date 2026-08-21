import { hc } from 'hono/client';
import type { AppType } from '../../../api/src/index'; // Import backend types

// The base URL of your API
const API_URL = import.meta.env.VITE_API_URL || '';
export const apiClient: any = hc<AppType>(API_URL, {
  fetch: (input: RequestInfo | URL, requestInit?: RequestInit) => {
    const token = localStorage.getItem('token');
    requestInit = requestInit || {};
    
    // Create a new Headers object to properly merge headers
    const headers = new Headers(requestInit.headers);
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    requestInit.headers = headers;

    return fetch(input, requestInit);
  }
});
