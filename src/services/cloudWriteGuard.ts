export const OFFLINE_CLOUD_WRITE_CODE = 'OFFLINE_CLOUD_WRITE';

export class OfflineCloudWriteError extends Error {
  readonly code = OFFLINE_CLOUD_WRITE_CODE;

  constructor(operation: string) {
    super(
      `Cannot ${operation} while offline. Cloud data is read-only until the connection is restored.`,
    );
    this.name = 'OfflineCloudWriteError';
  }
}

export function isOfflineCloudWriteError(value: unknown): value is OfflineCloudWriteError {
  if (value instanceof OfflineCloudWriteError) return true;
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: string }).code === OFFLINE_CLOUD_WRITE_CODE
  );
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function isReadMethod(name: string): boolean {
  return name.startsWith('get') || name.startsWith('list');
}

/**
 * Wraps a Supabase adapter so that writes fail fast while the browser is
 * offline, instead of hanging on a network request. Reads are always allowed:
 * the hooks fall back to the last synced cloud cache when they fail.
 */
export function guardCloudWrites<T extends object>(adapter: T): T {
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);

      if (typeof value !== 'function' || typeof prop !== 'string') {
        return value;
      }

      if (isReadMethod(prop)) {
        return value.bind(target);
      }

      return (...args: unknown[]) => {
        if (!isOnline()) {
          return Promise.reject(new OfflineCloudWriteError(prop));
        }
        return value.apply(target, args);
      };
    },
  });
}
