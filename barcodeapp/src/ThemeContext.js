// barcode/barcodeapp/src/ThemeContext.js
import React, { createContext, useState, useMemo } from 'react';

export const LightTheme = {
  colors: {
    background: '#F5F5F5',
    text: '#1A1A1A',
    primary: '#0288D1',
    accent: '#FF5722',
    surface: '#FFFFFF',
    error: '#D32F2F',
    cardShadow: 'rgba(0, 0, 0, 0.1)',
  },
};

export const DarkModeTheme = {
  colors: {
    background: '#212121',
    text: '#F5F5F5',
    primary: '#4FC3F7',
    accent: '#FF8A65',
    surface: '#424242',
    error: '#EF5350',
    cardShadow: 'rgba(255, 255, 255, 0.1)',
  },
};

export const ThemeContext = createContext({
  isDarkMode: false,
  toggleTheme: () => {},
  theme: LightTheme,
});

export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleTheme = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  const theme = useMemo(() => (isDarkMode ? DarkModeTheme : LightTheme), [isDarkMode]);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
      {children}
    </ThemeContext.Provider>
  );
};