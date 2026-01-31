import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Users, FileText, ChevronRight, Activity, Plus, Clock, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dataService } from '../services/data';
import { firestoreService } from '../services/firestoreService'; // For caregiver query
import { useAuth } from '../context/AuthContext';
import HelpGuide from '../components/common/HelpGuide'; // Import

const HomePage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [stats, setStats] = useState({ upcoming: 0, taken: 0, missed: 0 });
    const [nextReminder, setNextReminder] = useState(null);
    const [caregivers, setCaregivers] = useState([]);
    const [notes, setNotes] = useState([]);
    const [dateGreeting, setDateGreeting] = useState('');
    const [showHelp, setShowHelp] = useState(false); // State for Guide

    useEffect(() => {
        // 1. Greeting
        const hour = new Date().getHours();
        if (hour < 12) setDateGreeting('Good Morning');
        else if (hour < 18) setDateGreeting('Good Afternoon');
        else setDateGreeting('Good Evening');

        // 2. Load Local Data
        const loadDashboard = async () => {
            const reminders = dataService.getReminders();
            const allNotes = dataService.getNotes();

            // Stats & Next Reminder
            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];

            // Expand ONLY today's reminders
            const todaysInstances = dataService.expandRemindersForDate(todayStr, reminders);

            let taken = 0;
            let missed = 0;
            let upcoming = 0;
            let next = null;

            todaysInstances.sort((a, b) => (a.displayTime || '').localeCompare(b.displayTime || ''));

            todaysInstances.forEach(r => {
                const rTime = r.displayTime || '00:00';
                const [h, m] = rTime.split(':').map(Number);
                const rDate = new Date();
                rDate.setHours(h, m, 0, 0);

                if (r.status === 'taken') taken++;
                else if (r.status === 'missed') missed++;
                else {
                    upcoming++;
                    // Find next upcoming
                    if (!next && rDate > now) {
                        next = r;
                    }
                }
            });

            setStats({ upcoming, taken, missed });
            setNextReminder(next);

            // Recent Notes (Top 3)
            setNotes(allNotes.slice(0, 3));

            // 3. Load Caregivers (Patients) if logged in
            // We want "Who I am caring for" -> "My Patients"
            if (user) {
                try {
                    const myEmail = user.email;
                    const patients = await firestoreService.getPatientsForCaregiver(myEmail);
                    setCaregivers(patients);
                } catch (e) {
                    console.error("Home: Failed to load patients", e);
                }
            }
        };

        loadDashboard();

        // Listen for updates
        window.addEventListener('storage-update', loadDashboard);
        return () => window.removeEventListener('storage-update', loadDashboard);
    }, [user]);

    return (
        <div className="p-6 pb-24 space-y-6 max-w-4xl mx-auto animate-fade-in">
            {/* Help Guide Modal */}
            <HelpGuide isOpen={showHelp} onClose={() => setShowHelp(false)} />

            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                            {dateGreeting}, {user?.displayName?.split(' ')[0] || 'Friend'}
                        </h1>
                        <button
                            onClick={() => setShowHelp(true)}
                            className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 p-1.5 rounded-full hover:scale-105 transition-transform"
                            title="How to use"
                        >
                            <span className="text-xs font-bold">?</span>
                        </button>
                    </div>
                    <p className="text-gray-500 dark:text-gray-400">Here is your daily snapshot</p>
                </div>
                <div onClick={() => navigate('/settings')} className="w-12 h-12 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 cursor-pointer border-2 border-white dark:border-gray-800 shadow-sm">
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                    )}
                </div>
            </div>

            {/* Main Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Up Next Card */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/reminders')}
                    className="col-span-2 md:col-span-2 bg-gradient-to-br from-orange-500 to-orange-400 p-6 rounded-3xl text-white shadow-lg shadow-orange-200 dark:shadow-none relative overflow-hidden"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-10">
                        <Clock size={120} />
                    </div>

                    <div className="relative z-10">
                        <h2 className="text-orange-100 font-medium mb-1 flex items-center gap-2">
                            <Bell size={16} /> Up Next
                        </h2>
                        {nextReminder ? (
                            <div>
                                <h3 className="text-3xl font-bold mb-1">{nextReminder.displayTime}</h3>
                                <p className="text-xl font-medium opacity-90">{nextReminder.title}</p>
                                <p className="text-sm opacity-75 mt-2 flex items-center gap-1">
                                    {stats.upcoming - 1 > 0 ? `+ ${stats.upcoming - 1} more today` : 'Last one for today!'}
                                </p>
                            </div>
                        ) : (
                            <div className="py-2">
                                <h3 className="text-2xl font-bold">All caught up!</h3>
                                <p className="opacity-80">No more reminders for today.</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Mini Stats Ring */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/reports')}
                    className="bg-white dark:bg-gray-800 p-4 rounded-3xl border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center shadow-sm"
                >
                    <div className="w-20 h-20 relative flex items-center justify-center mb-2">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path className="text-gray-100 dark:text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                            <path
                                className="text-green-500"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeDasharray={`${stats.taken > 0 ? (stats.taken / (stats.taken + stats.missed + stats.upcoming)) * 100 : 0}, 100`}
                            />
                        </svg>
                        <span className="absolute text-xl font-bold text-gray-800 dark:text-gray-100">{stats.taken}</span>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase">Taken Today</p>
                </motion.div>
            </div>

            {/* Quick Actions */}
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
                <button onClick={() => navigate('/reminders?add=true')} className="flex items-center gap-2 px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold whitespace-nowrap shadow-sm">
                    <Plus size={18} /> Add Med
                </button>
                <button onClick={() => navigate('/caregivers')} className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl font-bold whitespace-nowrap shadow-sm">
                    <Users size={18} /> Share Profile
                </button>
            </div>

            {/* Caregivers Widget (My Patients) */}
            {user && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">My Patients</h3>
                        <span onClick={() => navigate('/caregivers')} className="text-orange-500 text-sm font-bold cursor-pointer">View All</span>
                    </div>
                    {caregivers.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                            {caregivers.slice(0, 4).map(patient => (
                                <motion.div
                                    key={patient.id}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => navigate('/reports', { state: { viewingProfile: patient } })}
                                    className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-3 shadow-sm cursor-pointer hover:border-orange-500/50 transition-colors"
                                >
                                    <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold">
                                        {patient.relationship?.name?.[0] || 'U'}
                                    </div>
                                    <div className="overflow-hidden">
                                        <p className="font-bold text-gray-800 dark:text-gray-100 truncate">{patient.relationship?.name || 'Unknown'}</p>
                                        <p className="text-xs text-green-500 font-medium">View Report</p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-6 text-center border border-dashed border-gray-200 dark:border-gray-700">
                            <Users className="mx-auto text-gray-300 mb-2" />
                            <p className="text-sm text-gray-500">You aren't caring for anyone yet.</p>
                            <button onClick={() => navigate('/caregivers')} className="mt-2 text-orange-500 font-bold text-sm">Add Patient</button>
                        </div>
                    )}
                </div>
            )}

            {/* Recent Notes */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">Recent Notes</h3>
                    <span onClick={() => navigate('/notes')} className="text-gray-400 text-sm font-bold cursor-pointer">See All</span>
                </div>
                {notes.length > 0 ? (
                    <div className="space-y-3">
                        {notes.map(note => (
                            <motion.div
                                key={note.id}
                                whileTap={{ scale: 0.99 }}
                                onClick={() => navigate('/notes')}
                                className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm"
                            >
                                <h4 className="font-bold text-gray-800 dark:text-gray-200">{note.title}</h4>
                                <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{note.content}</p>
                            </motion.div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-6 text-gray-400 text-sm">No notes yet.</div>
                )}
            </div>

        </div>
    );
};

export default HomePage;
