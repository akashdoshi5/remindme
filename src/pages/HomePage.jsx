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

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Next Up Card - Takes 2 cols on desktop */}
                <motion.div
                    whileTap={{ scale: 0.99 }}
                    onClick={() => navigate('/reminders')}
                    className="col-span-1 md:col-span-2 bg-gradient-to-br from-orange-500 to-orange-400 p-6 rounded-3xl text-white shadow-lg shadow-orange-500/20 relative overflow-hidden flex flex-col justify-between min-h-[160px]"
                >
                    <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
                        <Clock size={100} />
                    </div>

                    <div className="relative z-10">
                        <h2 className="text-orange-100 text-sm font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                            <Activity size={14} /> Up Next
                        </h2>
                        {nextReminder ? (
                            <div>
                                <h3 className="text-4xl font-bold mb-1 tracking-tight">{nextReminder.displayTime}</h3>
                                <p className="text-lg font-medium opacity-90 truncate pr-8">{nextReminder.title}</p>
                            </div>
                        ) : (
                            <div className="flex flex-col items-start gap-1">
                                <h3 className="text-2xl font-bold">All caught up!</h3>
                                <p className="opacity-80 text-sm">Relax, you're doing great.</p>
                            </div>
                        )}
                    </div>
                </motion.div>

                {/* Progress Ring Card */}
                <motion.div
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/reports')}
                    className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center shadow-sm relative overflow-hidden"
                >
                    <div className="absolute top-2 right-2 text-gray-300 dark:text-gray-600">
                        <Activity size={20} />
                    </div>
                    <div className="w-20 h-20 relative flex items-center justify-center mb-2">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                            <path className="text-gray-100 dark:text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                            <path
                                className="text-green-500 transition-all duration-1000 ease-out"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                                strokeDasharray={`${stats.taken > 0 ? (stats.taken / (stats.taken + stats.missed + stats.upcoming)) * 100 : 0}, 100`}
                            />
                        </svg>
                        <div className="absolute flex flex-col items-center">
                            <span className="text-2xl font-bold text-gray-800 dark:text-gray-100 leading-none">{stats.taken}</span>
                        </div>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Taken</p>
                </motion.div>
            </div>

            {/* Quick Actions (Compact) */}
            <div className="grid grid-cols-2 gap-3">
                <button onClick={() => navigate('/reminders?add=true')} className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm text-gray-700 dark:text-gray-200 font-bold text-sm">
                    <Plus size={18} className="text-orange-500" /> Add Reminder
                </button>
                <button onClick={() => navigate('/caregivers')} className="flex items-center justify-center gap-2 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm text-gray-700 dark:text-gray-200 font-bold text-sm">
                    <Users size={18} className="text-blue-500" /> Caregivers
                </button>
            </div>

            {/* Recent Notes Snippet */}
            <div className="space-y-3">
                <div className="flex justify-between items-end px-1">
                    <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200 mb-0">Quick Notes</h3>
                    <span onClick={() => navigate('/notes')} className="text-orange-500 text-xs font-bold cursor-pointer bg-orange-50 dark:bg-orange-900/20 px-2 py-1 rounded-full">View All</span>
                </div>

                {notes.length > 0 ? (
                    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide -mx-2 px-2">
                        {notes.map(note => (
                            <motion.div
                                key={note.id}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => navigate('/notes', { state: { focusId: note.id } })}
                                className="min-w-[160px] w-[160px] p-4 bg-yellow-50 dark:bg-gray-800 border border-yellow-200 dark:border-gray-700 rounded-2xl shadow-sm flex flex-col gap-2 h-32"
                            >
                                <span className="text-[10px] text-gray-400 font-bold uppercase">{new Date(note.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                <h4 className="font-bold text-gray-800 dark:text-gray-200 line-clamp-2 leading-tight">{note.title}</h4>
                                <div className="mt-auto flex justify-end opacity-50">
                                    <FileText size={16} className="text-gray-500" />
                                </div>
                            </motion.div>
                        ))}
                        <motion.div
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate('/notes?add=true')}
                            className="min-w-[60px] flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 cursor-pointer text-gray-400"
                        >
                            <Plus size={24} />
                        </motion.div>
                    </div>
                ) : (
                    <div onClick={() => navigate('/notes?add=true')} className="p-6 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-3xl flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                        <FileText size={24} className="mb-2 opacity-50" />
                        <span className="text-sm font-bold">Write a note</span>
                    </div>
                )}
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
