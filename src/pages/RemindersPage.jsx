import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AddReminderModal from '../components/reminders/AddReminderModal';
import { dataService } from '../services/data';
import { useLanguage } from '../context/LanguageContext';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Calendar, Clock, Bell, Share2, MoreVertical, CheckCircle, XCircle, Filter, ChevronLeft, ChevronRight, Mic, AlertTriangle, Edit2, Trash2, Check, ArrowRightLeft, Sun, Moon, Settings, RefreshCcw, Droplets, Dumbbell, Star, Pill, FileText, Paperclip, Upload } from 'lucide-react';

import TextPreviewModal from '../components/common/TextPreviewModal';

const RemindersPage = () => {
    const { t } = useLanguage();
    const location = useLocation();
    const navigate = useNavigate();
    const [filter, setFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'upcoming', 'done', 'missed'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingReminder, setEditingReminder] = useState(null);
    const [previewData, setPreviewData] = useState(null);

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [reminders, setReminders] = useState([]);
    const [triggerReload, setTriggerReload] = useState(0);
    const [startVoice, setStartVoice] = useState(false);

    // Pull to Refresh State
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullY, setPullY] = useState(0);
    const touchStartRef = useRef(0);

    const handleTouchStart = (e) => {
        if (window.scrollY === 0) {
            touchStartRef.current = e.touches[0].clientY;
        }
    };

    const handleTouchMove = (e) => {
        if (touchStartRef.current > 0 && window.scrollY === 0) {
            const y = e.touches[0].clientY - touchStartRef.current;
            if (y > 0) {
                setPullY(y > 100 ? 100 + (y - 100) * 0.3 : y); // Resistance
            }
        }
    };

    const handleTouchEnd = async () => {
        if (pullY > 80 && !isRefreshing) {
            setIsRefreshing(true);
            setPullY(0); // Reset position but show spinner
            await dataService.forceSync();
            setTimeout(() => setIsRefreshing(false), 500); // Min wait
        } else {
            setPullY(0);
        }
        touchStartRef.current = 0;
    };

    // Delete Confirmation State
    const [deleteConfig, setDeleteConfig] = useState(null); // { id, title, isRecurring, instanceKey }
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

    useEffect(() => {
        const loadReminders = () => {
            const dateStr = selectedDate.toLocaleDateString('en-CA');
            const data = dataService.getRemindersForDate(dateStr);
            setReminders(data);
        };
        loadReminders();

        const handleStorageUpdate = () => {
            loadReminders();
        };
        window.addEventListener('storage-update', handleStorageUpdate);

        // Check for state OR query params
        const params = new URLSearchParams(location.search);
        if (location.state?.openAdd || params.get('add') === 'true') {
            setEditingReminder(null);
            setIsModalOpen(true);
            // Clear state so it doesn't reopen on refresh, but keep other state if needed
            window.history.replaceState({}, document.title);
        }

        return () => window.removeEventListener('storage-update', handleStorageUpdate);
    }, [selectedDate, triggerReload, location.state, location.search]);

    // Handle Deep Linking
    useEffect(() => {
        if (location.state?.highlightId || location.state?.targetDate) {
            if (location.state.targetDate) {
                const target = new Date(location.state.targetDate);
                const parts = location.state.targetDate.split('-');
                if (parts.length === 3) {
                    target.setFullYear(parts[0], parts[1] - 1, parts[2]);
                    target.setHours(0, 0, 0, 0);
                }
                setSelectedDate(target);

                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (target < today) {
                    setStatusFilter('all');
                }
            }

            if (location.state.highlightId) {
                setTimeout(() => {
                    const element = document.getElementById(`reminder-${location.state.highlightId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('ring-4', 'ring-orange-400', 'ring-opacity-50');
                        setTimeout(() => {
                            element.classList.remove('ring-4', 'ring-orange-400', 'ring-opacity-50');
                        }, 2000);
                    }

                    if (location.state.openEdit) {
                        const compositeId = location.state.highlightId.toString();
                        const baseId = compositeId.includes('_') ? compositeId.split('_')[0] : compositeId;
                        let found = reminders.find(r => r.id == baseId || r.uniqueId == compositeId);
                        if (!found) {
                            const allReminders = dataService.getReminders();
                            found = allReminders.find(r => r.id == baseId);
                        }
                        if (found) {
                            setEditingReminder(found);
                            setIsModalOpen(true);
                        }
                    }
                }, 800);
            }
            navigate(location.pathname, { replace: true, state: {} });
        }

        if (location.state?.add && location.state?.initialTitle) {
            setEditingReminder({
                title: location.state.initialTitle,
                instructions: location.state.initialNote || '',
                type: 'Other',
                isNew: true
            });
            setIsModalOpen(true);
            // Clear state
            window.history.replaceState({}, document.title);
        }
    }, [location.state, reminders]);


    const handleDateChange = (days) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(selectedDate.getDate() + days);
        setSelectedDate(newDate);
    };

    const handleSave = async (reminderData, instanceKey = null) => {
        try {
            if (editingReminder && editingReminder.id) {
                await dataService.updateReminder(editingReminder.id, reminderData, instanceKey);
            } else {
                await dataService.addReminder(reminderData);
            }
            setIsModalOpen(false);
            setEditingReminder(null);
            setTriggerReload(prev => prev + 1);
        } catch (error) {
            console.error("Failed to save reminder:", error);
            // Optionally re-throw to let the modal handle the alert
            throw error;
        }
    };

    const handleDeleteClick = (reminder) => {
        // Determine if this is a "Soft Delete" scenario
        let isPastRecurring = false;
        if (reminder.schedule?.startDate || reminder.date) {
            const start = new Date(reminder.schedule?.startDate || reminder.date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toLocaleDateString('en-CA');
            // Compare YYYY-MM-DD
            // Start < Today
            // Re-use logic from data.js roughly or just date comparison
            // (Simple string compare works for ISO YYYY-MM-DD)
            if ((reminder.schedule?.startDate || reminder.date) < todayStr) {
                isPastRecurring = true;
            }
        }

        setDeleteConfig({
            id: reminder.id,
            title: reminder.title,
            isPastRecurring // Pass this flag to the modal rendering
        });
        setIsDeleteModalOpen(true);
    };

    const handleEdit = (reminder) => {
        setEditingReminder(reminder);
        setIsModalOpen(true);
    };

    const initiateDelete = (reminder) => {
        const isRecurring = reminder.schedule?.type === 'recurring' || (reminder.frequency && reminder.frequency !== 'Once');
        setDeleteConfig({
            id: reminder.id,
            title: reminder.title,
            isRecurring: isRecurring,
            instanceKey: reminder.instanceKey
        });
        setIsDeleteModalOpen(true);
    };

    const confirmDelete = (scope) => {
        if (!deleteConfig) return;
        if (scope === 'series') {
            dataService.deleteReminder(deleteConfig.id);
        } else {
            if (deleteConfig.instanceKey) {
                dataService.updateReminder(deleteConfig.id, { status: 'cancelled' }, deleteConfig.instanceKey);
            } else {
                dataService.deleteReminder(deleteConfig.id);
            }
        }
        setTriggerReload(prev => prev + 1);
        setIsDeleteModalOpen(false);
        setDeleteConfig(null);
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);

    // ... (Existing Effects)

    const displayedReminders = searchQuery
        ? dataService.searchReminders(searchQuery)
        : reminders.filter(r => {
            if (!r) return false;
            // Standard Filters only apply if NOT searching (or should search also filter? Note says "previewed as happening in notes", usually global search)
            if (statusFilter === 'upcoming') {
                return r.status === 'upcoming' || r.status === 'snoozed';
            }
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (filter !== 'All' && r.type !== filter) return false;
            return true;
        });

    const activeReminders = displayedReminders;

    // ... (Grouping Logic needs to handle search results which might not have displayTime or be on selectedDate)
    const groupedReminders = { Morning: [], Afternoon: [], Evening: [], Results: [] };

    if (searchQuery) {
        // Flatten results for search view
        groupedReminders.Results = displayedReminders;
    } else {
        displayedReminders.forEach(r => {
            if (!r.displayTime) {
                groupedReminders.Morning.push(r);
                return;
            }
            const hour = parseInt(r.displayTime.split(':')[0]);
            if (hour < 12) groupedReminders.Morning.push(r);
            else if (hour < 17) groupedReminders.Afternoon.push(r);
            else groupedReminders.Evening.push(r);
        });
    }

    // Dynamic Categories
    const allTypes = new Set(dataService.getReminders().map(r => r.type || 'Other'));
    const categories = [
        { name: 'All', count: null },
        ...Array.from(allTypes).filter(t => t).map(type => ({
            name: type,
            count: reminders.filter(r => r.type === type).length
        }))
    ];

    // Auto-scroll to Current Time
    const scrollRef = useRef(null);
    const [hasScrolled, setHasScrolled] = useState(false);

    useEffect(() => {
        setHasScrolled(false); // Reset when date changes
    }, [selectedDate]);

    useEffect(() => {
        if (scrollRef.current && !hasScrolled) {
            // Small timeout to ensure layout is stable
            setTimeout(() => {
                scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
            setHasScrolled(true);
        }
    }, [displayedReminders, selectedDate, hasScrolled]);


    return (
        <div
            className="max-w-5xl mx-auto pb-24 md:pb-10 relative min-h-screen"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {/* Pull to Refresh Spinner */}
            {(pullY > 0 || isRefreshing) && (
                <div
                    className="flex justify-center items-center w-full overflow-hidden transition-all duration-300 ease-out"
                    style={{ height: isRefreshing ? '60px' : `${pullY}px` }}
                >
                    <div className={`p-2 rounded-full bg-white dark:bg-gray-800 shadow-lg border border-gray-100 dark:border-gray-700 flex items-center justify-center ${isRefreshing ? 'animate-spin' : ''}`}
                        style={{ transform: isRefreshing ? 'scale(1)' : `scale(${Math.min(pullY / 60, 1)}) rotate(${pullY * 2}deg)` }}
                    >
                        <RefreshCcw size={20} className="text-orange-500" />
                    </div>
                </div>
            )}


            {/* Header & Filters */}
            {/* Header & Filters */}
            <div className="sticky top-0 z-40 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-md -mx-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700/50 md:px-0 md:mx-0 md:rounded-b-2xl md:mb-6 transition-all shadow-sm">
                <div className="flex flex-col gap-3">

                    {/* Search Bar or Date Nav */}
                    {showSearch ? (
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 p-2 md:p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 relative z-50 animate-fade-in">
                            <Search size={20} className="text-gray-400 ml-2" />
                            <input
                                type="text"
                                autoFocus
                                placeholder="Search reminders, instructions, attached text..."
                                className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder:text-gray-400 h-full"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500">
                                <XCircle size={18} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 md:p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 relative z-50">
                            <button onClick={(e) => { e.stopPropagation(); handleDateChange(-1); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"><ChevronLeft size={20} /></button>
                            <div className="flex items-center gap-2 relative group cursor-pointer">
                                {/* V10: Quick Calendar Picker */}
                                <input
                                    type="date"
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full"
                                    value={selectedDate.toLocaleDateString('en-CA')}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            const parts = e.target.value.split('-');
                                            const d = new Date();
                                            d.setFullYear(parts[0], parts[1] - 1, parts[2]);
                                            d.setHours(0, 0, 0, 0);
                                            setSelectedDate(d);
                                        }
                                    }}
                                />
                                <div className="flex items-center gap-2 font-bold text-base md:text-lg text-gray-900 dark:text-gray-100 group-hover:text-orange-600 transition-colors">
                                    <Calendar size={18} className="text-orange-500" />
                                    {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 rotate-90" />
                                </div>
                            </div>

                            {/* Today Button - Moved OUTSIDE relative container to prevent click blocking */}
                            {new Date(selectedDate).setHours(0, 0, 0, 0) !== new Date().setHours(0, 0, 0, 0) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedDate(new Date()); }}
                                    className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[10px] md:text-xs font-bold rounded-lg uppercase tracking-wide relative z-20"
                                >
                                    Today
                                </button>
                            )}
                            <div className="flex items-center gap-1">
                                <button onClick={() => setShowSearch(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400">
                                    <Search size={20} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDateChange(1); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"><ChevronRight size={20} /></button>
                            </div>
                        </div>
                    )}

                    {/* Filter Chips */}
                    <div className="flex gap-2 overflow-x-auto scrollbar-none items-center h-10">
                        <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-full shrink-0">
                            {[
                                { id: 'all', label: 'All' },
                                { id: 'upcoming', label: 'Upcoming' },
                            ].map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => setStatusFilter(opt.id)}
                                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${statusFilter === opt.id ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <div className="w-[1px] h-6 bg-gray-300 dark:bg-gray-700 mx-1 shrink-0"></div>
                        {categories.map((cat) => (
                            <button
                                key={cat.name}
                                onClick={() => setFilter(cat.name)}
                                className={`px-4 py-1.5 rounded-full border text-xs font-bold transition-all duration-200 whitespace-nowrap ${filter === cat.name
                                    ? 'bg-orange-600 text-white border-orange-600'
                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                                    }`}
                            >
                                {cat.name} {cat.count !== null && <span className="opacity-70 ml-1 text-[10px] bg-black/10 dark:bg-white/10 px-1.5 rounded-full">{cat.count}</span>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="h-4 md:hidden"></div>

            <AddReminderModal
                isOpen={isModalOpen}
                onClose={() => { setIsModalOpen(false); setStartVoice(false); }}
                onSave={handleSave}
                onDelete={(id) => { dataService.deleteReminder(id); setTriggerReload(prev => prev + 1); }}
                reminderToEdit={editingReminder}
                autoStartListening={startVoice}
            />

            {/* Delete Modal */}
            {isDeleteModalOpen && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-100 dark:border-gray-800 animate-scale-in">
                        <div className="flex flex-col items-center mb-4">
                            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full text-red-600 dark:text-red-400 mb-2">
                                <Trash2 size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white text-center">Delete Reminder?</h3>
                            <p className="text-gray-500 dark:text-gray-400 text-sm text-center mt-1">"{deleteConfig?.title}"</p>
                        </div>
                        <div className="space-y-3">
                            {deleteConfig?.isRecurring ? (
                                <>
                                    {deleteConfig.isPastRecurring && (
                                        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-xs text-yellow-800 dark:text-yellow-200 text-left">
                                            <strong>Note:</strong> Since this reminder started in the past, deleting the "Series" will only stop future reminders. <br />
                                            <span className="opacity-80 mt-1 block">Past history (before today) will be preserved for your records.</span>
                                        </div>
                                    )}
                                    <button onClick={() => confirmDelete('instance')} className="w-full py-3 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Delete This Event Only</button>
                                    <button onClick={() => confirmDelete('series')} className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-500/20">
                                        {deleteConfig.isPastRecurring ? 'Stop Future Reminders' : 'Delete Entire Series'}
                                    </button>
                                </>
                            ) : (
                                <button onClick={() => confirmDelete('series')} className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-500/20">Delete</button>
                            )}
                            <button onClick={() => setIsDeleteModalOpen(false)} className="w-full py-2 text-gray-500 dark:text-gray-400 text-sm font-bold hover:text-gray-800 dark:hover:text-gray-200">Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="space-y-6 md:space-y-8 mt-4 md:mt-0">
                {(searchQuery ? ['Results'] : ['Morning', 'Afternoon', 'Evening']).map(group => {
                    if (groupedReminders[group].length === 0) return null;

                    // 1. Sort by time (unless search results, keep relevance or data order? Let's sort by time/date still)
                    const sortedGroup = [...groupedReminders[group]].sort((a, b) => {
                        // If search results, maybe sort by date then time?
                        // For now keep time sort logic if available, else date.
                        if (searchQuery) {
                            if (a.date !== b.date) return (a.date > b.date ? 1 : -1);
                        }
                        const tA = a.displayTime ? parseInt(a.displayTime.split(':')[0]) * 60 + parseInt(a.displayTime.split(':')[1]) : 0;
                        const tB = b.displayTime ? parseInt(b.displayTime.split(':')[0]) * 60 + parseInt(b.displayTime.split(':')[1]) : 0;
                        return tA - tB;
                    });

                    // 2. Determine "Now" Separator Index
                    let separatorIndex = -1;
                    const isToday = new Date(selectedDate).setHours(0, 0, 0, 0) === new Date().setHours(0, 0, 0, 0);

                    if (isToday) {
                        const now = new Date();
                        const currentMinutes = now.getHours() * 60 + now.getMinutes();

                        // Find the split point
                        for (let i = 0; i < sortedGroup.length; i++) {
                            const r = sortedGroup[i];
                            if (!r.displayTime) continue;
                            const [h, m] = r.displayTime.split(':').map(Number);
                            const rMinutes = h * 60 + m;

                            if (rMinutes > currentMinutes) {
                                separatorIndex = i; // This is the first "Future" item
                                break;
                            }
                        }
                    }

                    return (
                        <div key={group} className="animate-fade-in relative">
                            <h3 className="text-base font-bold text-gray-400 mb-3 flex items-center gap-2 px-1 uppercase tracking-wider text-xs sticky top-0 bg-gray-50 dark:bg-gray-900 z-20 py-2">
                                {group === 'Morning' && <Sun className="text-orange-400" size={16} />}
                                {group === 'Afternoon' && <Sun className="text-yellow-500" size={16} />}
                                {group === 'Evening' && <Moon className="text-indigo-400" size={16} />}
                                {group === 'Results' && <Search className="text-blue-500" size={16} />}
                                {group}
                            </h3>
                            <div className="space-y-3 relative">
                                <AnimatePresence>
                                    {sortedGroup.map((reminder, idx) => {
                                        // PAST VISUAL DIFFERENTIATION
                                        // Default: if status is taken/done -> dimmed. 
                                        // New Request: Differentiate "Passed Time" even if not taken.
                                        const now = new Date();
                                        const currentMinutes = now.getHours() * 60 + now.getMinutes();
                                        let isPastTime = false;
                                        if (reminder.displayTime && isToday) {
                                            const [h, m] = reminder.displayTime.split(':').map(Number);
                                            if (h * 60 + m < currentMinutes) isPastTime = true;
                                        }

                                        return (
                                            <React.Fragment key={reminder.uniqueId || reminder.id}>
                                                {/* SEPARATOR: Render before the first future item (idx === separatorIndex) 
                                                    OR if separatorIndex was never found (all past) but we are at the end? 
                                                    No, user wants "Current Time" line. 
                                                    Actually, strictly inserting it BEFORE the first future item handles most cases.
                                                    What if all are past? Then separator should be after the last item?
                                                    Let's stick to "Current Time" indicator mainly.
                                                */}
                                                {isToday && idx === separatorIndex && (() => {
                                                    // Ensure we only render the separator in the CORRECT group
                                                    const now = new Date();
                                                    const currentH = now.getHours();

                                                    let isCorrectGroup = false;
                                                    if (group === 'Morning' && currentH < 12) isCorrectGroup = true;
                                                    else if (group === 'Afternoon' && currentH >= 12 && currentH < 17) isCorrectGroup = true;
                                                    else if (group === 'Evening' && currentH >= 17) isCorrectGroup = true;

                                                    if (isCorrectGroup) {
                                                        return (
                                                            <div ref={scrollRef} className="flex items-center gap-4 py-4 opacity-80 scroll-mt-32">
                                                                <div className="h-[2px] flex-1 bg-red-400/30"></div>
                                                                <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-full border border-red-200 dark:border-red-800">
                                                                    Current Time
                                                                </span>
                                                                <div className="h-[2px] flex-1 bg-red-400/30"></div>
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}

                                                <motion.div
                                                    layout
                                                    initial={{ opacity: 0, y: 10 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    exit={{ opacity: 0, x: -100 }}
                                                    id={`reminder-${reminder.uniqueId || reminder.id}`}
                                                    onClick={() => handleEdit(reminder)}
                                                    className={`card p-0 overflow-hidden flex flex-col md:flex-row shadow-sm hover:shadow-md transition-all groups border-l-4 cursor-pointer 
                                                        ${(reminder.status === 'taken' || reminder.status === 'done')
                                                            ? 'opacity-50 bg-gray-100 dark:bg-gray-800/40 border-gray-300 dark:border-gray-700 grayscale-[0.8]'
                                                            : (isPastTime && reminder.status !== 'missed')
                                                                // Past but not taken/missed yet? Maybe just slightly dimmed background?
                                                                ? 'bg-gray-50/80 dark:bg-gray-800/80 border-orange-300'
                                                                : reminder.status === 'snoozed'
                                                                    ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400'
                                                                    : 'border-orange-500 bg-white dark:bg-gray-800'
                                                        }`}
                                                >
                                                    <div className="p-3 md:p-4 flex-1 flex flex-row items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3 md:gap-4 flex-1">
                                                            <div className="text-xl md:text-2xl shrink-0">
                                                                {(() => {
                                                                    switch (reminder.type) {
                                                                        case 'Medication': return <Pill size={24} className="text-blue-500" />;
                                                                        case 'Water': return <Droplets size={24} className="text-blue-400" />;
                                                                        case 'Exercise': return <Dumbbell size={24} className="text-orange-500" />;
                                                                        case 'Appointments': return <Calendar size={24} className="text-purple-500" />;
                                                                        case 'Other': return <Star size={24} className="text-yellow-500" />;
                                                                        default: return <Bell className="text-gray-700 dark:text-gray-300" size={24} />;
                                                                    }
                                                                })()}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-center gap-2">
                                                                    <h3 className={`font-bold text-base md:text-lg truncate leading-tight ${isPastTime && reminder.status !== 'taken' ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
                                                                        {reminder.title}
                                                                    </h3>
                                                                    {/* V10: Search Result Extra Info */}
                                                                    {/* V10: Search Result Extra Info */}
                                                                    {searchQuery && (reminder.frequency !== 'Once') && (
                                                                        <span className="shrink-0 p-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" title="Recurring/Course">
                                                                            <RefreshCcw size={12} />
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {reminder.instructions && <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm truncate">{reminder.instructions}</p>}

                                                                {/* V10.17: Show Date Range ONLY in Search Results */}
                                                                {searchQuery && reminder.schedule && reminder.schedule.startDate && (reminder.frequency !== 'Once') && (
                                                                    <div className="text-[10px] md:text-xs text-blue-500 mt-1 flex items-center gap-1 bg-blue-50 dark:bg-blue-900/10 self-start px-1.5 py-0.5 rounded w-fit border border-blue-100 dark:border-blue-900/30">
                                                                        <Calendar size={10} className="opacity-70" />
                                                                        <span>{new Date(reminder.schedule.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                                                        <ArrowRightLeft size={8} className="opacity-50" />
                                                                        <span>
                                                                            {/* Calculate End Date roughly or show "Ongoing" */}
                                                                            {(() => {
                                                                                if (reminder.schedule.endDate) {
                                                                                    return new Date(reminder.schedule.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                                                                }
                                                                                // V10.19: Check both durationDays and medDuration (for complex schedules)
                                                                                const duration = reminder.schedule.durationDays || reminder.schedule.medDuration;
                                                                                if (!duration) return "Ongoing";
                                                                                const d = new Date(reminder.schedule.startDate);
                                                                                d.setDate(d.getDate() + (parseInt(duration) - 1));
                                                                                return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                                                            })()}
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* Attachments Display */}
                                                                {reminder.files && reminder.files.length > 0 && (
                                                                    <div className="flex flex-col mt-1.5 gap-1">
                                                                        {/* File Chips */}
                                                                        <div className="flex gap-2 overflow-x-auto scrollbar-none">
                                                                            {reminder.files.map((file, fIdx) => (
                                                                                <button
                                                                                    key={fIdx}
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        // Consistent Preview via Modal
                                                                                        const isImage = (file.type?.startsWith('image/') || file.url?.match(/\.(jpeg|jpg|gif|png|webp)$/i) || file.name?.match(/\.(jpeg|jpg|gif|png|webp)$/i));

                                                                                        setPreviewData({
                                                                                            title: file.name,
                                                                                            text: file.extractedText || "No text content available.",
                                                                                            imageUrl: isImage ? (file.url || file.data) : null,
                                                                                            searchQuery: searchQuery // Pass query for highlighting
                                                                                        });
                                                                                    }}
                                                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors shrink-0 ${searchQuery && (file.name.toLowerCase().includes(searchQuery.toLowerCase()) || (file.extractedText && file.extractedText.toLowerCase().includes(searchQuery.toLowerCase())))
                                                                                        ? 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-700 font-bold'
                                                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                                                        }`}
                                                                                >
                                                                                    <Paperclip size={10} className={searchQuery && (file.name.toLowerCase().includes(searchQuery.toLowerCase()) || (file.extractedText && file.extractedText.toLowerCase().includes(searchQuery.toLowerCase()))) ? "text-yellow-600" : "text-gray-500"} />
                                                                                    <span className="truncate max-w-[100px]">{file.name}</span>
                                                                                </button>
                                                                            ))}
                                                                        </div>

                                                                        {/* Search Match Snippets (Only when searching) */}
                                                                        {searchQuery && reminder.files.filter(f =>
                                                                            f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                                                            (f.extractedText && f.extractedText.toLowerCase().includes(searchQuery.toLowerCase()))
                                                                        ).map((match, mIdx) => (
                                                                            <div key={`match-${mIdx}`} className="mt-1 text-xs bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/30 rounded p-1.5 animate-fade-in">
                                                                                <div className="font-bold text-yellow-700 dark:text-yellow-500 mb-0.5 flex items-center gap-1">
                                                                                    <Search size={10} /> Match in {match.name}:
                                                                                </div>
                                                                                {match.extractedText && match.extractedText.toLowerCase().includes(searchQuery.toLowerCase()) && (
                                                                                    <div className="text-gray-600 dark:text-gray-400 italic truncate pl-4 border-l-2 border-yellow-200 dark:border-yellow-800 text-[10px]">
                                                                                        "...{match.extractedText.substring(Math.max(0, match.extractedText.toLowerCase().indexOf(searchQuery.toLowerCase()) - 15), Math.min(match.extractedText.length, match.extractedText.toLowerCase().indexOf(searchQuery.toLowerCase()) + 30))}..."
                                                                                    </div>
                                                                                )}
                                                                                <button
                                                                                    className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline mt-1 text-[10px] uppercase font-bold tracking-normal flex items-center gap-1"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const isImage = (match.type?.startsWith('image/') || match.url?.match(/\.(jpeg|jpg|gif|png|webp)$/i) || match.name?.match(/\.(jpeg|jpg|gif|png|webp)$/i));
                                                                                        setPreviewData({
                                                                                            title: match.name,
                                                                                            text: match.extractedText,
                                                                                            imageUrl: isImage ? (match.url || match.data) : null,
                                                                                            searchQuery: searchQuery
                                                                                        });
                                                                                    }}
                                                                                >
                                                                                    Preview Match
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                <div className={`flex items-center gap-2 mt-1 text-xs font-bold ${isPastTime ? 'text-gray-400' : 'text-orange-500'}`}>
                                                                    {reminder.status === 'taken' ? (
                                                                        (() => {
                                                                            // ROBUST CHECK: Top-level OR Deep Log
                                                                            let timeStr = null;
                                                                            if (reminder.takenAt) {
                                                                                timeStr = reminder.takenAt;
                                                                            } else if (reminder.logs && reminder.instanceKey && reminder.logs[reminder.instanceKey]?.takenAt) {
                                                                                timeStr = reminder.logs[reminder.instanceKey].takenAt;
                                                                            }

                                                                            if (timeStr) {
                                                                                return (
                                                                                    <>
                                                                                        <CheckCircle size={12} className="text-green-500" />
                                                                                        <span className="text-green-600 dark:text-green-400">
                                                                                            {new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                                        </span>
                                                                                    </>
                                                                                );
                                                                            }
                                                                            // Fallback if status is taken but no time found (old/legacy)
                                                                            return (
                                                                                <>
                                                                                    <CheckCircle size={12} className="text-green-500" />
                                                                                    <span className="text-green-600 dark:text-green-400">Done</span>
                                                                                </>
                                                                            );
                                                                        })()
                                                                    ) : (
                                                                        <>
                                                                            <Clock size={12} /> {reminder.displayTime}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="flex gap-2 shrink-0">
                                                            {(() => {
                                                                // Lock Logic: Disable delete for history older than Yesterday
                                                                const yesterday = new Date();
                                                                yesterday.setDate(yesterday.getDate() - 1);
                                                                yesterday.setHours(0, 0, 0, 0);

                                                                // V8 FIX: If Searching, check the REMINDER's date, not the selected calendar date
                                                                let checkDate = new Date(selectedDate);
                                                                if (searchQuery) {
                                                                    if (reminder.targetDate) checkDate = new Date(reminder.targetDate);
                                                                    else if (reminder.date) checkDate = new Date(reminder.date);
                                                                    else if (reminder.schedule?.startDate) checkDate = new Date(reminder.schedule.startDate);
                                                                }
                                                                checkDate.setHours(0, 0, 0, 0);

                                                                const isLocked = checkDate < yesterday;

                                                                if (isLocked) {
                                                                    return (
                                                                        <button
                                                                            disabled
                                                                            title="Cannot delete past history"
                                                                            className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed flex items-center justify-center shrink-0"
                                                                        >
                                                                            <Trash2 size={18} />
                                                                        </button>
                                                                    );
                                                                }

                                                                return (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); initiateDelete(reminder); }}
                                                                        className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-700 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors flex items-center justify-center shrink-0"
                                                                    >
                                                                        <Trash2 size={18} />
                                                                    </button>
                                                                );
                                                            })()}

                                                            {(() => {
                                                                // Action Window Logic
                                                                if (reminder.status === 'taken' || reminder.status === 'done') return null;

                                                                let isActionable = true;
                                                                let reason = '';

                                                                // Lock Logic: Disable action for history older than Yesterday
                                                                const yesterday = new Date();
                                                                yesterday.setDate(yesterday.getDate() - 1);
                                                                yesterday.setHours(0, 0, 0, 0);

                                                                // V8 FIX: If Searching, check the REMINDER's date
                                                                let checkDate = new Date(selectedDate);
                                                                if (searchQuery) {
                                                                    if (reminder.targetDate) checkDate = new Date(reminder.targetDate);
                                                                    else if (reminder.date) checkDate = new Date(reminder.date);
                                                                    else if (reminder.schedule?.startDate) checkDate = new Date(reminder.schedule.startDate);
                                                                }
                                                                checkDate.setHours(0, 0, 0, 0);

                                                                const isLocked = checkDate < yesterday;
                                                                if (isLocked) {
                                                                    isActionable = false;
                                                                    reason = 'History';
                                                                } else {
                                                                    // V10.17: Check time window
                                                                    if (reminder.displayTime) {
                                                                        const [h, m] = reminder.displayTime.split(':').map(Number);
                                                                        const reminderDate = new Date(checkDate);
                                                                        reminderDate.setHours(h, m, 0, 0);

                                                                        const now = new Date();
                                                                        const diffMs = now.getTime() - reminderDate.getTime();
                                                                        const hoursDiff = diffMs / (1000 * 60 * 60);

                                                                        // V10.22: Time Window Logic
                                                                        if (hoursDiff < -2) {
                                                                            // > 2 hours in FUTURE
                                                                            isActionable = false;
                                                                            reason = 'Too Early';
                                                                        } else if (hoursDiff > 2) {
                                                                            // > 2 hours in PAST (Missed)
                                                                            // V10.24 FEATURE: Allow "Grace Period" (Undo/Take) for another 2 hours (Total 4h)
                                                                            if (hoursDiff <= 4) {
                                                                                // Status is Missed, but still actionable (Grace Period)
                                                                                reason = 'Missed'; // Display as Missed, but actionable
                                                                            } else {
                                                                                isActionable = false;
                                                                                reason = 'Missed';
                                                                            }
                                                                        }
                                                                    }
                                                                }

                                                                // Manual 'Missed' status check
                                                                if (reminder.status === 'missed') {
                                                                    // If manually missed (or auto), check grace period again?
                                                                    // We re-calculated hoursDiff above.
                                                                    // If we are here, isActionable might be true (from logic above)
                                                                    // If hoursDiff is < 4, we allow it.
                                                                    // But if hoursDiff is unknown (no time?), default lock?
                                                                    if (!reminder.displayTime) {
                                                                        isActionable = false;
                                                                        reason = 'Missed';
                                                                    }
                                                                }

                                                                return (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            if (!isActionable) return;

                                                                            // If it's a "Missed" item being taken late, maybe prompt or just take it?
                                                                            // Just take it.
                                                                            dataService.logReminderStatus(reminder.id, reminder.instanceKey, 'taken');
                                                                            setTriggerReload(prev => prev + 1);
                                                                        }}
                                                                        disabled={!isActionable}
                                                                        className={`h-12 md:h-auto min-w-[3rem] w-auto px-3 md:px-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 font-bold ${isActionable
                                                                            ? (reason === 'Missed'
                                                                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/20' // Missed but actionable
                                                                                : 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20')
                                                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed shadow-none'
                                                                            }`}
                                                                    >
                                                                        {isActionable ? (
                                                                            <>
                                                                                {/* Icon */}
                                                                                {reason === 'Missed' ? <RefreshCcw size={18} className="md:hidden" /> : <Check size={20} className="md:hidden" />}

                                                                                <span className="hidden md:inline font-bold">
                                                                                    {reason === 'Missed'
                                                                                        ? 'Take Late'
                                                                                        : (reminder.type === 'Medication' ? 'Take' : 'Done')}
                                                                                </span>
                                                                            </>
                                                                        ) : (
                                                                            <span className="text-xs font-bold uppercase">{reason}</span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })()}

                                                            {(reminder.status === 'taken' || reminder.status === 'done') && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (confirm('Mark this reminder as NOT done?')) {
                                                                            dataService.logReminderStatus(reminder.id, reminder.instanceKey, 'upcoming');
                                                                            setTriggerReload(prev => prev + 1);
                                                                        }
                                                                    }}
                                                                    className="h-12 w-12 text-green-600 bg-green-100 rounded-xl hover:bg-green-200 transaction-colors flex items-center justify-center shrink-0"
                                                                    title="Undo Completion"
                                                                >
                                                                    <RefreshCcw size={18} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            </React.Fragment>
                                        );
                                    })}

                                    {/* Fallback if ALL items are past and none future found in range, render separator at end?
                                        Maybe not needed. Usually "Now" is moving. 
                                    */}

                                </AnimatePresence>
                            </div>
                        </div>
                    );
                })}

                {activeReminders.length === 0 && (
                    <div className="text-center py-20 text-gray-400 flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <Bell size={32} className="opacity-50" />
                        </div>
                        <p className="font-medium">{searchQuery ? 'No matching results found.' : 'No reminders for this time.'}</p>
                        <p className="text-sm opacity-60">{searchQuery ? 'Try a different keyword.' : 'Tap + to add one.'}</p>
                    </div>
                )}
            </div>

            <div className="fixed bottom-24 md:bottom-10 right-6 md:right-10 z-50">
                <button
                    onClick={() => { setEditingReminder(null); setIsModalOpen(true); }}
                    className="w-16 h-16 bg-gradient-to-tr from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full shadow-lg shadow-orange-500/40 flex items-center justify-center transform hover:scale-105 transition-all text-2xl"
                >
                    <Plus size={32} />
                </button>
            </div>
            {/* Text Preview Modal */}
            <TextPreviewModal
                isOpen={!!previewData}
                onClose={() => setPreviewData(null)}
                title={previewData?.title || 'Preview'}
                text={previewData?.text || ''}
                searchQuery={searchQuery}
            />

        </div>
    );
};

export default RemindersPage;
