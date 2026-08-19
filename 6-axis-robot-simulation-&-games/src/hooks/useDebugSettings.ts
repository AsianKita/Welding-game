import { useState, useEffect, useCallback } from 'react';

const DEBUG_STORAGE_KEY = 'robot_global_debug_settings';

export interface GlobalDebugSettings {
  // Window & Layout
  debugWindowWidth?: number;
  debugWindowOpacity?: number;
  activeTab?: string;
  useDialMode?: boolean;
  isOpen?: boolean;

  // Thermal & Scaling
  coolingDurationSec?: number;
  scaleMultiplier?: number;
  heightMultiplier?: number;
  widthMultiplier?: number;
  colorMode?: string;
  colorHex?: string;
  wireframe?: boolean;
  selectedColorIndex?: number;

  // Calibration Multipliers & Active Profile
  activeProfileId?: string;
  customProfiles?: Record<string, any>;
  calibrationTolerance?: number;

  // Bottom dock layout
  bottomDockMode?: 'floating' | 'full' | 'minimized';
  bottomDockWidth?: number;
  bottomHeightMode?: 'compact' | 'studio';

  // Complete RoboDK Settings state snapshot
  settings?: any;
  weldSettings?: any;

  // Arbitrary additional settings
  [key: string]: any;

  // Last saved timestamp
  savedAt?: string;
}

export function useDebugSettings() {
  const saveAllSettings = useCallback((currentState: GlobalDebugSettings) => {
    try {
      const payload: GlobalDebugSettings = {
        ...currentState,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(payload));
      console.log('💾 Global debug settings saved to localStorage', payload);
      return true;
    } catch (e) {
      console.error('Failed to save global debug settings', e);
      return false;
    }
  }, []);

  const loadAllSettings = useCallback((): GlobalDebugSettings | null => {
    try {
      const saved = localStorage.getItem(DEBUG_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as GlobalDebugSettings;
        }
      }
    } catch (e) {
      console.error('Failed to parse global debug settings', e);
    }
    return null;
  }, []);

  const clearAllSettings = useCallback(() => {
    try {
      localStorage.removeItem(DEBUG_STORAGE_KEY);
      console.log('🗑️ Global debug settings cleared. Refresh to apply defaults.');
      return true;
    } catch (e) {
      console.error('Failed to clear global debug settings', e);
      return false;
    }
  }, []);

  return { saveAllSettings, loadAllSettings, clearAllSettings };
}
