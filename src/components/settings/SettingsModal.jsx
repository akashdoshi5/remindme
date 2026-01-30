import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Save, Smartphone, LogOut, User, Trash2, Bell, RefreshCw } from 'lucide-react';
import { dataService } from '../../services/data';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

const SettingsModal = ({ isOpen, onClose }) => {
    const { theme, setTheme } = useTheme();
    const { user, logout } = useAuth();

    if (!isOpen) return null;

    const [sleepStart, setSleepStart] = useState('22:00');
    const [sleepEnd, setSleepEnd] = useState('08:00');

    useEffect(() => {
        const current = dataService.getSettings();
        if (current) {
            setSleepStart(current.sleepStart || '22:00');
            setSleepEnd(current.sleepEnd || '08:00');
        }
    }, [isOpen]);

    const handleSave = () => {
        dataService.updateSettings({
            sleepStart,
            sleepEnd,
            theme // Ensure explicit save just in case, though context handles it.
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] md:p-4 animate-fade-in backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 w-full md:max-w-md flex flex-col h-full md:h-auto md:max-h-[85vh] shadow-2xl overflow-hidden transition-colors duration-300 md:rounded-2xl relative z-[100]">
                <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
                    <h2 className="text-xl font-bold dark:text-white">Settings</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={24} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 pb-32 md:pb-6 flex flex-col gap-6">
                    {/* User Profile Section */}
                    {user ? (
                        <div className="flex items-center gap-4 pb-6 border-b border-gray-100 dark:border-gray-800">
                            <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center overflow-hidden border-2 border-orange-200 dark:border-orange-800">
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt={user.displayName} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                                        {user.displayName ? user.displayName.charAt(0).toUpperCase() : user.email?.charAt(0).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-900 dark:text-white truncate">{user.displayName || 'User'}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                                <button
                                    onClick={() => {
                                        logout();
                                        onClose();
                                    }}
                                    className="text-xs text-red-500 hover:text-red-600 font-medium mt-1 flex items-center gap-1"
                                >
                                    <LogOut size={12} /> Sign Out
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-xl flex items-center justify-between mb-6 border border-orange-100 dark:border-orange-800/30">
                            <div>
                                <h3 className="font-bold text-gray-900 dark:text-white">Guest Mode</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Sign in to sync your data</p>
                            </div>
                            <button
                                onClick={() => { onClose(); window.location.href = '/login'; }}
                                className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg font-bold text-sm shadow-md shadow-orange-500/20 active:scale-95 transition-transform"
                            >
                                Log In
                            </button>
                        </div>
                    )}
                    {/* Theme Settings */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Appearance</h3>
                        <div className="bg-gray-100 dark:bg-gray-800 p-1 rounded-xl flex">
                            {[
                                { id: 'light', icon: Sun, label: 'Light' },
                                { id: 'dark', icon: Moon, label: 'Dark' },
                                { id: 'system', icon: Smartphone, label: 'Auto' },
                            ].map((option) => (
                                <button
                                    key={option.id}
                                    onClick={() => setTheme(option.id)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-all ${theme === option.id
                                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                        }`}
                                >
                                    <option.icon size={16} />
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Sleep Schedule */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Sleep Schedule</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Set your active hours. Water intervals will only schedule reminders during your wake window.</p>

                        <div className="space-y-4">
                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    <Sun size={16} className="text-orange-500" />
                                    Wake Up Time (6 AM - 9 AM)
                                </label>
                                <select
                                    value={sleepEnd}
                                    onChange={(e) => setSleepEnd(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-orange-500 transition-colors"
                                >
                                    <option value="06:00">6:00 AM</option>
                                    <option value="06:30">6:30 AM</option>
                                    <option value="07:00">7:00 AM</option>
                                    <option value="07:30">7:30 AM</option>
                                    <option value="08:00">8:00 AM</option>
                                    <option value="08:30">8:30 AM</option>
                                    <option value="09:00">9:00 AM</option>
                                </select>
                            </div>

                            <div>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    <Moon size={16} className="text-indigo-500" />
                                    Sleep Time (9 PM - 12 AM)
                                </label>
                                <select
                                    value={sleepStart}
                                    onChange={(e) => setSleepStart(e.target.value)}
                                    className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 transition-colors"
                                >
                                    <option value="21:00">9:00 PM</option>
                                    <option value="21:30">9:30 PM</option>
                                    <option value="22:00">10:00 PM</option>
                                    <option value="22:30">10:30 PM</option>
                                    <option value="23:00">11:00 PM</option>
                                    <option value="23:30">11:30 PM</option>
                                    <option value="00:00">12:00 AM</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Troubleshooting Section */}
                    <div>
                        <h3 className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">Troubleshooting</h3>
                        <div className="space-y-3">
                            {/* Test Notification */}
                            <button
                                onClick={async () => {
                                    alert("Scheduling test notification for 5 seconds from now. Please close the app immediately to test background delivery.");
                                    const { LocalNotifications } = await import('@capacitor/local-notifications');

                                    // FORCE Channel Creation V10
                                    await LocalNotifications.createChannel({
                                        id: 'reminders_v10',
                                        name: 'Reminders (V10)',
                                        description: 'Reminders',
                                        importance: 5,
                                        visibility: 1,
                                        vibration: true,
                                    });

                                    await LocalNotifications.schedule({
                                        notifications: [{
                                            title: 'Test Reminder',
                                            body: 'If you see this, notifications are working!',
                                            id: 999999,
                                            schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true },
                                            smallIcon: 'ic_notification_bell',
                                            channelId: 'reminders_v10',
                                            actionTypeId: 'REMINDER_ACTIONS_V10',
                                            extra: { uniqueId: 'test' }
                                        }]
                                    });
                                }}
                                className="w-full p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 font-medium text-sm flex items-center justify-center gap-2"
                            >
                                <Bell size={16} /> Test Notification (5s)
                            </button>

                            {/* Fix Background Issues */}
                            <button
                                onClick={async () => {
                                    alert("1. Go to App Info > Battery > Unrestricted.\n2. Go to App Info > Alarms & Reminders > Allow.\n3. Turn on Autostart (Xiaomi/Oppo).");
                                }}
                                className="w-full p-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-medium text-sm flex items-center justify-center gap-2"
                            >
                                <Smartphone size={16} /> Fix Background Issues
                            </button>

                            {/* Recovery */}
                            <button
                                onClick={async () => {
                                    if (window.confirm("Start scanning for lost files?")) {
                                        const { recoveryService } = await import('../../services/recoveryService');
                                        const result = await recoveryService.scanAndRecover(user ? user.uid : 'guest');
                                        alert(result.message);
                                        if (result.recoveredCount > 0) window.location.reload();
                                    }
                                }}
                                className="w-full p-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 text-amber-600 dark:text-amber-400 font-medium text-sm flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={16} /> Scan & Recover Lost Files
                            </button>
                        </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                        <h3 className="text-sm font-bold text-red-500 uppercase tracking-wider mb-2">Danger Zone</h3>
                        <button
                            onClick={() => {
                                if (window.confirm("PERMANENTLY DELETE all data? This cannot be undone.")) {
                                    if (window.confirm("Really delete everything?")) {
                                        dataService.deleteAllData();
                                    }
                                }
                            }}
                            className="w-full text-left p-3 rounded-xl bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors flex items-center gap-2 text-sm font-medium"
                        >
                            <Trash2 size={16} /> Reset Account Data
                        </button>
                    </div>

                </div>

                {/* Fixed Footer */}
                <div className="fixed bottom-0 left-0 right-0 md:static p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-[110] flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 md:py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex-[2] btn btn-primary py-3 md:py-2.5 text-lg md:text-base justify-center shadow-lg flex items-center gap-2 rounded-xl"
                    >
                        <Save size={20} /> Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
