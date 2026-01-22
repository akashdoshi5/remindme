import React, { createContext, useContext, useState } from 'react';

const UIContext = createContext();

export const useUI = () => {
    return useContext(UIContext);
};

export const UIProvider = ({ children }) => {
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const openSearch = () => setIsSearchOpen(true);
    const closeSearch = () => setIsSearchOpen(false);

    const openSettings = () => setIsSettingsOpen(true);
    const closeSettings = () => setIsSettingsOpen(false);

    const openMobileMenu = () => setIsMobileMenuOpen(true);
    const closeMobileMenu = () => setIsMobileMenuOpen(false);
    const toggleMobileMenu = () => setIsMobileMenuOpen(prev => !prev);

    const value = {
        isSearchOpen, openSearch, closeSearch,
        isSettingsOpen, openSettings, closeSettings,
        isMobileMenuOpen, openMobileMenu, closeMobileMenu, toggleMobileMenu,
        searchQuery, setSearchQuery
    };

    return (
        <UIContext.Provider value={value}>
            {children}
        </UIContext.Provider>
    );
};
