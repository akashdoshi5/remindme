import React, { useState, useEffect } from 'react';
import { Users, ChevronDown, Check, User, HeartPulse, LogOut } from 'lucide-react';
import { dataService } from '../../services/data';
import { useAuth } from '../../context/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';

const ProfileSwitcher = ({ value, onChange, className }) => {
    const { user } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [patients, setPatients] = useState([]);

    // Internal state for global mode (fallback)
    const [globalProfile, setGlobalProfile] = useState(null);
    const [error, setError] = useState(null);
    const [indexLink, setIndexLink] = useState(null);
    const [loading, setLoading] = useState(false);

    // If controlled (via props), use that. Else use global state.
    const isControlled = onChange !== undefined;
    const currentProfile = isControlled ? value : globalProfile;

    useEffect(() => {
        loadPatients();

        if (!isControlled) {
            const handleUpdate = () => setGlobalProfile(dataService.getActiveProfile());
            window.addEventListener('storage-update', handleUpdate);
            handleUpdate(); // Init
            return () => window.removeEventListener('storage-update', handleUpdate);
        }
    }, [user, isControlled]);

    const loadPatients = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        setIndexLink(null);
        try {
            const list = await dataService.getPatientsForMe();
            setPatients(list);
        } catch (err) {
            console.error("Failed to load patients", err);
            setError(err.message);
            if (err.message.includes('https://console.firebase.google.com')) {
                const match = err.message.match(/(https:\/\/console\.firebase\.google\.com[^\s]+)/);
                if (match) setIndexLink(match[0]);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (patient) => {
        if (isControlled) {
            onChange(patient);
        } else {
            dataService.setActiveProfile(patient);
        }
        setIsOpen(false);
    };

    const handleSwitchToSelf = () => {
        if (isControlled) {
            onChange(null);
        } else {
            dataService.setActiveProfile(null);
        }
        setIsOpen(false);
    };

    const currentName = currentProfile
        ? (currentProfile.relationship?.name || 'Patient')
        : 'My Health';

    return (
        <div className={`relative z-50 ${className || ''}`}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${currentProfile
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200'
                    }`}
            >
                {currentProfile ? <HeartPulse size={16} className="text-pink-500" /> : <User size={16} />}
                <span className="text-sm font-bold truncate max-w-[100px] md:max-w-none">{currentName}</span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40 bg-transparent"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden"
                        >
                            <div className="p-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">Select Profile</span>
                            </div>

                            <div className="max-h-64 overflow-y-auto p-1">
                                {/* Self */}
                                <button
                                    onClick={handleSwitchToSelf}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors ${!currentProfile
                                        ? 'bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                                        }`}
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-pink-500 flex items-center justify-center text-white shadow-sm">
                                        <User size={16} />
                                    </div>
                                    <div className="flex-1 text-left">
                                        <div className="font-bold text-sm">My Health</div>
                                        <div className="text-xs opacity-70">Personal Dashboard</div>
                                    </div>
                                    {!currentProfile && <Check size={16} className="text-orange-500" />}
                                </button>

                                {/* List Patients */}
                                {error && (
                                    <div className="p-3 bg-red-50 mb-2 rounded-lg border border-red-100">
                                        <p className="text-xs text-red-600 font-medium mb-1">Pass key mismatch</p>
                                        <p className="text-[10px] text-red-500 mb-2 leading-tight opacity-75">{error}</p>
                                        {indexLink && (
                                            <a
                                                href={indexLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block w-full text-center py-1.5 bg-red-600 text-white text-xs font-bold rounded shadow-sm hover:bg-red-700 transition-colors"
                                            >
                                                Fix Database Setup
                                            </a>
                                        )}
                                        <button onClick={loadPatients} className="text-[10px] text-gray-500 underline mt-2 w-full text-center">Retry</button>
                                    </div>
                                )}

                                {patients.length === 0 && !loading && !error && (
                                    <div className="p-4 text-center text-xs text-gray-400 italic">
                                        No linked profiles found.<br />
                                        <span className="opacity-75">Ask them to add you as a Caregiver.</span>
                                        <div className="mt-2 p-2 bg-yellow-50 rounded text-yellow-700 text-[10px]">
                                            Check that they added <b>{user.email}</b> exactly.
                                        </div>
                                    </div>
                                )}
                                {patients.map((p) => (
                                    <button
                                        key={p.caregiverDocId}
                                        onClick={() => handleSelect(p)}
                                        className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-colors mt-1 ${currentProfile?.uid === p.uid
                                            ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-200'
                                            }`}
                                    >
                                        <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                            {p.relationship?.name?.charAt(0) || 'P'}
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className="font-bold text-sm truncate">{p.relationship?.name || 'Unknown User'}</div>
                                            <div className="text-xs opacity-70 truncate">{p.relationship?.email}</div>
                                        </div>
                                        {currentProfile?.uid === p.uid && <Check size={16} className="text-indigo-500" />}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ProfileSwitcher;
