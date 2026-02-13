import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, Users, FileText, ChevronRight, BarChart2, Plus, Clock, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { dataService } from '../services/data';
import { firestoreService } from '../services/firestoreService'; // For caregiver query
import { useAuth } from '../context/AuthContext';
// HelpGuide removed (moved to Header)

const HomePage = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [stats, setStats] = useState({ upcoming: 0, taken: 0, missed: 0 });
    const [nextReminder, setNextReminder] = useState(null);
    const [dateGreeting, setDateGreeting] = useState('');
    const [healthTip, setHealthTip] = useState('');
    const [caregivers, setCaregivers] = useState([]);
    const [notes, setNotes] = useState([]);

    const healthTips = [
        "Hydration is key! Don't forget to drink water.",
        "A 5-minute stretch can boost your energy.",
        "Consistency is the secret to health success.",
        "Taking your meds on time keeps you in control.",
        "Small steps lead to big health goals!",
        "Rest is as important as activity.",
        "Fresh air does wonders for the mind.",
        "You're doing great—keep going!",
        "Health is wealth, and you're investing well."
    ];

    useEffect(() => {
        // Pick a random tip
        setHealthTip(healthTips[Math.floor(Math.random() * healthTips.length)]);

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
                    // Find next upcoming or currently snoozed/ringing
                    // Tolerance of 2 minutes for "Next" if snoozed
                    const tolerance = r.status === 'snoozed' ? 2 * 60 * 1000 : 0;
                    if (!next && (rDate.getTime() + tolerance) >= now.getTime()) {
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
        <div className="p-6 pb-28 md:pb-10 space-y-6 max-w-4xl mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="text-3xl font-black bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent tracking-tight">
                        {dateGreeting}, {user?.displayName?.split(' ')[0] || 'Friend'}
                    </h1>
                    <p className="text-orange-600 dark:text-orange-400 font-medium text-sm mt-1 animate-fade-in italic">
                        "{healthTip}"
                    </p>
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
                            <BarChart2 size={14} /> Up Next
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
                        <BarChart2 size={20} />
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

            {/* Caregivers Widget (My Patients) */}
            {user && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="font-bold text-lg text-gray-800 dark:text-gray-200">My Patients</h3>
                        <span onClick={() => navigate('/caregivers')} className="text-orange-500 text-sm font-bold cursor-pointer">View All</span>
                    </div>
                    {caregivers.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3">
                            {caregivers.slice(0, 4).map((patient, index) => (
                                <motion.div
                                    key={`${patient.id}-${index}`}
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

                <div className="grid grid-cols-2 gap-3">
                    {/* 1. Add New Note Card - First Option */}
                    <motion.div
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/notes?add=true')}
                        className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-2xl border border-orange-200 dark:border-orange-800 cursor-pointer flex flex-col items-center justify-center gap-2 min-h-[120px] shadow-sm text-orange-600 dark:text-orange-400"
                    >
                        <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                            <Plus size={24} className="text-orange-500" />
                        </div>
                        <span className="font-bold text-sm">Write Note</span>
                    </motion.div>

                    {/* Recent Notes List */}
                    {notes.map((note, index) => (
                        <motion.div
                            key={`${note.id}-${index}`}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => navigate('/notes', { state: { focusId: note.id } })}
                            className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex flex-col gap-2 min-h-[120px]"
                        >
                            <h4 className="font-bold text-gray-900 dark:text-gray-100 line-clamp-2 leading-tight">{note.title || (note.content ? note.content.substring(0, 20) + "..." : "Untitled Note")}</h4>
                            <p className="text-xs text-gray-400 mt-auto">{new Date(note.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
                        </motion.div>
                    ))}
                </div>
            </div>

        </div>
    );
};

export default HomePage;
