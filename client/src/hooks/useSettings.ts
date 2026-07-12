import { useCallback, useEffect, useState } from 'react';
import type { GameSettings } from '../types/domain';

const STORAGE_KEY = 'ashes.settings.v1';

export const DEFAULT_SETTINGS: GameSettings = {
  version: 1,
  musicVolume: 0.32,
  effectsVolume: 0.7,
  muted: false,
  quality: 'high',
  showFps: false,
};

function readSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const value = JSON.parse(raw) as Partial<GameSettings>;
    if (value.version !== 1) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...value,
      musicVolume: Math.max(0, Math.min(1, Number(value.musicVolume ?? DEFAULT_SETTINGS.musicVolume))),
      effectsVolume: Math.max(0, Math.min(1, Number(value.effectsVolume ?? DEFAULT_SETTINGS.effectsVolume))),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<GameSettings>(readSettings);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<Omit<GameSettings, 'version'>>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const resetSettings = useCallback(() => setSettings(DEFAULT_SETTINGS), []);

  return { settings, updateSettings, resetSettings };
}
