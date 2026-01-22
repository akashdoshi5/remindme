import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Bell, FileText, Menu } from 'lucide-react';

const MobileNav = ({ onMenuClick }) => {
    const location = useLocation();

    const navItems = [
        { path: '/', icon: Home, label: 'Home' },
        { path: '/reminders', icon: Bell, label: 'Reminders' },
        { path: '/notes', icon: FileText, label: 'Notes' },
    ];

    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 pb-safe z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
            <div className="flex justify-around items-center px-2 py-3">
                {navItems.map((item) => {
                    const isActive = location.pathname === item.path;
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.path}
                            to={item.path}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-300 min-w-[64px] ${isActive
                                ? 'text-orange-600 dark:text-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                        >
                            <Icon size={24} className={isActive ? 'fill-current' : ''} strokeWidth={isActive ? 2.5 : 2} />
                            <span className="text-[10px] font-medium">{item.label}</span>
                        </Link>
                    );
                })}
                <button
                    onClick={onMenuClick}
                    className="flex flex-col items-center gap-1 p-2 rounded-xl transition-all duration-300 min-w-[64px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                >
                    <Menu size={24} strokeWidth={2} />
                    <span className="text-[10px] font-medium">Menu</span>
                </button>
            </div>
        </div>
    );
};

export default MobileNav;
