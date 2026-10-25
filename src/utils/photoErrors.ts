import type en from '../i18n/en';
import { MAX_SOURCE_SIZE_MB, PhotoError, PhotoErrorCode } from '../services/photoStorage';

type Translation = typeof en;

export function photoErrorCodeMessage(code: PhotoErrorCode, t: Translation): string {
  return (t.photos[code] as string).replace('{max}', String(MAX_SOURCE_SIZE_MB));
}

/** Turns any thrown error from photoStorage into a friendly localized message. */
export function photoErrorMessage(error: unknown, t: Translation): string {
  if (error instanceof PhotoError) {
    return photoErrorCodeMessage(error.code, t);
  }
  return photoErrorCodeMessage('saveFailed', t);
}
