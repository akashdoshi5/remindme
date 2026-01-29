import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { X, Download, Smartphone, RefreshCw } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import packageJson from '../../../package.json';

const AppVersionManager = () => {
    const [showBanner, setShowBanner] = useState(false); // Mobile Web Banner
    const [updateAvailable, setUpdateAvailable] = useState(null); // Native Update { version, url, mandatory }
    const [ignoredUpdate, setIgnoredUpdate] = useState(false);

    useEffect(() => {
        const checkVersion = async () => {
            // 1. WEB: Check if we should show "Download App" banner
            if (!Capacitor.isNativePlatform()) {
                const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                const isDismissed = sessionStorage.getItem('install_banner_dismissed');

                // Only show if mobile browser and not dismissed
                if (isMobile && !isDismissed) {
                    setShowBanner(true);
                }
                return;
            }

            // 2. NATIVE: Check for updates via Firestore
            try {
                const configRef = doc(db, 'config', 'app_version');
                const snap = await getDoc(configRef);

                if (snap.exists()) {
                    const remoteConfig = snap.data();
                    const currentVersion = packageJson.version; // e.g. "1.0.0"

                    if (compareVersions(remoteConfig.latest_version, currentVersion) > 0) {
                        setUpdateAvailable(remoteConfig);
                    }
                }
            } catch (error) {
                console.warn("Failed to check for updates:", error);
            }
        };

        checkVersion();
    }, []);

    const compareVersions = (v1, v2) => {
        // Simple semantic version compare
        if (!v1 || !v2) return 0;
        const p1 = v1.split('.').map(Number);
        const p2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
            const val1 = p1[i] || 0;
            const val2 = p2[i] || 0;
            if (val1 > val2) return 1;
            if (val1 < val2) return -1;
        }
        return 0;
    };

    const handleDismissBanner = () => {
        setShowBanner(false);
        sessionStorage.setItem('install_banner_dismissed', 'true');
    };

    if (showBanner) {
        return (
            <div className="fixed bottom-0 left-0 right-0 bg-orange-600 text-white p-3 z-50 flex items-center justify-between shadow-lg animate-slide-up">
                <div className="flex items-center gap-3">
                    <div className="bg-white/20 p-2 rounded-lg">
                        <Smartphone size={24} />
                    </div>
                    <div>
                        <p className="font-bold text-sm">Get the full experience</p>
                        <p className="text-xs text-orange-100">Download the Android App (APK)</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href="/android-app-release.apk"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-white text-orange-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-50 flex items-center gap-1"
                    >
                        <Download size={14} /> Download
                    </a>
                    <button onClick={handleDismissBanner} className="p-1.5 hover:bg-orange-700 rounded-full text-orange-200">
                        <X size={16} />
                    </button>
                </div>
            </div>
        );
    }

    if (updateAvailable && !ignoredUpdate) {
        return (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-orange-100 dark:border-gray-800 text-center animate-bounce-slight">
                    <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-orange-600 dark:text-orange-400">
                        <RefreshCw size={32} />
                    </div>

                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Update Available</h2>
                    <p className="text-gray-500 dark:text-gray-400 mb-6">
                        Version <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{updateAvailable.latest_version}</span> is available.
                        {updateAvailable.mandatory ? " This update is required." : " Update now for the latest features and fixes."}
                    </p>

                    <div className="flex flex-col gap-3">
                        <a
                            href={updateAvailable.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold shadow-lg shadow-orange-500/30 flex items-center justify-center gap-2"
                        >
                            <Download size={20} /> Update Now
                        </a>

                        {!updateAvailable.mandatory && (
                            <button
                                onClick={() => setIgnoredUpdate(true)}
                                className="w-full py-3 text-gray-500 dark:text-gray-400 font-medium hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Not Now
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

export default AppVersionManager;
