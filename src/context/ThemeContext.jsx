import React, { createContext, useContext, useEffect, useState } from 'react';
import { dataService } from '../services/data';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Initialize from dataService (synchronous local read) or fallback to 'system'
    const [theme, setThemeState] = useState(() => {
        const settings = dataService.getSettings();
        return settings.theme || 'system';
    });

    const setTheme = (newTheme) => {
        setThemeState(newTheme);
        dataService.updateSettings({ theme: newTheme });
    };

    useEffect(() => {
        const applyTheme = (currentTheme) => {
            const root = document.documentElement;
            root.classList.remove('light', 'dark');

            let effectiveTheme = currentTheme;
            if (currentTheme === 'system') {
                effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            root.classList.add(effectiveTheme);
        };

        applyTheme(theme);

        // Listener for system changes
        if (theme === 'system') {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            const handleChange = () => applyTheme('system');
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }
    }, [theme]);

    // Listener for DataSync (External Updates)
    useEffect(() => {
        const handleStorageUpdate = () => {
            const settings = dataService.getSettings();
            if (settings.theme && settings.theme !== theme) {
                setThemeState(settings.theme);
            }
        };
        window.addEventListener('storage-update', handleStorageUpdate);
        return () => window.removeEventListener('storage-update', handleStorageUpdate);
    }, [theme]);

    return (
        <ThemeContext.Provider value={{ theme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    return useContext(ThemeContext);
};
