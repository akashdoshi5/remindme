import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, FileText, Users, ArrowRight, Activity, Clock, CheckCircle, AlertCircle, Search } from 'lucide-react';
import { motion } from 'framer-motion';
import { useLanguage } from '../context/LanguageContext';

const DashboardCard = ({ title, description, icon: Icon, color, link, linkText, delay }) => {
    const colorClasses = {
        orange: { bg: 'bg-orange-50', text: 'text-orange-600', iconBg: 'bg-orange-100', border: 'hover:border-orange-200' },
        teal: { bg: 'bg-teal-50', text: 'text-teal-600', iconBg: 'bg-teal-100', border: 'hover:border-teal-200' },
        green: { bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100', border: 'hover:border-green-200' }
    };

    const theme = colorClasses[color];

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4 }}
            className={`card group flex flex-col items-center text-center p-8 transition-all hover:shadow-xl hover:-translate-y-1 border border-transparent ${theme.border}`}
        >
            <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${theme.iconBg} ${theme.text} shadow-sm group-hover:scale-110 transition-transform duration-300`}>
                <Icon size={40} />
            </div>
            <h3 className="text-2xl font-bold mb-3 text-gray-900 group-hover:text-gray-700 transition-colors">{title}</h3>
            <p className="text-gray-500 mb-8 flex-1 leading-relaxed text-lg px-2">{description}</p>
            <Link
                to={link}
                className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all ${theme.bg} ${theme.text} hover:brightness-95`}
            >
                {linkText} <ArrowRight size={18} />
            </Link>
        </motion.div>
    );
};

import { useAuth } from '../context/AuthContext';

import { useUI } from '../context/UIContext';

import PermissionBanner from '../components/common/PermissionBanner';

