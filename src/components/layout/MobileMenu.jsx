import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Users, Settings, X, LogOut, Globe, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const MobileMenu = ({ isOpen, onClose, onSettingsClick }) => {
    const { logout } = useAuth();
    const { language, setLanguage } = useLanguage();
    const navigate = useNavigate();

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] md:hidden">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            ></div>

            {/* Drawer */}
            <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl p-6 pb-safe animate-slide-up shadow-2xl border-t border-gray-100 dark:border-gray-800">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold dark:text-white">Menu</h2>
                    <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 transaction-colors">
                        <X size={20} className="text-gray-600 dark:text-gray-400" />
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                    <Link
                        to="/reports"
                        onClick={onClose}
                        className="bg-green-50 dark:bg-green-900/20 p-4 rounded-2xl border border-green-100 dark:border-green-800 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
                    >
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center text-green-600 dark:text-green-300">
                            <Activity size={20} />
                        </div>
                        <span className="font-bold text-gray-800 dark:text-gray-200">Reports</span>
                    </Link>

                    <Link
                        to="/caregivers"
                        onClick={onClose}
                        className="bg-purple-50 dark:bg-purple-900/20 p-4 rounded-2xl border border-purple-100 dark:border-purple-800 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
                    >
                        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-800 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-300">
                            <Users size={20} />
                        </div>
                        <span className="font-bold text-gray-800 dark:text-gray-200">Caregivers</span>
                    </Link>
                </div>

                <div className="space-y-2">
                    <button
                        onClick={() => { onClose(); onSettingsClick(); }}
                        className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200 font-medium">
                            <Settings size={20} /> Settings
                        </div>
                        <ChevronRight size={16} className="text-gray-400" />
                    </button>

                    <div className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-200 font-medium">
                            <Globe size={20} /> Language
                        </div>
                        <select
                            value={language}
                            onChange={(e) => setLanguage(e.target.value)}
                            className="bg-transparent font-bold text-orange-600 dark:text-orange-400 outline-none cursor-pointer"
                        >
                            <option value="en">English (US)</option>
                            <option value="hi">Hindi (India)</option>
                            <option value="mr">Marathi (India)</option>
                        </select>
                    </div>

                    <button
                        onClick={async () => {
                            if (window.confirm('Log out?')) {
                                await logout();
                                onClose();
                            }
                        }}
                        className="w-full flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400 font-medium mt-4"
                    >
                        <div className="flex items-center gap-3">
                            <LogOut size={20} /> Log Out
                        </div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MobileMenu;
