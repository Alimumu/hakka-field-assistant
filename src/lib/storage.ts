import type { AppState } from '../types';

export const STORAGE_KEY = 'hakka-field-assistant:v1';

export const defaultState: AppState = {
  projects: [],
  speakers: [],
  items: [],
  recordings: [],
  aiSuggestions: [],
};

const sanitizeState = (parsed: Partial<AppState>): AppState => ({
  projects: Array.isArray(parsed.projects) ? parsed.projects : [],
  speakers: Array.isArray(parsed.speakers) ? parsed.speakers : [],
  items: Array.isArray(parsed.items) ? parsed.items : [],
  recordings: Array.isArray(parsed.recordings) ? parsed.recordings : [],
  aiSuggestions: Array.isArray(parsed.aiSuggestions) ? parsed.aiSuggestions : [],
});

export const loadAppState = (): AppState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return sanitizeState(parsed);
  } catch {
    return defaultState;
  }
};

export const persistAppState = (state: AppState): { ok: true } | { ok: false; message: string } => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知存储错误';
    return { ok: false, message };
  }
};

export const clearAppState = () => {
  localStorage.removeItem(STORAGE_KEY);
};
