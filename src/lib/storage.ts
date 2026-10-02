import type { AppState } from '../types';

export const STORAGE_KEY = 'hakka-field-assistant:v1';

export const defaultState: AppState = {
  projects: [],
  speakers: [],
  items: [],
  recordings: [],
  aiSuggestions: [],
};

export const loadAppState = (): AppState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(raw) as AppState;
    return {
      projects: parsed.projects ?? [],
      speakers: parsed.speakers ?? [],
      items: parsed.items ?? [],
      recordings: parsed.recordings ?? [],
      aiSuggestions: parsed.aiSuggestions ?? [],
    };
  } catch {
    return defaultState;
  }
};

export const persistAppState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};
