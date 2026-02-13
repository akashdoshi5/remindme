import React, { useState, useEffect } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { Bell, X, RefreshCw, Play, Shield, BarChart2 } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications'; // Import hook
import { dataService } from '../../services/data';
import pkg from '../../../package.json'; // Import version

export const NotificationDebugPanel = ({ isOpen, onClose }) => {
    const [pending, setPending] = useState([]);
    const [dbReminders, setDbReminders] = useState([]);
    const { scheduleReminders, requestPermission } = useNotifications();

    const loadPending = async () => {
        if (Capacitor.isNativePlatform()) {
            try {
                const result = await LocalNotifications.getPending();
                console.log('📱 Pending notifications:', result.notifications.length);
                const sorted = result.notifications.sort((a, b) => {
                    const timeA = a.schedule?.at ? new Date(a.schedule.at).getTime() : 0;
                    const timeB = b.schedule?.at ? new Date(b.schedule.at).getTime() : 0;
                    return timeA - timeB;
                });
                setPending(sorted);
            } catch (e) {
                console.error('Failed to get pending notifications:', e);
            }
        }
    };

    const loadDbReminders = () => {
        try {
            const all = dataService.getReminders(); // Get raw list
            // Filter only upcoming for today/future
            const now = new Date();
            const upcoming = all.filter(r => {
                // Simple logic for debug: just show all active
                return r.status !== 'done' && r.status !== 'missed';
            });
            setDbReminders(upcoming);
        } catch (e) {
            console.error("DB Load Error", e);
        }
    };

    const handleTestNotification = async () => {
        try {
            const id = Math.floor(Date.now() / 1000);
            await LocalNotifications.schedule({
                notifications: [{
                    title: 'Test Notification',
                    body: 'If you see this, scheduling works!',
                    id: id,
                    schedule: { at: new Date(Date.now() + 5000) }, // 5s from now
                    sound: 'default',
                    channelId: 'reminders_v10'
                }]
            });
            alert('Test Notification Scheduled for 5s from now!');
            loadPending();
        } catch (e) {
            alert('Test Failed: ' + e.message);
        }
    };

    const handleForceSchedule = async () => {
        try {
            const reminders = dataService.getUpcomingReminders(7);
            alert(`Found ${reminders.length} active reminders. Scheduling...`);
            await scheduleReminders(reminders);
            alert('Schedule Logic Finished. Checking pending...');
            await scheduleReminders(reminders);
            alert('Schedule Logic Finished. Checking pending...');
            loadPending();
            loadDbReminders();
        } catch (e) {
            alert('Force Schedule Failed: ' + e.message);
        }
    };

    const handleCheckPerms = async () => {
        try {
            const status = await LocalNotifications.checkPermissions();
            alert(`Permissions: display=${status.display}`);
            if (status.display !== 'granted') {
                await requestPermission();
            }
        } catch (e) {
            alert('Check Perms Failed: ' + e.message);
        }
    };

    useEffect(() => {
        if (isOpen) {
            if (isOpen) {
                loadPending();
                loadDbReminders();
            }
        }
    }, [isOpen]);

    if (!Capacitor.isNativePlatform()) return null;
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
            <div className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-xl shadow-2xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="p-4 border-b dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800 rounded-t-xl">
                    <div>
                        <h2 className="text-lg font-bold dark:text-white">Debug Panel (v{pkg.version})</h2>
                        <p className="text-xs text-gray-500">Native Android Debugging</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full">
                        <X size={20} className="dark:text-white" />
                    </button>
                </div>

                {/* Diagnostics Controls */}
                <div className="p-3 grid grid-cols-2 gap-2 bg-blue-50 dark:bg-blue-900/20">
                    <button onClick={handleForceSchedule} className="flex items-center justify-center gap-2 bg-blue-600 text-white p-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                        <RefreshCw size={16} /> Force Sync & Schedule
                    </button>
                    <button onClick={handleTestNotification} className="flex items-center justify-center gap-2 bg-green-600 text-white p-2 rounded-lg text-sm font-medium hover:bg-green-700">
                        <Play size={16} /> Test (5s)
                    </button>
                    <button onClick={handleCheckPerms} className="flex items-center justify-center gap-2 bg-purple-600 text-white p-2 rounded-lg text-sm font-medium hover:bg-purple-700">
                        <Shield size={16} /> Check Perms
                    </button>
                    <button onClick={loadPending} className="flex items-center justify-center gap-2 bg-gray-600 text-white p-2 rounded-lg text-sm font-medium hover:bg-gray-700">
                        <BarChart2 size={16} /> Refresh List
                    </button>
                </div>

                {/* List */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-100 dark:bg-black/20">
                    <h3 className="text-xs uppercase font-bold text-gray-500 mb-2">Pending Notifications ({pending.length})</h3>
                    {pending.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Bell size={32} className="mx-auto mb-2 opacity-20" />
                            <p>No pending notifications found.</p>
                            <p className="text-xs mt-1">Try "Force Sync" above.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {pending.map((n, idx) => (
                                <div key={idx} className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
                                    <div className="flex justify-between items-start">
                                        <span className="font-semibold text-gray-800 dark:text-white">{n.title}</span>
                                        <span className="text-xs font-mono bg-gray-200 dark:bg-gray-700 px-1 rounded text-gray-600 dark:text-gray-300">#{n.id}</span>
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">{n.body}</div>
                                    <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-xs text-blue-600 dark:text-blue-400 font-mono">
                                        {n.schedule?.at && (
                                            <>
                                                <div>📅 {new Date(n.schedule.at).toLocaleString()}</div>
                                                <div className="opacity-75">TS: {typeof n.schedule.at === 'number' ? n.schedule.at : new Date(n.schedule.at).getTime()}</div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* DB LIST */}
                <div className="flex-1 overflow-y-auto p-4 bg-orange-50 dark:bg-orange-900/10 border-t border-orange-200">
                    <h3 className="text-xs uppercase font-bold text-orange-600 mb-2">DB Active Reminders ({dbReminders.length})</h3>
                    <div className="space-y-1">
                        {dbReminders.map((r, i) => (
                            <div key={i} className="text-xs p-2 bg-white dark:bg-gray-800 rounded border border-orange-100 dark:border-orange-800">
                                <span className="font-bold">{r.title}</span> - {r.time} ({r.frequency})
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
