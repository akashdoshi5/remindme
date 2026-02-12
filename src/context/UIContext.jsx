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

    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [noteModalConfig, setNoteModalConfig] = useState(null); // { noteToEdit, type, autoStart }

    const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
    const [reminderModalConfig, setReminderModalConfig] = useState(null); // { reminderToEdit, ... }

    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareModalConfig, setShareModalConfig] = useState(null); // { note: ... }

    const openNoteModal = (config = {}) => {
        setNoteModalConfig(config);
        setIsNoteModalOpen(true);
    };
    const closeNoteModal = () => {
        setIsNoteModalOpen(false);
        setNoteModalConfig(null);
    };

    const openReminderModal = (config = {}) => {
        setReminderModalConfig(config);
        setIsReminderModalOpen(true);
    };
    const closeReminderModal = () => {
        setIsReminderModalOpen(false);
        setReminderModalConfig(null);
    };

    const openShareModal = (note) => {
        setShareModalConfig({ note });
        setIsShareModalOpen(true);
    };
    const closeShareModal = () => {
        setIsShareModalOpen(false);
        setShareModalConfig(null);
    };

    const value = {
        isSearchOpen, openSearch, closeSearch,
        isSettingsOpen, openSettings, closeSettings,
        isMobileMenuOpen, openMobileMenu, closeMobileMenu, toggleMobileMenu,
        searchQuery, setSearchQuery,
        isNoteModalOpen, noteModalConfig, openNoteModal, closeNoteModal,
        isReminderModalOpen, reminderModalConfig, openReminderModal, closeReminderModal,
        isShareModalOpen, shareModalConfig, openShareModal, closeShareModal,
    };

    return (
        <UIContext.Provider value={value}>
            {children}
        </UIContext.Provider>
    );
};
