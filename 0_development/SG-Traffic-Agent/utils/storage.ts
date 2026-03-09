import { UserPreferences } from '../types';
import { AVAILABLE_MODELS, DEFAULT_PREFERENCES } from '../constants';

const KEYS = {
  WATCHLIST: 'sg_traffic_agent_watchlist',
  PREFERENCES: 'sg_traffic_agent_prefs',
};

export const Storage = {
  getWatchlist: (): string[] => {
    try {
      const stored = localStorage.getItem(KEYS.WATCHLIST);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Failed to parse watchlist', e);
      return [];
    }
  },

  setWatchlist: (ids: string[]) => {
    localStorage.setItem(KEYS.WATCHLIST, JSON.stringify(ids));
  },

  getPreferences: (): UserPreferences => {
    try {
      const stored = localStorage.getItem(KEYS.PREFERENCES);
      const merged = stored ? { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) } : DEFAULT_PREFERENCES;
      const hasValidModel = AVAILABLE_MODELS.some(model => model.id === merged.modelId);
      return hasValidModel ? merged : DEFAULT_PREFERENCES;
    } catch (e) {
      return DEFAULT_PREFERENCES;
    }
  },

  setPreferences: (prefs: UserPreferences) => {
    localStorage.setItem(KEYS.PREFERENCES, JSON.stringify(prefs));
  },
};
