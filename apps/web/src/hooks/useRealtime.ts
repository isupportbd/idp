import { useEffect, useRef } from 'react';

type SSEEvent = {
  type: string;
  clientId?: number;
};

export function useRealtime(onDataChanged: (event: SSEEvent) => void) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const callbackRef = useRef(onDataChanged);

  useEffect(() => {
    callbackRef.current = onDataChanged;
  }, [onDataChanged]);

  useEffect(() => {
    // Only connect if we have a token (authenticated)
    const token = localStorage.getItem('token');
    if (!token) return;

    // Connect to the SSE endpoint
    const url = import.meta.env.VITE_API_URL + '/api/stream';
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener('data_changed', (e) => {
      try {
        const data = JSON.parse(e.data) as SSEEvent;
        console.log('[SSE] Received event:', data);
        callbackRef.current(data);
      } catch (err) {
        console.error('Failed to parse SSE data', err);
      }
    });

    es.addEventListener('ping', () => {
      // Keep-alive ping, do nothing
    });

    es.onerror = () => {
      console.error('SSE connection error, it will reconnect automatically');
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);
}
