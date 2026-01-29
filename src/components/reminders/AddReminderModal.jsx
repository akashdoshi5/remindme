import React, { useState, useEffect } from 'react';
import { X, Clock, Calendar, Bell, Mic, MicOff, Pill, Upload, FileText, Trash2, Sun, Moon, Coffee } from 'lucide-react';
import { useVoice } from '../../hooks/useVoice';
import { fileStorage } from '../../services/fileStorage';

const AddReminderModal = ({ isOpen, onClose, onSave, onDelete, reminderToEdit, autoStartListening = false }) => {
    if (!isOpen) return null;

    // Standard State
    const [title, setTitle] = useState('');
    const [type, setType] = useState('Medication');
    const [time, setTime] = useState('');
    const [frequency, setFrequency] = useState('Daily');
    const [instructions, setInstructions] = useState('');
    const [isImportant, setIsImportant] = useState(false);
    const [editScope, setEditScope] = useState('all'); // 'this' or 'all'

    // Custom Days
    const [customDays, setCustomDays] = useState([]);
    const [showCustomDays, setShowCustomDays] = useState(false);

    // Medication Course State
    const [isCourse, setIsCourse] = useState(false);
    const [medDuration, setMedDuration] = useState(7);
    const [medFrequencies, setMedFrequencies] = useState(['breakfast']);
    const [medTimes, setMedTimes] = useState({ breakfast: '08:00', lunch: '13:00', dinner: '20:00' });
    const [startDate, setStartDate] = useState(new Date().toLocaleDateString('en-CA')); // Default to Today
    const [durationDays, setDurationDays] = useState(null); // Null means infinite/ongoing by default for non-medication
    const [files, setFiles] = useState([]);

    // Voice Hook
    const { isListening, transcript, startListening, stopListening, resetTranscript, isSupported } = useVoice();
    const [activeField, setActiveField] = useState(null); // 'title' or 'instructions'

    useEffect(() => {
        if (reminderToEdit) {
            setTitle(reminderToEdit.title);
            setType(reminderToEdit.type);
            setTime(reminderToEdit.displayTime || reminderToEdit.time);
            setInstructions(reminderToEdit.instructions || '');
            setIsImportant(reminderToEdit.isImportant);

            // Files
            setFiles(reminderToEdit.files || []);

            // Handle Course Schedule
            if (reminderToEdit.schedule && reminderToEdit.schedule.type === 'recurring') {
                setIsCourse(true);
                setMedFrequencies(reminderToEdit.schedule.frequency || []);
                setMedTimes({ ...medTimes, ...reminderToEdit.schedule.times });
                setMedDuration(reminderToEdit.schedule.durationDays || 7);
                setType('Medication');

                // Detect Period for Single Instance Edit if not explicit
                if (!reminderToEdit.period && reminderToEdit.time) {
                    const [h, m] = reminderToEdit.time.split(':').map(Number);
                    const mins = h * 60 + m;
                    // Bfast: 7:00 (420) - 10:30 (630)
                    // Lunch: 11:00 (660) - 15:00 (900)
                    // Dinner: 18:00 (1080) - 22:00 (1320)
                    if (mins >= 420 && mins <= 630) reminderToEdit.period = 'breakfast';
                    else if (mins >= 660 && mins <= 900) reminderToEdit.period = 'lunch';
                    else if (mins >= 1080 && mins <= 1320) reminderToEdit.period = 'dinner';
                }
            } else {
                setIsCourse(false);
                const freq = reminderToEdit.frequency || 'Daily';
                const standardOptions = ['Daily', 'Weekly', 'Once', 'Every 1 Hour', 'Every 2 Hours', 'Every 3 Hours', 'Every 4 Hours'];
                if (standardOptions.includes(freq)) {
                    setFrequency(freq);
                    setShowCustomDays(false);
                } else {
                    setFrequency('Custom');
                    setShowCustomDays(true);
                    if (freq.includes(',') || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].some(d => freq.includes(d))) {
                        setCustomDays(freq.split(', '));
                    } else {
                        setCustomDays([]);
                    }
                }

                // Initialize Start Date correctly
                if (reminderToEdit.instanceKey) {
                    setStartDate(reminderToEdit.instanceKey.split('_')[0]);
                } else {
                    setStartDate(reminderToEdit.schedule?.startDate || reminderToEdit.date || new Date().toISOString().split('T')[0]);
                }
                setDurationDays(reminderToEdit.schedule?.durationDays || null);
            }
        } else {
            // Reset for new
            setTitle('');
            setType('Medication');
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            setTime(timeStr);
            setFrequency('Daily');
            setInstructions('');
            setIsImportant(false);
            setCustomDays([]);
            setShowCustomDays(false);
            setIsCourse(false);
            setMedFrequencies(['breakfast', 'dinner']);
            setMedDuration(7);
            setFiles([]);
            setEditScope('all');
            setStartDate(new Date().toISOString().split('T')[0]);
        }
    }, [reminderToEdit, isOpen]);

    // Auto-start voice check
    useEffect(() => {
        if (isOpen && autoStartListening && isSupported) {
            setActiveField('title');
            resetTranscript();
            startListening();
        } else if (!isOpen) {
            stopListening();
            setActiveField(null);
        }
    }, [isOpen, autoStartListening]);

    // Update fields when transcript changes
    useEffect(() => {
        if (activeField === 'title') {
            setTitle(prev => prev + (prev ? ' ' : '') + transcript);
        } else if (activeField === 'instructions') {
            setInstructions(prev => prev + (prev ? ' ' : '') + transcript);
        }
    }, [transcript, activeField]);

    const handleMicClick = (field) => {
        if (isListening && activeField === field) {
            stopListening();
            setActiveField(null);
        } else {
            setActiveField(field);
            resetTranscript();
            startListening();
        }
    };

    const toggleDay = (day) => {
        setCustomDays(prev => {
            if (prev.includes(day)) {
                return prev.filter(d => d !== day);
            } else {
                const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                const newDays = [...prev, day];
                return newDays.sort((a, b) => weekDays.indexOf(a) - weekDays.indexOf(b));
            }
        });
    };

    const handleFrequencyChange = (e) => {
        const val = e.target.value;
        setFrequency(val);
        if (val === 'Custom') {
            setShowCustomDays(true);
            if (customDays.length === 0) setCustomDays(['Mon', 'Wed', 'Fri']);
        } else {
            setShowCustomDays(false);
        }
    };

    const [isUploading, setIsUploading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleFileChange = async (e) => {
        setIsUploading(true);
        const selected = Array.from(e.target.files);
        try {
            const processed = await Promise.all(selected.map(async (file) => {
                const storageData = await fileStorage.saveFile(file);
                return {
                    id: storageData.id, // Keep for legacy if needed
                    storageData: storageData,
                    name: file.name,
                    type: file.type,
                    size: file.size,
                    extractedText: ''
                };
            }));
            setFiles(prev => [...prev, ...processed]);
        } catch (error) {
            console.error("Upload failed", error);
            alert("Failed to upload file.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (editScope === 'this' && reminderToEdit) {
            let targetDateStr = startDate;
            if (reminderToEdit.instanceKey) {
                targetDateStr = reminderToEdit.instanceKey.split('_')[0];
            } else {
                targetDateStr = startDate || new Date().toISOString().split('T')[0];
            }

            const targetDateTime = new Date(`${targetDateStr}T${time}`);
            const now = new Date();

            if (reminderToEdit.status !== 'missed') {
                if (targetDateTime < now) {
                    alert("Please select a future time.");
                    return;
                }
            }
        }

        const finalFiles = files.map(f => {
            if (f.storageData) {
                return {
                    id: f.storageData.id,
                    name: f.name,
                    type: f.type,
                    url: f.storageData.url,
                    storageType: f.storageData.type,
                    path: f.storageData.path,
                    extractedText: f.extractedText || ''
                };
            }
            return f;
        });

        const data = {
            title,
            type,
            instructions,
            isImportant,
            isShared: reminderToEdit ? reminderToEdit.isShared : false,
            status: reminderToEdit ? reminderToEdit.status : 'upcoming',
            id: reminderToEdit ? reminderToEdit.id : undefined,
            files: finalFiles,
            date: startDate || new Date().toISOString().split('T')[0]
        };

        if (type === 'Medication' && isCourse) {
            if (editScope !== 'this') {
                data.schedule = {
                    type: 'recurring',
                    frequency: medFrequencies,
                    times: medTimes,
                    startDate: startDate || new Date().toISOString().split('T')[0],
                    durationDays: medDuration
                };
                data.frequency = 'Course';
                data.time = '';
            } else {
                // Editing single instance of a course -> Ensure time is set!
                data.time = time;
            }
        } else {
            let finalFrequency = frequency;
            if (frequency === 'Custom') {
                finalFrequency = customDays.join(', ');
            }
            if (editScope !== 'this') {
                data.frequency = finalFrequency;
                data.schedule = {
                    type: 'basic',
                    startDate: startDate || new Date().toISOString().split('T')[0],
                    durationDays: durationDays,
                    times: { default: time }
                };
            }
            data.time = time;
        }

        setIsSaving(true);

        try {
            await onSave(data, editScope === 'this' ? reminderToEdit.instanceKey : null);
            onClose();
        } catch (error) {
            console.error("Save failed", error);
            alert("Failed to save reminder. Please try again.");
            setIsSaving(false);
        }
    };


    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] md:p-4">
            <div className="bg-white dark:bg-gray-900 w-full md:max-w-md flex flex-col h-full md:h-auto md:max-h-[85vh] animate-fade-in shadow-2xl transition-colors duration-300 md:rounded-2xl border border-gray-100 dark:border-gray-800 relative z-[100] overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold dark:text-white">{reminderToEdit ? 'Edit Reminder' : 'Add Reminder'}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={24} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 relative">
                    <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin p-4 pb-32 md:p-6 flex flex-col gap-5">
                        {/* Instance Toggle */}
                        {reminderToEdit && reminderToEdit.instanceKey && reminderToEdit.frequency !== 'Once' && (
                            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-2 rounded-lg border border-yellow-100 dark:border-yellow-800 flex p-1">
                                <button
                                    type="button"
                                    onClick={() => setEditScope('this')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${editScope === 'this' ? 'bg-white shadow text-yellow-700 dark:bg-gray-800 dark:text-yellow-400' : 'text-gray-500 hover:bg-yellow-100/50 dark:text-gray-400'}`}
                                >
                                    This Event Only
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditScope('all')}
                                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors ${editScope === 'all' ? 'bg-white shadow text-yellow-700 dark:bg-gray-800 dark:text-yellow-400' : 'text-gray-500 hover:bg-yellow-100/50 dark:text-gray-400'}`}
                                >
                                    All Future Events
                                </button>
                            </div>
                        )}

                        {/* Title & Type Row */}
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Title</label>
                                    {isSupported && (
                                        <button type="button" onClick={() => handleMicClick('title')} className={`text-xs flex items-center gap-1 ${isListening && activeField === 'title' ? 'text-red-500 animate-pulse' : 'text-orange-600 dark:text-orange-400'}`}>
                                            {isListening && activeField === 'title' ? <MicOff size={14} /> : <Mic size={14} />}
                                        </button>
                                    )}
                                </div>
                                <input
                                    required
                                    type="text"
                                    placeholder="e.g., Medication"
                                    className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600 text-lg font-semibold"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                />
                            </div>

                            <div className="w-1/3 min-w-[130px]">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                                <select
                                    className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white h-[52px]"
                                    value={type}
                                    onChange={(e) => setType(e.target.value)}
                                >
                                    <option>Medication</option>
                                    <option>View Only</option>
                                    <option>Appointments</option>
                                    <option>Water</option>
                                    <option>Exercise</option>
                                    <option>Other</option>
                                </select>
                            </div>
                        </div>

                        {/* Medication Course Toggle */}
                        {type === 'Medication' && editScope !== 'this' && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="p-1.5 bg-blue-100 dark:bg-blue-800/40 rounded-lg text-blue-600 dark:text-blue-300"><Pill size={16} /></span>
                                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">Complex Schedule? (Course)</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={isCourse} onChange={e => setIsCourse(e.target.checked)} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                                </label>
                            </div>
                        )}

                        {/* Unified Schedule Section */}
                        <div className="bg-gray-50 dark:bg-gray-800/30 p-4 rounded-xl border border-gray-100 dark:border-gray-800 space-y-4">
                            <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Schedule</label>

                            {/* Row 1: Start Date & Time */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                                    <input
                                        type="date"
                                        className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                </div>

                                {!isCourse && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                                        <input
                                            required
                                            type="time"
                                            className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                            value={time}
                                            onChange={(e) => setTime(e.target.value)}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Complex Course UI */}
                            {isCourse && type === 'Medication' ? (
                                <div className="animate-fade-in space-y-4">
                                    {editScope === 'this' ? (
                                        // Single Instance Edit View
                                        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-xl border border-orange-200 dark:border-orange-800">
                                            <div className="flex items-center gap-2 mb-3">
                                                {medFrequencies.includes('breakfast') && (!activeField || activeField === 'breakfast') && <Coffee size={20} className="text-orange-600 dark:text-orange-400" />}
                                                {medFrequencies.includes('lunch') && (!activeField || activeField === 'lunch') && <Sun size={20} className="text-orange-600 dark:text-orange-400" />}
                                                {medFrequencies.includes('dinner') && (!activeField || activeField === 'dinner') && <Moon size={20} className="text-orange-600 dark:text-orange-400" />}
                                                <div>
                                                    <h3 className="font-bold text-gray-900 dark:text-white">
                                                        Editing {reminderToEdit?.period ?
                                                            reminderToEdit.period.charAt(0).toUpperCase() + reminderToEdit.period.slice(1) :
                                                            'Scheduled'} Dose
                                                    </h3>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">Updates only this specific event.</p>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Time</label>
                                                <input
                                                    required
                                                    type="time"
                                                    className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                                    value={time}
                                                    onChange={(e) => setTime(e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        // Full Course Edit View
                                        <>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Take With</label>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[
                                                        { id: 'breakfast', label: 'Breakfast', icon: <Coffee size={16} /> },
                                                        { id: 'lunch', label: 'Lunch', icon: <Sun size={16} /> },
                                                        { id: 'dinner', label: 'Dinner', icon: <Moon size={16} /> }
                                                    ].map(slot => (
                                                        <div
                                                            key={slot.id}
                                                            className={`flex flex-col rounded-xl border transition-all overflow-hidden ${medFrequencies.includes(slot.id)
                                                                ? 'bg-orange-50 border-orange-500 shadow-sm dark:bg-orange-900/20 dark:border-orange-500'
                                                                : 'bg-white border-gray-200 opacity-80 hover:opacity-100 dark:bg-gray-800 dark:border-gray-700'}`}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (medFrequencies.includes(slot.id)) setMedFrequencies(prev => prev.filter(f => f !== slot.id));
                                                                    else setMedFrequencies(prev => [...prev, slot.id]);
                                                                }}
                                                                className={`flex flex-col items-center gap-1 p-2 w-full ${medFrequencies.includes(slot.id) ? 'text-orange-700 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'}`}
                                                            >
                                                                {slot.icon}
                                                                <span className="text-xs font-bold">{slot.label}</span>
                                                            </button>

                                                            {medFrequencies.includes(slot.id) && (
                                                                <div className="px-2 pb-2">
                                                                    <input
                                                                        type="time"
                                                                        value={medTimes[slot.id]}
                                                                        onChange={(e) => setMedTimes(prev => ({ ...prev, [slot.id]: e.target.value }))}
                                                                        className="w-full text-xs p-1 bg-white border border-orange-200 rounded text-center font-mono text-gray-700 focus:outline-none focus:border-orange-500 dark:bg-gray-900 dark:border-orange-800 dark:text-white"
                                                                    />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Duration for Course */}
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Course Duration (Days)</label>
                                                <div className="flex items-center gap-2 h-[40px]">
                                                    <input
                                                        type="range"
                                                        min="1" max="90"
                                                        value={medDuration}
                                                        onChange={e => setMedDuration(parseInt(e.target.value))}
                                                        className="flex-1 accent-orange-500 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                    <span className="w-12 text-right font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">{medDuration}d</span>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (

                                /* Simple Frequency UI */
                                <div className="animate-fade-in space-y-4">
                                    {editScope !== 'this' && (
                                        <>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Repeats?</label>
                                                    <select
                                                        className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                                        value={frequency}
                                                        onChange={handleFrequencyChange}
                                                    >
                                                        <option value="Once">No (Once)</option>
                                                        <option value="Daily">Daily</option>
                                                        <option value="Weekly">Weekly</option>
                                                        <option value="Every 1 Hour">Hourly</option>
                                                        <option value="Every 4 Hours">Every 4h</option>
                                                        <option value="Custom">Custom</option>
                                                    </select>
                                                </div>

                                                {/* Ends After - Only for Recurring */}
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ends?</label>
                                                    <select
                                                        className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                                        value={durationDays || ''}
                                                        onChange={(e) => setDurationDays(e.target.value ? parseInt(e.target.value) : null)}
                                                        disabled={frequency === 'Once'}
                                                    >
                                                        <option value="">Never</option>
                                                        <option value="3">3 Days</option>
                                                        <option value="5">5 Days</option>
                                                        <option value="7">1 Week</option>
                                                        <option value="14">2 Weeks</option>
                                                        <option value="30">30 Days</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {showCustomDays && (
                                                <div className="flex justify-between mt-1 px-1">
                                                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                                        <button
                                                            key={day}
                                                            type="button"
                                                            onClick={() => toggleDay(day)}
                                                            className={`w-9 h-9 rounded-full text-xs font-bold transition-all border ${customDays.includes(day)
                                                                ? 'bg-orange-500 border-orange-500 text-white shadow-md transform scale-105'
                                                                : 'bg-white border-gray-200 text-gray-500 hover:border-orange-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400'
                                                                }`}
                                                        >
                                                            {day.charAt(0)}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Files Section */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Attachments</label>
                            <div className="flex flex-col gap-2">
                                {files.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded">
                                        <span className="text-xs truncate max-w-[150px] dark:text-gray-300">{file.name}</span>
                                        <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-400"><Trash2 size={14} /></button>
                                    </div>
                                ))}

                                {isUploading && (
                                    <div className="flex items-center justify-center p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-gray-500">
                                        <span className="animate-spin mr-2">⏳</span> Uploading...
                                    </div>
                                )}

                                <label className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-gray-500 dark:text-gray-400 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Upload size={18} />
                                    <span className="text-sm">Attach File (Rx, Photo)</span>
                                    <input type="file" multiple className="hidden" onChange={handleFileChange} disabled={isUploading} />
                                </label>
                            </div>
                        </div>

                        {/* Instructions */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Instructions (Optional)</label>
                                {isSupported && (
                                    <button type="button" onClick={() => handleMicClick('instructions')} className={`text-xs flex items-center gap-1 ${isListening && activeField === 'instructions' ? 'text-red-500 animate-pulse' : 'text-orange-600 dark:text-orange-400'}`}>
                                        {isListening && activeField === 'instructions' ? <MicOff size={14} /> : <Mic size={14} />}
                                        {isListening && activeField === 'instructions' ? 'Stop Listening' : 'Dictate'}
                                    </button>
                                )}
                            </div>
                            <textarea
                                rows="2"
                                placeholder="e.g., Take with food"
                                className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none resize-none focus:ring-2 focus:ring-orange-500 transition-all placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                            ></textarea>
                        </div>

                        <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 p-3 rounded-xl border border-orange-100 dark:border-orange-800/50">
                            <input
                                type="checkbox"
                                id="important"
                                className="w-5 h-5 text-orange-600 rounded focus:ring-orange-500 accent-orange-600"
                                checked={isImportant}
                                onChange={(e) => setIsImportant(e.target.checked)}
                            />
                            <label htmlFor="important" className="text-gray-900 dark:text-gray-100 font-medium cursor-pointer">Mark as Important</label>
                        </div>
                    </div>

                    <div className="fixed bottom-0 left-0 right-0 p-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-[110] md:static md:z-30 md:border-t md:shrink-0">
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3.5 text-lg font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-colors"
                            >
                                Close
                            </button>
                            <button type="submit" disabled={isUploading || isSaving} className="btn btn-primary flex-[2] py-3.5 text-lg shadow-orange-500/25 disabled:opacity-70 disabled:grayscale">
                                {isUploading ? 'Uploading...' : isSaving ? 'Saving...' : 'Save Reminder'}
                            </button>
                        </div>
                    </div>
                </form>
            </div >
        </div >
    );
};

export default AddReminderModal;