const HomePage = () => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const { openSearch } = useUI();
    const [todayReminders, setTodayReminders] = React.useState({ upcoming: [], past: [] });
    const navigate = useNavigate();

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 5) return "Good Night";
        if (hour < 12) return "Good Morning";
        if (hour < 17) return "Good Afternoon";
        if (hour < 21) return "Good Evening";
        return "Good Night";
    };

    const refreshData = () => {
        const todayStr = new Date().toLocaleDateString('en-CA');
        import('../services/data').then(({ dataService }) => {
            const allToday = dataService.getRemindersForDate(todayStr);

            // Split into Prioritized Lists
            const upcoming = allToday.filter(r => r.status === 'upcoming' || r.status === 'snoozed');
            const past = allToday.filter(r => r.status === 'missed' || r.status === 'taken' || r.status === 'done');

            setTodayReminders({ upcoming, past });
        });
    };

    React.useEffect(() => {
        refreshData();
        const interval = setInterval(refreshData, 60000); // 1 min refresh
        window.addEventListener('storage-update', refreshData);
        return () => {
            clearInterval(interval);
            window.removeEventListener('storage-update', refreshData);
        };
    }, []);

    return (
        <div className="max-w-6xl mx-auto px-4 pb-20">
            <PermissionBanner />
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="text-center mb-10 pt-8"
            >
                <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight text-gray-900 dark:text-gray-100">
                    {getGreeting()}, {user?.displayName?.split(' ')[0] || 'Friend'}
                </h1>

                {/* Global Search Bar (Prominent) */}
                <div
                    onClick={openSearch}
                    className="max-w-xl mx-auto mt-8 bg-white dark:bg-gray-800 rounded-full shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-700 p-2 flex items-center gap-3 cursor-pointer hover:scale-[1.02] transition-transform group"
                >
                    <div className="w-10 h-10 bg-orange-50 dark:bg-orange-900/20 rounded-full flex items-center justify-center text-orange-500">
                        <Search size={20} />
                    </div>
                    <span className="text-gray-400 dark:text-gray-500 font-medium text-lg flex-1 text-left">
                        Search notes, reminders...
                    </span>
                    <div className="hidden md:flex items-center gap-2 pr-4 text-xs text-gray-300 font-bold tracking-wider">
                        CMD K
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="flex justify-center gap-4 mt-8">
                    <button
                        onClick={() => navigate('/reminders', { state: { openAdd: true } })}
                        className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-orange-500/30 transition-all hover:scale-105"
                    >
                        <Bell size={18} />
                        Add Reminder
                    </button>
                    <button
                        onClick={() => navigate('/notes', { state: { openAdd: true } })}
                        className="flex items-center gap-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 px-6 py-3 rounded-full font-bold shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all hover:scale-105"
                    >
                        <FileText size={18} />
                        Add Note
                    </button>
                </div>
            </motion.div>

            {/* UPCOMING - Priority */}
            <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">For Later Today</h2>
                    <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-3 py-1 rounded-full text-sm font-bold">
                        {todayReminders.upcoming.length} Upcoming
                    </span>
                </div>

                {todayReminders.upcoming.length > 0 ? (
                    <div className="grid gap-4">
                        {todayReminders.upcoming.map(r => (
                            <div
                                key={r.uniqueId}
                                onClick={() => navigate('/reminders', { state: { highlightId: r.uniqueId } })}
                                className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-orange-500 flex items-center justify-between cursor-pointer hover:shadow-md transition-all dark:border-l-orange-500"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="bg-orange-50 dark:bg-orange-900/30 p-3 rounded-xl text-orange-600 dark:text-orange-400">
                                        <Bell size={24} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{r.title}</h3>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
                                            <Clock size={12} /> {r.displayTime}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-orange-600 dark:text-orange-400 font-bold bg-orange-50 dark:bg-orange-900/30 px-3 py-1 rounded-lg text-sm">
                                        {r.status === 'snoozed' ? 'Snoozed' : 'Upcoming'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 text-gray-400">
                        <p>No upcoming reminders for today.</p>
                    </div>
                )}
            </div>


            {/* PAST / HISTORY - Read Only */}
            <div className="mb-12 opacity-80">
                <h2 className="text-xl font-bold text-gray-500 dark:text-gray-400 mb-6 flex items-center gap-2">
                    <Activity size={20} /> Past / Completed
                </h2>

                <div className="grid gap-4">
                    {todayReminders.past.map(r => (
                        <div key={r.uniqueId} className={`p-4 rounded-xl flex items-center justify-between border ${r.status === 'taken' || r.status === 'done' ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-900' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900'
                            }`}>
                            <div className="flex items-center gap-4">
                                <div className={`p-2 rounded-lg ${r.status === 'taken' || r.status === 'done' ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'
                                    }`}>
                                    {r.status === 'taken' || r.status === 'done' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                                </div>
                                <div>
                                    <h3 className={`font-bold ${r.status === 'taken' || r.status === 'done' ? 'text-green-900 dark:text-green-100' : 'text-red-900 dark:text-red-100'
                                        }`}>{r.title}</h3>
                                    <p className="text-xs opacity-70 flex items-center gap-1 dark:text-gray-300">
                                        {r.displayTime} • {r.status.toUpperCase()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                    {todayReminders.past.length === 0 && (
                        <p className="text-gray-400 italic px-2">Nothing in the past yet.</p>
                    )}
                </div>
            </div>

            <div className="grid md:grid-cols-3 gap-8 mt-12">
                <DashboardCard
                    title="All Reminders"
                    description="Complex schedules, Medication courses, & Smart windows."
                    icon={Bell}
                    color="orange"
                    link="/reminders"
                    linkText="Go to Reminders"
                    delay={0.1}
                />
                <DashboardCard
                    title="Easy Notes"
                    description="Voice notes, Attachments, & Quick conversion to reminders."
                    icon={FileText}
                    color="teal"
                    link="/notes"
                    linkText="Open Notes"
                    delay={0.2}
                />
                <DashboardCard
                    title="Health Report"
                    description="Track adherence scores & Edit past history."
                    icon={Activity}
                    color="green"
                    link="/reports"
                    linkText="View Report"
                    delay={0.3}
                />
            </div>
        </div>
    );
};


export default HomePage;
