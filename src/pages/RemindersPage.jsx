import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AddReminderModal from '../components/reminders/AddReminderModal';
import { dataService } from '../services/data';
import { useLanguage } from '../context/LanguageContext';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Search, Calendar, Clock, Bell, Share2, MoreVertical, CheckCircle, XCircle, Filter, ChevronLeft, ChevronRight, Mic, AlertTriangle, Edit2, Trash2, Check, ArrowRightLeft, Sun, Moon, Settings, RefreshCcw, Droplets, Dumbbell, Star, Pill } from 'lucide-react';

const RemindersPage = () => {
    const { t } = useLanguage();
    const location = useLocation();
    const navigate = useNavigate();
    const [filter, setFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'upcoming', 'done', 'missed'
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingReminder, setEditingReminder] = useState(null);

    const [selectedDate, setSelectedDate] = useState(new Date());
    const [reminders, setReminders] = useState([]);
    const [triggerReload, setTriggerReload] = useState(0);
    const [startVoice, setStartVoice] = useState(false);

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

        if (location.state?.openAdd) {
            setEditingReminder(null);
            setIsModalOpen(true);
            // Clear state so it doesn't reopen on refresh, but keep other state if needed
            window.history.replaceState({}, document.title);
        }

        return () => window.removeEventListener('storage-update', handleStorageUpdate);
    }, [selectedDate, triggerReload, location.state]);

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

        if (location.state?.convertFromNote) {
            // Guard: Only initialize if not already editing to prevet overwrites during re-renders
            if (!editingReminder) {
                const note = location.state.convertFromNote;
                const draftReminder = dataService.convertNoteToReminder(note);
                setEditingReminder(draftReminder);
                setIsModalOpen(true);
                // Clear state to prevent loop using Navigate to update React Router context
                navigate(location.pathname, { replace: true, state: {} });
            }
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

    const displayedReminders = reminders.filter(r => {
        if (!r) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (filter !== 'All' && r.type !== filter) return false;
        return true;
    });

    const activeReminders = displayedReminders;

    const groupedReminders = { Morning: [], Afternoon: [], Evening: [] };
    displayedReminders.forEach(r => {
        if (!r.displayTime) {
            groupedReminders.Morning.push(r); // Defaults to morning if no time
            return;
        }
        const hour = parseInt(r.displayTime.split(':')[0]);
        if (hour < 12) groupedReminders.Morning.push(r);
        else if (hour < 17) groupedReminders.Afternoon.push(r);
        else groupedReminders.Evening.push(r);
    });

    // Dynamic Categories
    const allTypes = new Set(dataService.getReminders().map(r => r.type || 'Other'));
    // Always include standard ones if they exist, or just rely on data.
    // Ensure 'Medication' is always there if user wants to add it? No, filter should show what exists.
    const categories = [
        { name: 'All', count: null },
        ...Array.from(allTypes).filter(t => t).map(type => ({
            name: type,
            count: reminders.filter(r => r.type === type).length
        }))
    ];

    return (
        <div className="max-w-5xl mx-auto pb-24 md:pb-10 relative min-h-screen">


            {/* Header & Filters */}
            <div className="sticky top-20 z-50 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm -mx-4 px-4 py-2 border-b border-gray-200 dark:border-gray-800 md:static md:bg-transparent md:p-0 md:border-none md:mb-6 transition-all">
                <div className="flex flex-col gap-3">
                    {/* Date Nav */}
                    <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-2 md:p-3 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 relative z-50">
                        <button onClick={(e) => { e.stopPropagation(); handleDateChange(-1); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"><ChevronLeft size={20} /></button>
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 font-bold text-base md:text-lg text-gray-900 dark:text-gray-100">
                                <Calendar size={18} className="text-orange-500" />
                                {new Date(selectedDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </div>
                            {new Date(selectedDate).setHours(0, 0, 0, 0) !== new Date().setHours(0, 0, 0, 0) && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); setSelectedDate(new Date()); }}
                                    className="px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[10px] md:text-xs font-bold rounded-lg uppercase tracking-wide"
                                >
                                    Today
                                </button>
                            )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); handleDateChange(1); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"><ChevronRight size={20} /></button>
                    </div>

                    {/* Filter Chips */}
                    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 items-center">
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
                                    <button onClick={() => confirmDelete('instance')} className="w-full py-3 px-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Delete This Event Only</button>
                                    <button onClick={() => confirmDelete('series')} className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-500/20">Delete Entire Series</button>
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
                {['Morning', 'Afternoon', 'Evening'].map(group => (
                    groupedReminders[group].length > 0 && (
                        <div key={group} className="animate-fade-in">
                            <h3 className="text-base font-bold text-gray-400 mb-3 flex items-center gap-2 px-1 uppercase tracking-wider text-xs">
                                {group === 'Morning' && <Sun className="text-orange-400" size={16} />}
                                {group === 'Afternoon' && <Sun className="text-yellow-500" size={16} />}
                                {group === 'Evening' && <Moon className="text-indigo-400" size={16} />}
                                {group}
                            </h3>
                            <div className="space-y-3">
                                <AnimatePresence>
                                    {groupedReminders[group].map(reminder => (
                                        <motion.div
                                            layout
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, x: -100 }}
                                            key={reminder.uniqueId || reminder.id}
                                            id={`reminder-${reminder.uniqueId || reminder.id}`}
                                            onClick={() => handleEdit(reminder)}
                                            className={`card p-0 overflow-hidden flex flex-col md:flex-row shadow-sm hover:shadow-md transition-all groups border-l-4 cursor-pointer ${reminder.status === 'taken' || reminder.status === 'done' ? 'opacity-60 bg-gray-50 dark:bg-gray-800/50 border-gray-300 dark:border-gray-700 grayscale-[0.5]' :
                                                reminder.status === 'snoozed' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-400' :
                                                    reminder.isImportant ? 'border-red-500 bg-white dark:bg-gray-800' : 'border-orange-500 bg-white dark:bg-gray-800'
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
                                                    <div className="min-w-0">
                                                        <h3 className="font-bold text-base md:text-lg text-gray-900 dark:text-gray-100 truncate leading-tight">{reminder.title}</h3>
                                                        {reminder.instructions && <p className="text-gray-500 dark:text-gray-400 text-xs md:text-sm truncate">{reminder.instructions}</p>}
                                                        <div className="flex items-center gap-2 mt-1 text-xs font-bold text-gray-400 dark:text-gray-500">
                                                            <Clock size={12} /> {reminder.displayTime}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 shrink-0">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); initiateDelete(reminder); }}
                                                        className="p-2 md:p-3 rounded-xl bg-gray-100 dark:bg-gray-700 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                                                    >
                                                        <Trash2 size={18} />
                                                    </button>

                                                    {(() => {
                                                        // Action Window Logic
                                                        if (reminder.status === 'taken' || reminder.status === 'done') return null;

                                                        let isActionable = true;
                                                        let reason = '';

                                                        if (reminder.displayTime) {
                                                            const [h, m] = reminder.displayTime.split(':').map(Number);
                                                            const reminderDate = new Date(selectedDate);
                                                            reminderDate.setHours(h, m, 0, 0);

                                                            const now = new Date();
                                                            const diffMs = now.getTime() - reminderDate.getTime();
                                                            const hoursDiff = diffMs / (1000 * 60 * 60);

                                                            if (hoursDiff < -2) {
                                                                isActionable = false;
                                                                reason = 'Too Early';
                                                            } else if (hoursDiff > 2) {
                                                                isActionable = false;
                                                                reason = 'Missed';
                                                            }
                                                        }

                                                        if (reminder.status === 'missed') {
                                                            isActionable = false;
                                                            reason = 'Missed';
                                                        }

                                                        return (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (!isActionable) return;
                                                                    dataService.logReminderStatus(reminder.id, reminder.instanceKey, 'taken');
                                                                    setTriggerReload(prev => prev + 1);
                                                                }}
                                                                disabled={!isActionable}
                                                                className={`p-2 md:px-4 md:py-2 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${isActionable
                                                                    ? 'bg-orange-500 hover:bg-orange-600 text-white shadow-orange-500/20'
                                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed shadow-none'
                                                                    }`}
                                                            >
                                                                {isActionable ? (
                                                                    <>
                                                                        <Check size={20} className="md:hidden" />
                                                                        <span className="hidden md:inline font-bold">{reminder.type === 'Medication' ? 'Take' : 'Done'}</span>
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
                                                            className="p-2 text-green-600 bg-green-100 rounded-full hover:bg-green-200 transaction-colors"
                                                            title="Undo Completion"
                                                        >
                                                            <RefreshCcw size={16} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    )
                ))}

                {activeReminders.length === 0 && (
                    <div className="text-center py-20 text-gray-400 flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <Bell size={32} className="opacity-50" />
                        </div>
                        <p className="font-medium">No reminders for this time.</p>
                        <p className="text-sm opacity-60">Tap + to add one.</p>
                    </div>
                )}
            </div>

            <div className="fixed bottom-24 md:bottom-10 right-6 md:right-10 z-40">
                <button
                    onClick={() => { setEditingReminder(null); setIsModalOpen(true); }}
                    className="w-16 h-16 bg-gradient-to-tr from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full shadow-lg shadow-orange-500/40 flex items-center justify-center transform hover:scale-105 transition-all text-2xl"
                >
                    <Plus size={32} />
                </button>
            </div>
        </div>
    );
};

export default RemindersPage;
