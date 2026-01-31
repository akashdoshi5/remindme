import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Calendar as CalendarIcon, ChevronLeft, ChevronRight, TrendingUp, AlertCircle, CheckCircle, Clock, Edit2, X, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { dataService } from '../services/data';
import { firestoreService } from '../services/firestoreService';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import ProfileSwitcher from '../components/caregiver/ProfileSwitcher';

const ReportsPage = () => {
    const { t } = useLanguage();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date().getDate());

    // Profile State (Local to Reports Page)
    const [viewingProfile, setViewingProfile] = useState(null); // null = Me, Object = Patient
    const [patientData, setPatientData] = useState({ reminders: [] });
    const [isLoadingPatient, setIsLoadingPatient] = useState(false);

    // Stats State
    const [stats, setStats] = useState({ total: 0, taken: 0, missed: 0, score: 100 });
    const [allTimeStats, setAllTimeStats] = useState({ score: 100, taken: 0, missed: 0 }); // NEW state
    const [monthData, setMonthData] = useState({}); // { day: 'perfect'|'missed'|'none' }

    // Day Details State
    const [dayEvents, setDayEvents] = useState([]);

    // Edit Modal State
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [takenTime, setTakenTime] = useState('');

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    // Local Reminders State (Stable reference to prevent infinite loops)
    const [localReminders, setLocalReminders] = useState(() => dataService.getReminders());

    // Listen for LOCAL Data Updates
    useEffect(() => {
        const handleDataUpdate = () => setLocalReminders(dataService.getReminders());
        window.addEventListener('storage-update', handleDataUpdate);
        return () => window.removeEventListener('storage-update', handleDataUpdate);
    }, []);

    // Derived State: Current Reminders List (My Data vs Patient Data)
    const activeReminders = viewingProfile ? patientData.reminders : localReminders;
    const isReadOnly = !!viewingProfile;

    const calculateMonthStats = useCallback(() => {
        // --- MONTHLY STATS (Existing Logic) ---
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let monthTakenPills = 0;
        let monthMissedPills = 0;
        let monthUpcomingPills = 0;

        const newMonthData = {};

        for (let d = 1; d <= daysInMonth; d++) {
            // Helper to expand recurring reminders for THIS specific date
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

            // Use shared logic for expansion
            const reminders = dataService.expandRemindersForDate(dateStr, activeReminders);

            let dayTaken = 0;
            let dayMissed = 0;
            let dayUpcoming = 0;
            let dayTotal = reminders.length;

            reminders.forEach(r => {
                // Determine time status
                let isPast = false;
                const eventTime = r.displayTime || '';

                // Construct Date comparison
                const eventDateObj = new Date(year, month, d);
                eventDateObj.setHours(0, 0, 0, 0);
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const now = new Date();
                let eventTimeMinutes = 0;
                if (eventTime && eventTime.includes(':')) {
                    const [h, m] = eventTime.split(':').map(Number);
                    eventTimeMinutes = h * 60 + m;
                }
                const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

                if (eventDateObj < today) {
                    isPast = true;
                } else if (eventDateObj.getTime() === today.getTime() && eventTime && eventTimeMinutes < currentTimeMinutes) {
                    isPast = true;
                }

                // Categorize
                if (r.status === 'taken') {
                    monthTakenPills++;
                    dayTaken++;
                } else if (r.status === 'snoozed') {
                    monthUpcomingPills++;
                    dayUpcoming++;
                } else if (r.status === 'missed' || (isPast && r.status === 'upcoming')) {
                    monthMissedPills++;
                    dayMissed++;
                } else {
                    monthUpcomingPills++; // Future upcoming
                    dayUpcoming++;
                }
            });

            // Set Day Status for Calendar
            const checkDate = new Date(year, month, d);
            checkDate.setHours(0, 0, 0, 0);
            const todayRef = new Date();
            todayRef.setHours(0, 0, 0, 0);

            if (dayTotal === 0) {
                newMonthData[d] = 'none';
            } else if (checkDate > todayRef) {
                newMonthData[d] = 'none'; // Keep future clean
            } else if (dayTaken === dayTotal) {
                newMonthData[d] = 'perfect';
            } else if (dayMissed === dayTotal) {
                newMonthData[d] = 'missed';
            } else if (dayTaken > 0 || dayMissed > 0) {
                newMonthData[d] = 'partial';
            } else if (dayUpcoming > 0) {
                newMonthData[d] = 'partial'; // Active day
            } else {
                newMonthData[d] = 'none';
            }
        }

        // Adherence Score: Taken / (Taken + Missed)
        const pastTotal = monthTakenPills + monthMissedPills;
        const score = pastTotal > 0 ? Math.round((monthTakenPills / pastTotal) * 100) : 100;

        setStats({
            total: monthTakenPills + monthMissedPills + monthUpcomingPills,
            taken: monthTakenPills,
            missed: monthMissedPills,
            upcoming: monthUpcomingPills,
            score: score
        });
        setMonthData(newMonthData);

        // --- ALL TIME STATS CALCULATION ---
        // 1. Finding Start Date: Earliest created date or fallback to 3 months ago for performance
        // (Ideally we iterate from the very first reminder)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 3); // Default lookback 3 months

        // Try to find earlier logic if possible, or just iterate last 90 days which is a good 'All Time' proxy for adherence
        // Iterating 365 days is also fine js-wise.
        // Let's do 1 year back max to be safe on performance.
        startDate = new Date(today);
        startDate.setFullYear(today.getFullYear() - 1);

        let allTaken = 0;
        let allMissed = 0;

        // Iterate day by day from startDate to Today
        for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const reminders = dataService.expandRemindersForDate(dateStr, activeReminders);

            reminders.forEach(r => {
                // Simplified Past Check (since we are iterating up to today, most represent past)
                // If d < today, it is strictly past.
                // If d === today, we check time.
                let isPast = false;
                const dObj = new Date(d);
                dObj.setHours(0, 0, 0, 0);

                if (dObj < today) {
                    isPast = true;
                } else if (dObj.getTime() === today.getTime()) {
                    // Check time
                    const eventTime = r.displayTime || '';
                    const now = new Date();
                    let eventTimeMinutes = 0;
                    if (eventTime && eventTime.includes(':')) {
                        const [h, m] = eventTime.split(':').map(Number);
                        eventTimeMinutes = h * 60 + m;
                    }
                    const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
                    if (eventTime && eventTimeMinutes < currentTimeMinutes) isPast = true;
                }

                if (r.status === 'taken') allTaken++;
                else if (r.status === 'missed' || (isPast && r.status === 'upcoming')) allMissed++;
            });
        }

        const allPastTotal = allTaken + allMissed;
        const allScore = allPastTotal > 0 ? Math.round((allTaken / allPastTotal) * 100) : 100;

        setAllTimeStats({
            taken: allTaken,
            missed: allMissed,
            score: allScore
        });

    }, [year, month, activeReminders]);

    // Load Patient Data when profile changes
    useEffect(() => {
        if (!viewingProfile) {
            setPatientData({ reminders: [] });
            return;
        }

        setIsLoadingPatient(true);
        setIsLoadingPatient(true);

        const unsubscribe = firestoreService.getPatientRemindersRealtime(viewingProfile.uid, (reminders) => {
            setPatientData({ reminders });
            setIsLoadingPatient(false);
        });

        return () => unsubscribe();
    }, [viewingProfile]);

    // Load Month Data & Stats (Re-run when data, profile, or date changes)
    useEffect(() => {
        calculateMonthStats();
    }, [calculateMonthStats]);

    // Load Day Details
    useEffect(() => {
        if (selectedDate) {
            loadDayEvents(selectedDate);
        }
    }, [selectedDate, currentDate, activeReminders, viewingProfile]);





    const loadDayEvents = (day) => {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // USE GENERIC EXPANSION
        const events = dataService.expandRemindersForDate(dateStr, activeReminders);

        // Get current time for comparison
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTimeMinutes = currentHour * 60 + currentMinute;

        const processedEvents = events.map(event => {
            const eventTime = event.displayTime || '';

            // Parse event time to minutes
            let eventTimeMinutes = 0;
            if (eventTime && eventTime.includes(':')) {
                const [hours, mins] = eventTime.split(':').map(Number);
                eventTimeMinutes = hours * 60 + mins;
            }

            // Determine if this specific event is in the past
            let isPast = false;

            // Create event date object for comparison
            const eventDateObj = new Date(year, month, day);
            eventDateObj.setHours(0, 0, 0, 0);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (eventDateObj < today) {
                isPast = true;
            } else if (eventDateObj.getTime() === today.getTime() && eventTime && eventTimeMinutes < currentTimeMinutes) {
                isPast = true;
            }

            // Mark as missed if it's past and still upcoming
            if (isPast && event.status === 'upcoming') {
                return { ...event, status: 'missed' };
            }
            return event;
        });

        // Sort by time
        processedEvents.sort((a, b) => (a.displayTime || '').localeCompare(b.displayTime || ''));
        setDayEvents(processedEvents);
    };

    const handleStatusUpdate = (status) => {
        if (!selectedEvent || isReadOnly) return; // Guard for read-only

        // For taken status, use the custom time if provided
        if (status === 'taken' && takenTime) {
            // STRICT 2-HOUR WINDOW ADHERENCE RULE
            if (activeReminders && selectedEvent) {
                // 1. Get Scheduled Time
                // selectedEvent.displayTime is HH:MM
                const schedStr = selectedEvent.displayTime;
                if (schedStr && schedStr.includes(':')) {
                    const [sH, sM] = schedStr.split(':').map(Number);
                    const scheduledDate = new Date();
                    scheduledDate.setHours(sH, sM, 0, 0);

                    // 2. Get Actual Taken Time (from User Input)
                    const [tH, tM] = takenTime.split(':').map(Number);
                    const actualDate = new Date();
                    actualDate.setHours(tH, tM, 0, 0);

                    // 3. Calculate Difference in Minutes
                    const diffMs = actualDate - scheduledDate;
                    const diffMinutes = diffMs / (1000 * 60);

                    // 4. Validate Window (+/- 120 Minutes)
                    if (diffMinutes < -120) {
                        alert("It is too early to take this medication (more than 2 hours before schedule). Please take it closer to the scheduled time.");
                        return; // Block save
                    }
                    if (diffMinutes > 120) {
                        // User is late.
                        // "its too early and missed if not in 2 hrs window" -> This implies if late, it counts as MISSED.
                        // We will force status to missed or alert them.
                        const confirmLate = window.confirm("You are more than 2 hours late. Strictly speaking, this counts as a 'Missed' dose for adherence tracking.\n\nClick OK to record as MISSED, or Cancel to correct the time.");
                        if (confirmLate) {
                            handleStatusUpdate('missed'); // Recursively call with missed status
                            return;
                        } else {
                            return; // Let them edit time
                        }
                    }
                }
            }

            // Valid Time Window -> Proceed to Save
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`;
            const customTimestamp = new Date(`${dateStr}T${takenTime}:00`).toISOString();
            dataService.logReminderStatusWithTime(selectedEvent.id, selectedEvent.instanceKey, status, customTimestamp);
        } else {
            dataService.logReminderStatus(selectedEvent.id, selectedEvent.instanceKey, status);
        }

        setEditModalOpen(false);
        setTakenTime('');
        if (!viewingProfile) {
            loadDayEvents(selectedDate); // Refresh list (only needed for self, effects handle others?)
            calculateMonthStats(); // Refresh stats
        }
    };

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

    return (
        <div className="max-w-5xl mx-auto pb-12 relative">

            {/* HEADER: Title & Profile Switcher */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        {viewingProfile ? `Report: ${viewingProfile.relationship?.name}` : t('reports')}
                    </h1>
                    <p className="text-gray-500 text-sm">
                        {viewingProfile ? "Viewing shared health data (Read-Only)" : "Track your adherence and health trends"}
                    </p>
                </div>

                {/* Local Profile Switcher */}
                <div>
                    <span className="text-xs uppercase font-bold text-gray-400 mr-2">Viewing:</span>
                    <ProfileSwitcher
                        value={viewingProfile}
                        onChange={setViewingProfile}
                        className="inline-block"
                    />
                </div>
            </div>

            {/* Read Only Banner (Local) */}
            {isReadOnly && (
                <div className="mb-6 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 p-3 rounded-xl flex items-center gap-3 text-indigo-700 dark:text-indigo-300 transform transition-all animate-fade-in">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-800 flex items-center justify-center shrink-0">
                        <Activity size={16} />
                    </div>
                    <div>
                        <p className="text-sm font-bold">Contributor View</p>
                        <p className="text-xs opacity-80">You are viewing {viewingProfile.relationship?.name}'s data. You cannot make changes.</p>
                    </div>
                </div>
            )}

            {/* Loading State */}
            {isLoadingPatient && (
                <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mb-4"></div>
                    <p className="font-bold text-gray-700 dark:text-gray-200">Syncing Patient Data...</p>
                </div>
            )}

            {/* Edit Status Modal - Only show if NOT read only */}
            <AnimatePresence>
                {editModalOpen && selectedEvent && !isReadOnly && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold dark:text-gray-100">Update Status</h3>
                                <button onClick={() => setEditModalOpen(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full dark:text-gray-400"><X size={20} /></button>
                            </div>

                            <div className="mb-6">
                                <p className="text-gray-500 dark:text-gray-400 text-sm mb-1">Medication</p>
                                <p className="font-bold text-lg dark:text-gray-100">{selectedEvent.title}</p>
                                <p className="text-gray-400 text-sm">Scheduled: {selectedEvent.displayTime}</p>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">When was it taken?</label>
                                    <input
                                        type="time"
                                        value={takenTime || selectedEvent.displayTime}
                                        onChange={(e) => setTakenTime(e.target.value)}
                                        className="w-full p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-center font-mono text-gray-700 dark:text-gray-100 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200"
                                    />
                                </div>

                                <button
                                    onClick={() => handleStatusUpdate('taken')}
                                    className="w-full p-4 rounded-xl bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 font-bold flex items-center gap-3 hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-green-200 dark:bg-green-800 flex items-center justify-center"><CheckCircle size={18} /></div>
                                    Mark as Taken
                                </button>
                                <button
                                    onClick={() => handleStatusUpdate('missed')}
                                    className="w-full p-4 rounded-xl bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-bold flex items-center gap-3 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-full bg-red-200 dark:bg-red-800 flex items-center justify-center"><AlertCircle size={18} /></div>
                                    Mark as Missed
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>



            <div className="grid md:grid-cols-3 gap-6 mb-8">
                {/* Score Card */}
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white dark:bg-gray-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center relative"
                >
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-emerald-500 rounded-t-3xl"></div>

                    <div className="flex items-center justify-around w-full gap-2">
                        {/* Monthly Score */}
                        <div className="flex flex-col items-center">
                            <div className="w-20 h-20 rounded-full border-4 border-gray-50 dark:border-gray-700 flex items-center justify-center mb-2 relative">
                                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth="3" />
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={stats.score > 80 ? "#10B981" : "#F59E0B"} strokeWidth="3" strokeDasharray={`${stats.score}, 100`} />
                                </svg>
                                <span className="text-lg font-bold text-gray-800 dark:text-gray-100">{stats.score}%</span>
                            </div>
                            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">This Month</h3>
                        </div>

                        {/* Divider */}
                        <div className="h-12 w-[1px] bg-gray-100 dark:bg-gray-700"></div>

                        {/* All Time Score */}
                        <div className="flex flex-col items-center relative group cursor-help">
                            <div className="w-20 h-20 rounded-full border-4 border-gray-50 dark:border-gray-700 flex items-center justify-center mb-2 relative">
                                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" className="text-gray-100 dark:text-gray-700" strokeWidth="3" />
                                    <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke={allTimeStats.score > 80 ? "#3B82F6" : "#6366F1"} strokeWidth="3" strokeDasharray={`${allTimeStats.score}, 100`} />
                                </svg>
                                <span className="text-lg font-bold text-gray-800 dark:text-gray-100">{allTimeStats.score}%</span>
                            </div>
                            <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                                All Time
                                <div className="hidden group-hover:block absolute bottom-full mb-2 bg-gray-900 text-white text-xs p-2 rounded w-32 z-10 pointer-events-none">
                                    Based on past 12 months activity
                                </div>
                            </h3>
                        </div>
                    </div>
                </motion.div>

                <div className="md:col-span-2 grid grid-cols-3 gap-2">
                    <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-3xl border border-green-100 dark:border-green-900/50 flex flex-col justify-center items-center text-center">
                        <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center mb-2">
                            <CheckCircle size={20} />
                        </div>
                        <span className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.taken}</span>
                        <span className="text-xs text-green-800 dark:text-green-300 font-medium opacity-80">Taken</span>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-3xl border border-red-100 dark:border-red-900/50 flex flex-col justify-center items-center text-center">
                        <div className="w-10 h-10 bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-xl flex items-center justify-center mb-2">
                            <AlertCircle size={20} />
                        </div>
                        <span className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.missed}</span>
                        <span className="text-xs text-red-800 dark:text-red-300 font-medium opacity-80">Missed</span>
                    </div>
                    <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-3xl border border-orange-100 dark:border-orange-900/50 flex flex-col justify-center items-center text-center">
                        <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center mb-2">
                            <Clock size={20} />
                        </div>
                        <span className="text-2xl font-bold text-orange-700 dark:text-orange-400">{stats.upcoming || 0}</span>
                        <span className="text-xs text-orange-800 dark:text-orange-300 font-medium opacity-80">Upcoming</span>
                    </div>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Calendar */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="lg:col-span-2 bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-lg shadow-gray-200/50 dark:shadow-none border border-gray-100 dark:border-gray-700"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-2xl font-bold flex items-center gap-3 text-gray-900 dark:text-gray-100">
                            <CalendarIcon className="text-orange-500" />
                            {monthNames[month]} {year}
                        </h2>
                        <div className="flex items-center gap-2">
                            {/* "This Month" button if not current month */}
                            {(month !== new Date().getMonth() || year !== new Date().getFullYear()) && (
                                <button
                                    onClick={() => setCurrentDate(new Date())}
                                    className="px-3 py-1.5 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-bold rounded-lg hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors mr-2"
                                >
                                    This Month
                                </button>
                            )}
                            <button onClick={handlePrevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300"><ChevronLeft /></button>
                            <button onClick={handleNextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-600 dark:text-gray-300"><ChevronRight /></button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-4 mb-4 text-center">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <div key={d} className="font-bold text-gray-400 dark:text-gray-500 text-sm uppercase tracking-wider">{d}</div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-3">
                        {/* Empty slots for previous month */}
                        {[...Array(new Date(year, month, 1).getDay())].map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square bg-transparent"></div>
                        ))}

                        {/* Days */}
                        {[...Array(new Date(year, month + 1, 0).getDate())].map((_, i) => {
                            const day = i + 1;
                            const status = monthData[day] || 'none';
                            const isSelected = selectedDate === day;

                            return (
                                <div
                                    key={day}
                                    onClick={() => setSelectedDate(day)}
                                    className={`aspect-square rounded-2xl flex items-center justify-center text-lg font-bold border-2 transition-all cursor-pointer relative group
                                        ${isSelected ? 'ring-4 ring-orange-200 dark:ring-orange-900/50 scale-105 z-10 shadow-lg' : 'hover:scale-105'}
                                        ${status === 'perfect' ? 'bg-green-100 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400' :
                                            status === 'missed' ? 'bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800 text-red-600 dark:text-red-400' :
                                                status === 'partial' ? 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-400' :
                                                    'bg-gray-50 dark:bg-gray-700/50 border-gray-100 dark:border-gray-600 text-gray-400 dark:text-gray-500'}`}
                                >
                                    {day}
                                    {status !== 'none' && (
                                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-current opacity-50"></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </motion.div>

                {/* Day Details Side Panel */}
                <div className="lg:col-span-1">
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="bg-white dark:bg-gray-800 rounded-3xl p-6 border border-gray-200 dark:border-gray-700 h-full shadow-sm"
                    >
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                            <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                                <Activity size={18} />
                            </div>
                            {selectedDate ? (
                                <span>
                                    {selectedDate === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear() ? 'Today, ' : ''}
                                    {new Date(year, month, selectedDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                                </span>
                            ) : 'Select a Date'}
                        </h3>

                        {!selectedDate ? (
                            <div className="text-center py-12 text-gray-400">
                                <CalendarIcon size={48} className="mx-auto mb-4 opacity-20" />
                                <p>Click on a calendar day to see detailed history.</p>
                            </div>
                        ) : dayEvents.length === 0 ? (
                            <div className="text-center py-12 text-gray-400">
                                <CheckCircle size={48} className="mx-auto mb-4 opacity-10" />
                                <p>No recorded activity for this day.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {dayEvents.map((event, idx) => (
                                    <div
                                        key={event.uniqueId || idx}
                                        className={`flex items-center gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 relative group transition-colors 
                                            ${event.status === 'upcoming' && new Date(event.instanceKey.split('_')[0] + 'T' + event.displayTime) > new Date()
                                                ? 'bg-gray-50 dark:bg-gray-700/50 opacity-60 cursor-not-allowed'
                                                : isReadOnly ? 'bg-gray-50 dark:bg-gray-700/50 opacity-90'
                                                    : 'bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'}`}
                                        onClick={() => {
                                            // Guard for read-only
                                            if (isReadOnly) return;

                                            // STRICT DATE RESTRICTION: Only Today and Yesterday allowed
                                            // Calculate diffDays based on Midnight comparisons
                                            const eventDate = new Date(year, month, selectedDate);
                                            eventDate.setHours(0, 0, 0, 0);
                                            const today = new Date();
                                            today.setHours(0, 0, 0, 0);

                                            // Diff in days
                                            const diffTime = today - eventDate;
                                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                                            // Allow: Today (diff=0) and Yesterday (diff=1)
                                            if (diffDays > 1) {
                                                alert("You can only modify updates for today or yesterday. Older records are locked for accuracy.");
                                                return;
                                            }

                                            // Block Future
                                            if (eventDate > today) return;

                                            // Construct safe time
                                            let safeTime = event.displayTime;
                                            if (!safeTime || !safeTime.includes(':')) safeTime = '09:00';

                                            setSelectedEvent({
                                                ...event,
                                                uniqueId: event.uniqueId || idx,
                                                dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`
                                            });
                                            // Set default time in modal
                                            setTakenTime(event.takenAt ? new Date(event.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : safeTime);
                                            setEditModalOpen(true);
                                        }}
                                    >
                                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 
                                            ${event.status === 'taken' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' :
                                                event.status === 'missed' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                                                    event.status === 'snoozed' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                                                        'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400'}`}>
                                            {event.status === 'taken' ? <CheckCircle size={20} /> :
                                                event.status === 'missed' ? <AlertCircle size={20} /> :
                                                    event.status === 'snoozed' ? <Clock size={20} /> :
                                                        <Clock size={20} />}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <h4 className="font-bold text-gray-900 dark:text-gray-100 leading-tight">{event.title}</h4>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded border transition-opacity group-hover:opacity-0 ${event.status === 'taken' && event.takenAt ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900' : 'bg-white dark:bg-gray-800 text-gray-400 border-gray-100 dark:border-gray-600'}`}>
                                                        {event.status === 'taken' && event.takenAt
                                                            ? new Date(event.takenAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                            : event.displayTime
                                                        }
                                                    </span>
                                                    {!isReadOnly && (
                                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="p-2 bg-white dark:bg-gray-700 rounded-full shadow-sm border border-gray-100 dark:border-gray-600 text-orange-500 dark:text-orange-400">
                                                                <Edit2 size={14} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <p className={`text-sm font-medium 
                                                ${event.status === 'taken' ? 'text-green-600 dark:text-green-400' :
                                                    event.status === 'missed' ? 'text-red-500 dark:text-red-400' :
                                                        event.status === 'snoozed' ? 'text-yellow-600 dark:text-yellow-400' :
                                                            'text-orange-500 dark:text-orange-400'}`}>
                                                {event.status === 'taken' ? 'Completed' :
                                                    event.status === 'missed' ? 'Missed' :
                                                        event.status === 'snoozed' ? 'Snoozed' :
                                                            'Upcoming'}
                                            </p>
                                        </div>


                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
