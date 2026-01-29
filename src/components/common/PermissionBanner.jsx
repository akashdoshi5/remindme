import React, { useEffect, useState } from 'react';
import { Bell, ChevronRight, X } from 'lucide-react';
import { useNotifications } from '../../hooks/useNotifications';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const PermissionBanner = () => {
    const { permission, checkPermissions, requestPermission } = useNotifications();
    const [isVisible, setIsVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        const check = async () => {
            const status = await checkPermissions();
            // Show if not granted and not explicitly dismissed this session
            if (status !== 'granted' && !dismissed) {
                setIsVisible(true);
            } else {
                setIsVisible(false);
            }
        };

        check();

        // Re-check periodically or on resume (if we could hook into that easily, but interval is okay for now)
        const interval = setInterval(check, 5000);
        return () => clearInterval(interval);
    }, [checkPermissions, dismissed]);

    const handleEnable = async () => {
        if (Capacitor.isNativePlatform()) {
            await LocalNotifications.openSettings(); // Direct to settings
        } else {
            await requestPermission();
        }
    };

    if (!isVisible) return null;

    return (
        <div className="bg-blue-600 text-white p-3 shadow-md animate-fade-in relative z-50">
            <div className="container mx-auto max-w-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-full shrink-0">
                        <Bell size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm">Notifications are off</p>
                        <p className="text-xs text-blue-100 truncate">Reminders won't work without them.</p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <button
                        onClick={handleEnable}
                        className="bg-white text-blue-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-50 transition-colors flex items-center gap-1"
                    >
                        Enable <ChevronRight size={14} />
                    </button>
                    <button
                        onClick={() => setDismissed(true)}
                        className="p-1.5 hover:bg-blue-700 rounded-full text-blue-200 hover:text-white transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PermissionBanner;
