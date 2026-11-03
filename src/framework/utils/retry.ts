/**
 * Reusable retry utility with exponential backoff and jitter.
 * Designed for external gateways (SMS, MFS, notifications).
 */

export interface RetryOptions {
  attempts?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (error: any, attempt: number) => void;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    minDelayMs = 200,
    maxDelayMs = 2000,
    jitter = true,
    onRetry
  } = options;

  let lastError: any;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      if (attempt === attempts) {
        break;
      }

      if (onRetry) {
        try {
          onRetry(err, attempt);
        } catch {}
      }

      // Exponential backoff: minDelayMs * 2^(attempt - 1)
      let delay = Math.min(minDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

      if (jitter) {
        // Add random jitter between 0.5x and 1.5x of calculated delay
        const jitterFactor = 0.5 + Math.random();
        delay = Math.round(delay * jitterFactor);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
