import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  TECH: 'tech', // SOC / NOC profesional: verde/ámbar fosforescente, alto contraste
  WARM: 'warm', // Acogedor: base beige, fondos cálidos, acentos rojo terracota y coral
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('robotos_theme');
      if (
        saved &&
        (saved === THEMES.DARK ||
          saved === THEMES.LIGHT ||
          saved === THEMES.TECH ||
          saved === THEMES.WARM)
      ) {
        return saved;
      }
    } catch (e) {
      // fallback
    }
    return THEMES.DARK;
  });

  useEffect(() => {
    try {
      localStorage.setItem('robotos_theme', theme);
    } catch (e) {}

    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light', 'theme-tech', 'theme-warm');
    root.classList.add(`theme-${theme}`);
    if (theme === THEMES.LIGHT || theme === THEMES.WARM) {
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
    }
  }, [theme]);

  const changeTheme = (newTheme) => {
    if (
      newTheme === THEMES.DARK ||
      newTheme === THEMES.LIGHT ||
      newTheme === THEMES.TECH ||
      newTheme === THEMES.WARM
    ) {
      setTheme(newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme: changeTheme, THEMES }}>
      <div
        className={`theme-${theme} w-full min-h-screen transition-colors duration-300 ${
          theme === THEMES.WARM
            ? 'bg-[#FAF7F2] text-[#2C231D]'
            : theme === THEMES.LIGHT
            ? 'bg-slate-100 text-slate-900'
            : theme === THEMES.TECH
            ? 'bg-[#050c0a] text-emerald-400 font-mono tracking-tight'
            : 'bg-slate-950 text-slate-100'
        }`}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
