import React, { createContext, useContext, useState, useEffect } from "react";
import { Appearance } from "react-native";
import {
  themes,
  THEME_MODES,
  getStoredThemeMode,
  saveThemeMode,
  applyThemeMode,
} from "../theme";

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
  const [themeMode, setThemeMode] = useState(THEME_MODES.SYSTEM);
  const [resolvedColorScheme, setResolvedColorScheme] = useState(
    Appearance.getColorScheme() || "dark",
  );

  useEffect(() => {
    // Initial load
    const loadTheme = async () => {
      const stored = await getStoredThemeMode();
      setThemeMode(stored);

      if (stored !== THEME_MODES.SYSTEM) {
        applyThemeMode(stored);
      }
    };
    loadTheme();

    // Listen for appearance changes (important when mode is 'system')
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setResolvedColorScheme(colorScheme || "dark");
    });

    return () => subscription.remove();
  }, []);

  // Sync resolved scheme when themeMode changes
  useEffect(() => {
    if (themeMode === THEME_MODES.SYSTEM) {
      setResolvedColorScheme(Appearance.getColorScheme() || "dark");
    } else {
      setResolvedColorScheme(themeMode);
    }
  }, [themeMode]);

  const updateThemeMode = async (mode) => {
    setThemeMode(mode);
    await saveThemeMode(mode);
    applyThemeMode(mode);
  };

  const colors = themes[resolvedColorScheme] || themes.dark;

  const value = {
    themeMode,
    resolvedColorScheme,
    colors,
    updateThemeMode,
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};
