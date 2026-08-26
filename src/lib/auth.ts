/** Access keys that unlock the app (client-side gate). */
export const ACCESS_KEYS = ["0616", "0701", "1116"] as const;

const AUTH_STORAGE_KEY = "vocab.accessKey";

export function isValidAccessKey(raw: string): boolean {
  const key = raw.trim();
  return (ACCESS_KEYS as readonly string[]).includes(key);
}

export function getStoredAccessKey(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw && isValidAccessKey(raw)) return raw.trim();
  } catch {
    // private mode / disabled storage
  }
  return null;
}

export function isAuthenticated(): boolean {
  return getStoredAccessKey() != null;
}

export function loginWithKey(raw: string): boolean {
  const key = raw.trim();
  if (!isValidAccessKey(key)) return false;
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, key);
  } catch {
    // still treat as logged in for this session if storage fails
  }
  return true;
}

export function logout(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
}
