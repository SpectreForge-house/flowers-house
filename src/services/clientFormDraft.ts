/**
 * Draft of the "Add client" text fields, kept in memory and in sessionStorage
 * so an accidental close of the dialog (navigation, wrong click, restart of
 * the form) never loses what was typed. Only text is stored - photos are
 * deliberately excluded, they must not reach disk before the client is saved.
 */
export interface ClientFormDraft {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  preferences: string;
}

const STORAGE_KEY = 'flower-shop-client-draft';

// In-memory copy: survives even when sessionStorage is unavailable
// (private browsing, storage disabled).
let memoryDraft: ClientFormDraft | null = null;

function normalize(draft: Partial<ClientFormDraft>): ClientFormDraft {
  return {
    name: draft.name || '',
    phone: draft.phone || '',
    email: draft.email || '',
    address: draft.address || '',
    notes: draft.notes || '',
    preferences: draft.preferences || '',
  };
}

export function isDraftEmpty(draft: ClientFormDraft): boolean {
  return Object.values(draft).every((value) => !value.trim());
}

export function readClientDraft(): ClientFormDraft | null {
  if (memoryDraft) return { ...memoryDraft };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      memoryDraft = normalize(JSON.parse(raw) as Partial<ClientFormDraft>);
      return { ...memoryDraft };
    }
  } catch (err) {
    console.error('[clientFormDraft] Failed to read the draft:', err);
  }
  return null;
}

export function saveClientDraft(draft: ClientFormDraft): void {
  // A draft with nothing typed in is not worth keeping - the form starts
  // blank anyway, so drop whatever was stored before.
  if (isDraftEmpty(draft)) {
    clearClientDraft();
    return;
  }
  memoryDraft = { ...draft };
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch (err) {
    console.error('[clientFormDraft] Failed to save the draft:', err);
  }
}

/** Called after a successful save or a confirmed "Discard". */
export function clearClientDraft(): void {
  memoryDraft = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('[clientFormDraft] Failed to clear the draft:', err);
  }
}
