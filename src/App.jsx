import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Home, Bell, FileText, Users, Mic, Search, Activity, Settings } from 'lucide-react';
import { useNotifications } from './hooks/useNotifications';
import { dataService } from './services/data';
import { useLanguage, LanguageProvider } from './context/LanguageContext';
import SearchModal from './components/common/SearchModal';
import AlarmModal from './components/reminders/AlarmModal';
import SettingsModal from './components/settings/SettingsModal';
import { firestoreService } from './services/firestoreService';
import { useDataSync } from './hooks/useDataSync';

// Pages
import HomePage from './pages/HomePage';
import RemindersPage from './pages/RemindersPage';
import NotesPage from './pages/NotesPage';
import CaregiversPage from './pages/CaregiversPage';
import ReportsPage from './pages/ReportsPage';

const NavLink = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all duration-300 font-medium ${isActive
        ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25 scale-105'
        : 'text-gray-600 hover:bg-gray-100/80 hover:text-gray-900'
        }`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );
};

const Header = ({ searchQuery, setSearchQuery }) => {
  const { language, setLanguage, t } = useLanguage();
  const { user } = useAuth();
  const { openSearch, openSettings } = useUI();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 sticky top-0 z-50 dark:bg-gray-900/80 dark:border-gray-800 transition-colors duration-300">
      <div className="w-full px-4 h-16 md:h-20 flex items-center justify-between mx-auto max-w-7xl gap-4">

        {/* LEFT: Logo & Brand */}
        <Link to="/" className="flex items-center gap-2 md:gap-3 group shrink-0 min-w-fit">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-gradient-to-tr from-green-400 to-emerald-600 flex items-center justify-center text-white shadow-md shadow-green-500/20 transition-transform group-hover:scale-110 duration-300 shrink-0">
            <span className="text-lg md:text-xl">🔔</span>
          </div>
          <span className="hidden md:block text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-700 dark:from-white dark:to-gray-300">
            {t('appTitle')}
          </span>
        </Link>

        {/* CENTER: Navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 bg-gray-50/50 dark:bg-gray-800/50 p-1 rounded-full border border-gray-100 dark:border-gray-700 shrink-0">
          <NavLink to="/" icon={Home} label={language === 'en' ? 'Home' : 'Home'} />
          <NavLink to="/reminders" icon={Bell} label={language === 'en' ? 'Reminders' : t('activeReminders').split(' ')[1]} />
          <NavLink to="/notes" icon={FileText} label={language === 'en' ? 'Notes' : t('myNotes').split(' ')[1]} />
        </nav>

        {/* RIGHT: Search & Management */}
        <div className="flex items-center gap-2 md:gap-4 flex-1 justify-end min-w-0">
          {/* Expanded Search Bar (Desktop) */}
          <div className="hidden md:flex relative max-w-xs w-full group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 peer-focus:text-orange-500 transition-colors" size={16} />
            <input
              type="text"
              placeholder="Search anything..."
              className="w-full pl-9 pr-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border-none text-sm font-medium focus:ring-2 focus:ring-orange-500/20 focus:bg-white dark:focus:bg-gray-700 transition-all outline-none text-gray-700 dark:text-gray-200 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700/80 focus:cursor-text"
              onClick={openSearch}
              readOnly // Using modal for now, but design mimics input
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
              <button onClick={openSearch} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-gray-400 hover:text-orange-500 transition-colors">
                <Mic size={14} />
              </button>
              <div className="hidden lg:flex items-center justify-center w-5 h-5 rounded border border-gray-300 dark:border-gray-600 text-[10px] text-gray-400 font-mono">⌘K</div>
            </div>
          </div>

          {/* Search Icon (Mobile - Enhanced Visibility) */}
          {location.pathname !== '/' && (
            <button
              onClick={openSearch}
              className="md:hidden w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-95"
              aria-label="Search"
            >
              <Search size={20} />
            </button>
          )}


          {/* Management Links (Desktop Only) */}
          <div className="hidden lg:flex items-center gap-1 border-l border-gray-200 dark:border-gray-700 pl-4">
            <Link to="/reports" className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-full transition-colors" title="Reports">
              <Activity size={20} className={isActive('/reports') ? 'text-green-600 fill-current' : ''} />
            </Link>
            <Link to="/caregivers" className="p-2 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded-full transition-colors" title="Caregivers">
              <Users size={20} className={isActive('/caregivers') ? 'text-purple-600 fill-current' : ''} />
            </Link>
          </div>

          {/* Settings / Profile */}
          <button onClick={openSettings} className="w-10 h-10 md:w-10 md:h-10 rounded-full border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:hover:bg-gray-800 transition-all shadow-sm overflow-hidden" title="Settings">
            {user?.photoURL ? (
              <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold text-sm">
                {user?.displayName ? user.displayName.charAt(0).toUpperCase() : (user?.email?.charAt(0).toUpperCase() || <Settings size={18} className="md:w-5 md:h-5" />)}
              </div>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-orange-50">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login but keep location state if needed (not implementing complex redirect back logic for now)
    return <LoginPage />;
  }

  return children;
};

const AppContent = () => {
  const { user } = useAuth();
  const { requestPermission, sendNotification, scheduleReminders, clearDelivered } = useNotifications();
  const {
    isSearchOpen, closeSearch, openSearch,
    isSettingsOpen, closeSettings, openSettings,
    isMobileMenuOpen, closeMobileMenu, openMobileMenu
  } = useUI();

  const [activeAlarm, setActiveAlarm] = useState(null);

  // Custom Hook handles all Data Synchronization
  useDataSync();

  // Request permission on load
  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const dismissedAlarmsRef = React.useRef(new Set());
  const activeAlarmRef = React.useRef(null);

  useEffect(() => {
    activeAlarmRef.current = activeAlarm;
  }, [activeAlarm]);

  // Schedule Reminders (Native) & In-App Alarm Check (Web/Foreground)
  useEffect(() => {
    const syncReminders = () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const reminders = dataService.getRemindersForDate(todayStr);
      // Schedule for Native (Background support)
      scheduleReminders(reminders);
    };

    // Initial Sync
    syncReminders();

    const handleStorageUpdate = () => {
      syncReminders();
    };

    window.addEventListener('storage-update', handleStorageUpdate);

    // In-App Polling (Only for Modal when App is Open)
    const interval = setInterval(() => {
      const now = new Date();
      const currentTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
      const todayStr = new Date().toISOString().split('T')[0];
      const reminders = dataService.getRemindersForDate(todayStr);

      reminders.forEach(reminder => {
        if (reminder.displayTime === currentTime && (reminder.status === 'upcoming' || reminder.status === 'snoozed')) {
          if (dismissedAlarmsRef.current.has(reminder.uniqueId)) return;
          if (activeAlarmRef.current && activeAlarmRef.current.uniqueId === reminder.uniqueId) return;

          setActiveAlarm(reminder); // Show In-App Modal
          // Note: We do NOT call sendNotification here for Native anymore, relying on scheduleReminders.
          // For Web, we could call it, but focusing on Android fix.
        }
      });
    }, 10000); // Check every 10s

    return () => {
      window.removeEventListener('storage-update', handleStorageUpdate);
      clearInterval(interval);
    };
  }, [scheduleReminders]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openSearch]);

  // Handle SW Actions
  useEffect(() => {
    const handleAction = (e) => {
      const { action, tag } = e.detail;
      console.log("Notification Action:", action, tag);

      let id = tag;
      let instanceKey = null;
      if (tag && tag.includes('_')) {
        const parts = tag.split('_');
        id = parts[0];
        instanceKey = parts.slice(1).join('_');
      }

      dismissedAlarmsRef.current.add(tag);

      if (action === 'snooze') {
        dataService.snoozeReminder(Number(id), instanceKey, 15);
      } else if (action === 'done') {
        dataService.completeReminder(Number(id), instanceKey);
      }

      if (activeAlarmRef.current && activeAlarmRef.current.uniqueId == tag) {
        setActiveAlarm(null);
      }

      window.dispatchEvent(new Event('storage-update'));
    };

    window.addEventListener('notification-action', handleAction);

    // Handle Service Worker Messages (Web)
    const handleSWMessage = (event) => {
      if (event.data && (event.data.action === 'snooze' || event.data.action === 'done')) {
        // Dispatch as custom event to reuse the same logic
        window.dispatchEvent(new CustomEvent('notification-action', { detail: event.data }));
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    return () => {
      window.removeEventListener('notification-action', handleAction);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  }, []);

  // Sync / Reactive UI: Listen for external data changes (e.g. phone snoozed the alarm)
  useEffect(() => {
    const handleStorageUpdate = () => {
      if (!activeAlarmRef.current) return;

      const currentAlarm = activeAlarmRef.current;
      const todayStr = new Date().toISOString().split('T')[0];
      const reminders = dataService.getRemindersForDate(todayStr);

      const freshInstance = reminders.find(r => r.uniqueId === currentAlarm.uniqueId);

      if (freshInstance) {
        if (freshInstance.status !== 'upcoming' && freshInstance.status !== 'snoozed') {
          setActiveAlarm(null);
        } else if (freshInstance.status === 'snoozed' || freshInstance.status === 'taken' || freshInstance.status === 'done') {
          setActiveAlarm(null);
        }
      } else {
        setActiveAlarm(null);
      }
    };

    window.addEventListener('storage-update', handleStorageUpdate);
    return () => window.removeEventListener('storage-update', handleStorageUpdate);
  }, []);

  const handleVoiceSearch = () => {
    openSearch();
    // Pass auto-listen logic if needed via context or props to SearchModal
  };

  if (!user) {
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans bg-gray-50/50 dark:bg-gray-950 transition-colors duration-300">
      <Header
        onSearchClick={openSearch}
        onVoiceClick={handleVoiceSearch}
        onSettingsClick={openSettings}
      />
      <main className="flex-1 container py-6 md:py-10 pb-24 md:pb-10">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/notes" element={<NotesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/caregivers" element={<CaregiversPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </main>
      <MobileNav onMenuClick={openMobileMenu} />
      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={closeMobileMenu}
        onSettingsClick={openSettings}
      />
      <SearchModal
        isOpen={isSearchOpen}
        onClose={closeSearch}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={closeSettings}
      />
      <AlarmModal
        reminder={activeAlarm}
        isSilent={() => {
          const settings = dataService.getSettings();
          if (!settings || !settings.sleepStart || !settings.sleepEnd) return false;

          const now = new Date();
          const currentMinutes = now.getHours() * 60 + now.getMinutes();

          const [startH, startM] = settings.sleepStart.split(':').map(Number);
          const startMinutes = startH * 60 + startM;

          const [endH, endM] = settings.sleepEnd.split(':').map(Number);
          const endMinutes = endH * 60 + endM;

          if (startMinutes > endMinutes) {
            return currentMinutes >= startMinutes || currentMinutes < endMinutes;
          } else {
            return currentMinutes >= startMinutes && currentMinutes < endMinutes;
          }
        }}
        onSnooze={(duration) => {
          if (activeAlarm) {
            const instanceId = activeAlarm.instanceKey || null;
            dataService.snoozeReminder(activeAlarm.id, instanceId, duration || 15);
            clearDelivered(activeAlarm.id); // Clear System Notification
            setActiveAlarm(null);
            window.dispatchEvent(new Event('storage-update'));
          }
        }}
        onDone={() => {
          if (activeAlarm) {
            const instanceId = activeAlarm.instanceKey || null;
            dataService.completeReminder(activeAlarm.id, instanceId);
            clearDelivered(activeAlarm.id); // Clear System Notification
            setActiveAlarm(null);
            window.dispatchEvent(new Event('storage-update'));
          }
        }}
        onClose={() => setActiveAlarm(null)}
      />
    </div>
  );
};

import { ThemeProvider } from './context/ThemeContext';
import MobileNav from './components/layout/MobileNav';
import MobileMenu from './components/layout/MobileMenu';
import { UIProvider, useUI } from './context/UIContext';

const App = () => {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ThemeProvider>
          <UIProvider>
            <Router>
              <AppContent />
            </Router>
          </UIProvider>
        </ThemeProvider>
      </AuthProvider>
    </LanguageProvider>
  );
};

export default App;
