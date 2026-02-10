import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, Bell, Repeat, FileText, Check, ChevronRight, AlertTriangle, Mic, MicOff, Upload, Download, Trash2, Eye, Coffee, Sun, Moon, ChevronLeft, Pill } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useVoice } from '../../hooks/useVoice';
import { fileStorage } from '../../services/fileStorage';
import { BackButtonManager } from '../../services/BackButtonManager';

const AddReminderModal = ({ isOpen, onClose, onSave, onDelete, reminderToEdit, autoStartListening = false }) => {
    // Note: Early return moved to end of hook declarations (React Rules of Hooks compliance)

    // Standard State
    const [title, setTitle] = useState('');
    const [type, setType] = useState('Other');
    const [time, setTime] = useState('');
    const [frequency, setFrequency] = useState('Once');
    const [instructions, setInstructions] = useState('');
    const [isImportant, setIsImportant] = useState(false);
    const [soundType, setSoundType] = useState('default'); // 'default' or 'alarm'
    const [editScope, setEditScope] = useState('all'); // 'this' or 'all'

    // AUDIO PLAYBACK STATE
    const [playingFile, setPlayingFile] = useState(null); // URL or ID
    const audioRef = useRef(null);

    const handlePlayAudio = (url) => {
        if (playingFile === url) {
            audioRef.current?.pause();
            setPlayingFile(null);
        } else {
            if (audioRef.current) {
                audioRef.current.pause();
            }
            const audio = new Audio(url);
            audio.onended = () => setPlayingFile(null);
            audio.play().catch(e => console.error("Audio play error", e));
            audioRef.current = audio;
            setPlayingFile(url);
        }
    };

    // Cleanup audio on close
    useEffect(() => {
        if (!isOpen) {
            audioRef.current?.pause();
            setPlayingFile(null);
        }
    }, [isOpen]);

    // Custom Days
    const [customDays, setCustomDays] = useState([]);
    const [showCustomDays, setShowCustomDays] = useState(false);


    // Medication Course State
    const [isCourse, setIsCourse] = useState(false);
    const [medDuration, setMedDuration] = useState(7);
    const [medFrequencies, setMedFrequencies] = useState(['breakfast']);
    const [medTimes, setMedTimes] = useState({ breakfast: '08:00', lunch: '13:00', dinner: '20:00' });

    // Fix: Use explicit local date construction to avoid Timezone shifts (e.g. UTC vs Local)
    const [startDate, setStartDate] = useState(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    });
    const [durationDays, setDurationDays] = useState(30); // Default to 30 days (1 Month)
    const [files, setFiles] = useState([]);
    // Delete Confirmation State
    const [deleteConfig, setDeleteConfig] = useState(null); // { id, title, isRecurring, instanceKey }
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange({ target: { files: e.dataTransfer.files } });
        }
    };

    // Voice Hook
    const { isListening, transcript, startListening, stopListening, resetTranscript, isSupported } = useVoice();
    const [activeField, setActiveField] = useState(null); // 'title' or 'instructions'
    const handleSubmitRef = React.useRef(null); // Ref to access latest submit function

    const [previewFile, setPreviewFile] = useState(null);

    // Register Back Button for Preview
    useEffect(() => {
        if (previewFile) {
            const unregister = BackButtonManager.register(async () => {
                setPreviewFile(null);
                return true;
            });
            return unregister;
        }
    }, [previewFile]);

    // Back Button Handling
    useEffect(() => {
        if (!isOpen) return;

        const unregister = BackButtonManager.register(async () => {
            console.log("Back button caught by AddReminderModal");
            if (handleSubmitRef.current) {
                try {
                    await handleSubmitRef.current();
                } catch (e) {
                    onClose();
                }
            } else {
                onClose();
            }
            return true;
        });

        return unregister;
    }, [isOpen, onClose]);

    useEffect(() => {
        if (reminderToEdit) {
            setTitle(reminderToEdit.title);
            setType(reminderToEdit.type);
            setTime(reminderToEdit.displayTime || reminderToEdit.time);
            setInstructions(reminderToEdit.instructions || '');
            setInstructions(reminderToEdit.instructions || '');
            setIsImportant(reminderToEdit.isImportant);
            setSoundType(reminderToEdit.soundType || 'default');
            setFiles(reminderToEdit.files || []);

            // Instance Scope Logic
            console.log("AddReminderModal: Init with reminder:", reminderToEdit.title, "InstanceKey:", reminderToEdit.instanceKey);
            if (reminderToEdit.instanceKey) {
                setEditScope('this');
            } else {
                setEditScope('all');
            }

            setDurationDays(reminderToEdit.schedule?.durationDays || 30);

            // Initial Start Date (Precedence: Instance Key -> Schedule -> Date -> Today)
            if (reminderToEdit.instanceKey) {
                setStartDate(reminderToEdit.instanceKey.split('_')[0]);
            } else {
                setStartDate(reminderToEdit.schedule?.startDate || reminderToEdit.date || new Date().toISOString().split('T')[0]);
            }

            // Handle Course Schedule
            if (reminderToEdit.schedule && reminderToEdit.schedule.type === 'recurring') {
                setIsCourse(true);
                setMedFrequencies(reminderToEdit.schedule.frequency || []);
                setMedTimes({ ...medTimes, ...reminderToEdit.schedule.times });
                setMedDuration(reminderToEdit.schedule.durationDays || 7);
                setType('Medication');
            } else if (reminderToEdit.type === 'Medication') {
                setIsCourse(false);
                // Detect Period for Single Instance Edit if not explicit
                if (!reminderToEdit.period && reminderToEdit.time) {
                    const [h, m] = reminderToEdit.time.split(':').map(Number);
                    const mins = h * 60 + m;
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
                    if (freq && (freq.includes(',') || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].some(d => freq.includes(d)))) {
                        setCustomDays(freq.split(', '));
                    } else {
                        setCustomDays([]);
                    }
                }
            }
        } else if (isOpen) {
            // NEW REMINDER: Reset All State
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            setStartDate(`${y}-${m}-${d}`);

            setTitle('');
            setType('Other');
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            setTime(timeStr);
            setFrequency('Once');
            setInstructions('');
            setInstructions('');
            setIsImportant(false);
            setSoundType('default');
            setCustomDays([]);
            setShowCustomDays(false);
            setIsCourse(false);
            setMedFrequencies(['breakfast', 'dinner']);
            setMedDuration(7);
            setFiles([]);
            setEditScope('all');
            setDurationDays(30);
            setIsSaving(false); // Reset saving state
        }
    }, [reminderToEdit, isOpen]);

    // REACTIVE START DATE: Sync with Edit Scope
    // REACTIVE START DATE: Sync with Edit Scope & Preserve End Date Logic
    useEffect(() => {
        if (!isOpen || !reminderToEdit) return;

        if (editScope === 'this' && reminderToEdit.instanceKey) {
            setStartDate(reminderToEdit.instanceKey.split('_')[0]);
        } else if (editScope === 'all') {
            const originalStart = reminderToEdit.schedule?.startDate || reminderToEdit.date;

            // V10.15 FIX: Default to Today to preserve past history (Logs)
            // Unless the selected instance or original start is in the Future.
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayStr = today.toLocaleDateString('en-CA');

            let targetDate = todayStr; // Default Safest Split (Today)

            if (reminderToEdit.instanceKey) {
                const iDate = reminderToEdit.instanceKey.split('_')[0];
                // If instance is in future, split there. If past, split Today.
                if (iDate > todayStr) targetDate = iDate;
            } else {
                // Root Edit: If original start is in future, keep it. If past, move to Today.
                if (originalStart > todayStr) targetDate = originalStart;
            }

            setStartDate(targetDate);

            // V10.16: AUTO-ADJUST DURATION to maintain original end date
            const originalDuration = reminderToEdit.schedule?.durationDays || 1;
            if (targetDate !== originalStart && originalDuration > 1) {
                const oStartObj = new Date(originalStart);
                const oEndObj = new Date(oStartObj);
                oEndObj.setDate(oStartObj.getDate() + (parseInt(originalDuration) - 1));

                const nStartObj = new Date(targetDate);
                const diffTime = oEndObj - nStartObj;
                const newDur = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

                if (newDur > 0) {
                    if (reminderToEdit.isCourse || isCourse) setMedDuration(newDur);
                    else setDurationDays(newDur);
                } else {
                    if (reminderToEdit.isCourse || isCourse) setMedDuration(1);
                    else setDurationDays(1);
                }
            }
        }
    }, [editScope, reminderToEdit, isOpen]);

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

    // V10.13: Safeguard Duration > 0
    useEffect(() => {
        if (medDuration < 1) setMedDuration(1);
        if (durationDays < 1) setDurationDays(1);
    }, [medDuration, durationDays]);

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

        // V10: 12MB Limit Check
        const validFiles = [];
        for (const file of selected) {
            if (file.size > 12 * 1024 * 1024) { // 12MB
                alert(`File "${file.name}" is too large (>${(file.size / 1024 / 1024).toFixed(1)}MB). Max 12MB.`);
                continue;
            }
            validFiles.push(file);
        }

        if (validFiles.length === 0) {
            setIsUploading(false);
            return;
        }

        // OPTIMISTIC UI: Add placeholders immediately
        const newPlaceholders = validFiles.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            isUploading: true, // Marker for UI
            progress: 0, // V11: Progress Value
            tempId: Math.random().toString(36).substr(2, 9),
            fileObj: f
        }));

        setFiles(prev => [...prev, ...newPlaceholders]);

        try {
            // Process uploads
            const results = await Promise.all(newPlaceholders.map(async (placeholder) => {
                try {
                    // V11: Pass onProgress callback
                    const storageData = await fileStorage.saveFile(placeholder.fileObj, (percent) => {
                        setFiles(currentFiles => currentFiles.map(f => {
                            if (f.tempId === placeholder.tempId) {
                                return { ...f, progress: percent };
                            }
                            return f;
                        }));
                    });

                    return {
                        ...placeholder,
                        id: storageData.id,
                        storageData: storageData,
                        extractedText: '',
                        isUploading: false, // Done
                        progress: 100,
                        url: storageData.url // Ensure URL is available top-level
                    };
                } catch (err) {
                    console.error("Single file upload failed", placeholder.name, err);
                    return { ...placeholder, isError: true, isUploading: false };
                }
            }));

            // Replace placeholders with real data
            setFiles(prev => prev.map(f => {
                const match = results.find(r => r.tempId === f.tempId);
                return match || f;
            }));

        } catch (error) {
            console.error("Upload batch failed", error);
            alert("Failed to upload some files.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // VALIDATION: Legacy check removed. 
        // We now allow moving Start Date forward because dataService handles "Soft Split" (History Preservation)
        // by ending the old series and creating a new one.

        if (editScope === 'this' && reminderToEdit) {
            // V10.1 FIX: Use the User-Selected Date (startDate) for validation, NOT the old instance key!
            let targetDateStr = startDate;
            if (!targetDateStr && reminderToEdit.instanceKey) {
                targetDateStr = reminderToEdit.instanceKey.split('_')[0];
            } else if (!targetDateStr) {
                targetDateStr = new Date().toISOString().split('T')[0];
            }

            const targetDateTime = new Date(`${targetDateStr}T${time}`);
            const now = new Date();
            const todayStr = now.toLocaleDateString('en-CA');

            if (reminderToEdit.status !== 'missed') {
                // V10: Fix "Time in Past" validation. Only alert if Date Matches Today AND Time is Past.
                // If Date is Future, Time can be anything.
                /* 
                // USER REQUEST V10.4: "remove that time check". 
                // Allow setting past times for Today (e.g. logging done tasks).
                if (targetDateStr === todayStr && targetDateTime < now) {
                    alert("Please select a future time.");
                    return;
                }
                */
                // Also Check validation for strictly past dates if not 'missed'?
                // But we locked past dates already.
            }
        }

        // V10: Series Update Confirmation
        if (reminderToEdit && editScope === 'all' && (reminderToEdit.frequency !== 'Once' || reminderToEdit.schedule?.type === 'recurring')) {
            const confirmed = window.confirm("Update Series?\n\nThis will update all FUTURE events. Past events will be preserved in history.");
            if (!confirmed) {
                setIsSaving(false);
                return;
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
            soundType,
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
                if (!time) {
                    alert("Please select a time.");
                    setIsSaving(false);
                    return;
                }
            }
        } else {
            let finalFrequency = frequency;
            if (frequency === 'Custom') {
                finalFrequency = customDays.join(', ');
            }
            if (editScope !== 'this') {
                data.frequency = finalFrequency;
                // V10.30: Calculate Strict End Date to prevent 30-day drift
                const d = new Date(startDate || new Date().toISOString().split('T')[0]);
                const dur = parseInt(durationDays || 30);
                if (dur === 30) d.setMonth(d.getMonth() + 1);
                else if (dur === 60) d.setMonth(d.getMonth() + 2);
                else if (dur === 90) d.setMonth(d.getMonth() + 3);
                else if (dur === 180) d.setMonth(d.getMonth() + 6);
                else if (dur === 365) d.setFullYear(d.getFullYear() + 1);
                else if (dur === 3650) d.setFullYear(d.getFullYear() + 10);
                else d.setDate(d.getDate() + (dur - 1));

                // If "Monthly", ensure we cover the target date (don't subtract 1). If "Weekly", maybe?
                // Safest: Use the calculated date as the Inclusive End Cap.
                const endDateStr = d.toISOString().split('T')[0];

                data.schedule = {
                    type: 'basic',
                    startDate: startDate || new Date().toISOString().split('T')[0],
                    durationDays: durationDays,
                    endDate: endDateStr, // Explicit End Date
                    times: { default: time }
                };
            }
            // CRITICAL: Ensure time is valid before saving for 'this' instance
            if (!time) {
                alert("Please select a time.");
                setIsSaving(false);
                return;
            }
            // CRITICAL FIX: Always set time for both 'this' and 'all' scopes
            data.time = time;
        }

        console.log("Saving Reminder Data:", data, "Scope:", editScope, "Key:", reminderToEdit?.instanceKey);

        setIsSaving(true);

        try {
            await Haptics.impact({ style: ImpactStyle.Medium });
            if (reminderToEdit && editScope === 'this') {
                // Update specific instance ONLY
                // Explicitly verify time is in passed data
                if (!data.time) console.warn("WARNING: Saving exception without time!");
                await onSave(data, reminderToEdit.instanceKey);
            } else {
                // Standard Update (Series or New)
                // Just save everything to the main series object
                await onSave(data, null);
            }

            onClose();
        } catch (error) {
            console.error("Save failed", error);
            alert("Failed to save reminder. Please try again.");
            setIsSaving(false);
        }
    };

    // Keep ref updated
    useEffect(() => {
        handleSubmitRef.current = handleSubmit;
    }, [handleSubmit]);

    // Early return MUST be after all hooks (React Rules of Hooks compliance)
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500] md:p-4">
            <div className="bg-white dark:bg-gray-900 w-full md:max-w-md flex flex-col h-full md:h-auto md:max-h-[85vh] animate-fade-in shadow-2xl transition-colors duration-300 md:rounded-2xl border border-gray-100 dark:border-gray-800 relative z-[500] overflow-hidden">
                <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-bold dark:text-white">{reminderToEdit ? 'Edit Reminder' : 'Add Reminder'}</h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={24} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <form onSubmit={(e) => {
                    handleSubmit(e);
                    // Safety: Force reset after 10s if stuck
                    setTimeout(() => setIsSaving(false), 10000);
                }} className="flex flex-col flex-1 min-h-0 relative">
                    <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin p-4 pb-48 md:p-6 flex flex-col gap-5">
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
                                        readOnly={(() => {
                                            // V10: Strict Date Locking Logic
                                            // 1. Past events are ALWAYS locked
                                            const originalStart = reminderToEdit?.schedule?.startDate || reminderToEdit?.date || reminderToEdit?.targetDate; // targetDate for instances
                                            const today = new Date().toLocaleDateString('en-CA');

                                            // Check if it's visually in the past (based on what was set)
                                            // For instances, use the instance key date if available for strictness? 
                                            // User said: "past... not editable".
                                            let checkDate = originalStart;
                                            if (reminderToEdit?.instanceKey) checkDate = reminderToEdit.instanceKey.split('_')[0];

                                            const isPast = checkDate < today;

                                            if (isPast) return true;

                                            // 2. Ongoing Series (Future/Today)
                                            // "in between start is not editable"
                                            // If it's a series instance (frequency !== 'Once' && editScope === 'this'), Lock it.
                                            // EXCEPT if user wants to reschedule a single future instance? 
                                            // User said: "single future reminders can be rescheduled completely".
                                            // BUT also: "when the event is in the series then in this event it should not change date".
                                            // CONTRADICTION?
                                            // Clarification 3: "if the event is just the normal once single event... start date should be able to change"
                                            // Clarification 4: "the series which is ongoing should also see the start and end date as it is set"

                                            // Interpretation:
                                            // - Single 'Once' event (Future): Editable.
                                            // - Series Instance (Future): Locked? (To prevent detaching? Or allow rescheduling?)
                                            // User said: "start is not editable" for "in between".
                                            // So: Series Instance -> Locked. Single Event -> Editable.

                                            if (editScope === 'this' && reminderToEdit?.frequency !== 'Once') return true;

                                            return false;
                                        })()}
                                        // V10.10: Removed 'min' constraint to allow backdating new reminders (for auto-complete)
                                        className={`w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white transition-all ${(() => {
                                            const originalStart = reminderToEdit?.schedule?.startDate || reminderToEdit?.date || (reminderToEdit?.instanceKey?.split('_')[0]);
                                            const today = new Date().toLocaleDateString('en-CA');
                                            const isPast = originalStart < today;
                                            const isSeriesInstance = editScope === 'this' && reminderToEdit?.frequency !== 'Once';
                                            return (isPast || isSeriesInstance) ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-gray-900' : 'focus:ring-2 focus:ring-orange-500';
                                        })()
                                            }`}
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                    />
                                    {/* V10.17: Live Schedule Preview (Calculated from state) */}
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 ml-1 flex items-center gap-1">
                                        <Calendar size={10} className="opacity-70" />
                                        Schedule Preview: <span className="font-medium text-blue-600 dark:text-blue-400">
                                            {(() => {
                                                const start = new Date(startDate);
                                                const dur = isCourse ? parseInt(medDuration) : (frequency === 'Once' ? 1 : parseInt(durationDays || 30));
                                                const end = new Date(start);
                                                end.setDate(start.getDate() + (dur - 1));

                                                return (
                                                    <>
                                                        {start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                                                        {frequency !== 'Once' ? (
                                                            <> - {end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ({dur} days)</>
                                                        ) : (
                                                            <span className="italic opacity-80"> (Single Event)</span>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </span>
                                    </p>
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
                                                <div className="flex justify-between mb-1">
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Course Duration (Days)</label>
                                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                        Until {(() => {
                                                            const d = new Date(startDate);
                                                            d.setDate(d.getDate() + (parseInt(medDuration) - 1));
                                                            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                                        })()}
                                                    </span>
                                                </div>
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
                                                {/* Repeats */}
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
                                                        <option value="Monthly">Monthly</option>
                                                        <option value="Every 1 Hour">Hourly</option>
                                                        <option value="Every 2 Hours">Every 2h</option>
                                                        <option value="Every 3 Hours">Every 3h</option>
                                                        <option value="Every 4 Hours">Every 4h</option>
                                                        <option value="Custom">Custom</option>
                                                    </select>
                                                </div>

                                                {/* Ends After */}
                                                <div>
                                                    <div className="flex justify-between mb-1">
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Ends?</label>
                                                        {frequency !== 'Once' && (
                                                            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                                                                Until {(() => {
                                                                    const d = new Date(startDate);
                                                                    const dur = parseInt(durationDays || 30);

                                                                    // V10.30: Calendar-aware calculation
                                                                    if (dur === 30) d.setMonth(d.getMonth() + 1);
                                                                    else if (dur === 60) d.setMonth(d.getMonth() + 2);
                                                                    else if (dur === 90) d.setMonth(d.getMonth() + 3);
                                                                    else if (dur === 180) d.setMonth(d.getMonth() + 6);
                                                                    else if (dur === 365) d.setFullYear(d.getFullYear() + 1);
                                                                    else if (dur === 3650) d.setFullYear(d.getFullYear() + 10);
                                                                    else d.setDate(d.getDate() + (dur - 1));

                                                                    // Adjust for "Exclusive" vs "Inclusive"? 
                                                                    // If I say "1 Month" (Jan 1 -> Feb 1), usually it includes Feb 1? 
                                                                    // Or ends Jan 31? 
                                                                    // Let's stick to Exact Date (-1 day if we want inclusive of the span, but "Until" usually implies the limit).
                                                                    // Let's NOT subtract 1 day for Calendar months to be safe (cover the target date).
                                                                    // Actually, if Monthly (Jan 1), +1 Month = Feb 1. 
                                                                    // Feb 1 IS the date. So we need it to be >= Feb 1.

                                                                    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                                                })()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <select
                                                        className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-700 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                                        value={durationDays || 30}
                                                        onChange={(e) => setDurationDays(parseInt(e.target.value))}
                                                        disabled={frequency === 'Once'}
                                                    >
                                                        <option value="1">1 Day</option>
                                                        <option value="3">3 Days</option>
                                                        <option value="7">1 Week</option>
                                                        <option value="14">2 Weeks</option>
                                                        <option value="30">1 Month</option>
                                                        <option value="60">2 Months</option>
                                                        <option value="90">3 Months</option>
                                                        <option value="180">6 Months</option>
                                                        <option value="365">1 Year</option>
                                                        <option value="3650">Forever</option>
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
                                    <div key={idx} className={`flex flex-col p-3 mb-2 bg-gray-50 dark:bg-gray-800 border rounded-lg transition-all ${file.isError ? 'border-red-300 bg-red-50' : (file.isUploading ? 'border-orange-300 ring-1 ring-orange-100' : 'border-green-200 dark:border-green-900')}`}>
                                        <div className="flex items-center justify-between mb-2">
                                            {/* Clickable Area for Preview */}
                                            <div
                                                className="flex items-center gap-3 overflow-hidden flex-1 p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all"
                                            >
                                                {/* Status Icon */}
                                                {file.isUploading ? (
                                                    <span className="animate-spin text-orange-500 text-lg">⏳</span>
                                                ) : file.isError ? (
                                                    <span className="text-red-500 text-lg">⚠️</span>
                                                ) : (
                                                    <div className="bg-green-100 dark:bg-green-900/30 p-1.5 rounded-full">
                                                        <Check size={16} className="text-green-600 dark:text-green-400" />
                                                    </div>
                                                )}

                                                <div className="flex flex-col min-w-0 items-start">
                                                    {/* FORCE BUTTON: Semantic button for clickability */}
                                                    <button
                                                        type="button"
                                                        className={`text-sm font-medium truncate dark:text-gray-200 hover:underline text-blue-600 dark:text-blue-400 ${file.isError ? 'text-red-600 dark:text-red-400 decoration-red-600' : ''}`}
                                                        onClick={(e) => {
                                                            e.preventDefault(); // Stop bubbling if needed
                                                            // FIXED: Check file.fileObj for local previews
                                                            const url = file.url || file.storageData?.url || (file.fileObj instanceof File ? URL.createObjectURL(file.fileObj) : (file instanceof File ? URL.createObjectURL(file) : file.data));

                                                            if (!url) {
                                                                console.error("No URL found for file:", file);
                                                                if (file.isUploading) return;
                                                                alert("Cannot preview: No URL found.");
                                                                return;
                                                            }

                                                            let type = file.type;
                                                            if (!type && file.name) {
                                                                const ext = file.name.split('.').pop().toLowerCase();
                                                                if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) type = 'image/' + ext;
                                                            }

                                                            setPreviewFile({
                                                                ...file,
                                                                type: type || 'unknown',
                                                                url: url
                                                            });
                                                        }}
                                                    >
                                                        {file.name}
                                                    </button>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                                        {file.isUploading ? 'Uploading...' : file.isError ? 'Failed' : 'Attached • Click to view'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1 shrink-0 ml-2">
                                                {/* ALWAYS Show Preview/Delete if not actively broken, even if "uploading" state is stuck */}
                                                {!file.isError && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                const url = file.url || file.storageData?.url || (file instanceof File ? URL.createObjectURL(file) : file.data);
                                                                if (!url) return;

                                                                let type = file.type;
                                                                if (!type && file.name) {
                                                                    const ext = file.name.split('.').pop().toLowerCase();
                                                                    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) type = 'image/' + ext;
                                                                }

                                                                setPreviewFile({
                                                                    ...file,
                                                                    type: type || 'unknown',
                                                                    url: url
                                                                });
                                                            }}
                                                            className="p-1.5 hover:bg-orange-100 dark:hover:bg-gray-700 rounded-md text-orange-500 transition-colors"
                                                            title="Preview File"
                                                        >
                                                            <Eye size={18} />
                                                        </button>
                                                        <button type="button" onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFiles(files.filter((_, i) => i !== idx));
                                                        }} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                                                    </>
                                                )}
                                                {/* Only show pure X if definitely error */}
                                                {(file.isError) && (
                                                    <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== idx))} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md text-gray-400 hover:text-red-500" title="Remove"><X size={18} /></button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Progress Bar - Larger and clearer */}
                                        {file.isUploading && (
                                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden relative">
                                                <div
                                                    className="bg-gradient-to-r from-orange-400 to-orange-600 h-full rounded-full transition-all duration-300 relative z-10"
                                                    style={{ width: `${file.progress || 0}%` }}
                                                ></div>
                                                <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-600 dark:text-gray-300 mix-blend-difference">
                                                    {file.progress || 0}%
                                                </div>
                                            </div>
                                        )}
                                        {file.isError && <div className="text-xs text-red-600 font-medium mt-1">Upload failed. Please delete and try again.</div>}
                                    </div>
                                ))}

                                {isUploading && (
                                    <div className="flex items-center justify-center p-3 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700 text-gray-500">
                                        <span className="animate-spin mr-2">⏳</span> Uploading...
                                    </div>
                                )}

                                <label
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${isDragging
                                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 scale-[1.02]'
                                        : `border-gray-300 dark:border-gray-700 hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-500 dark:text-gray-400 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`
                                        }`}
                                >
                                    <Upload size={18} />
                                    <span className="text-sm">{isDragging ? 'Drop Files Here' : 'Attach File (Rx, Photo) or Drag & Drop'}</span>
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
                            {/* Important Tag Removed as per user request */}
                            <span className="text-sm text-gray-500 dark:text-gray-400">Attachments will be visible on all future reminders in this series.</span>
                        </div>
                    </div>

                    <div className="fixed bottom-0 left-0 right-0 p-4 pb-8 md:pb-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 z-[600] md:static md:z-30 md:border-t md:shrink-0">
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

            {/* FULL SCREEN FILE PREVIEW OVERLAY */}
            {
                previewFile && (
                    <div className="fixed inset-0 z-[200] bg-black text-white flex flex-col animate-fade-in h-[100dvh]">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 bg-black/50 backdrop-blur-md z-50">
                            <button
                                onClick={() => setPreviewFile(null)}
                                className="mr-3 p-2 bg-white/10 rounded-full hover:bg-white/20 text-white transition-all"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <span className="truncate font-medium flex-1 mr-4">{previewFile.name}</span>
                            <div className="flex items-center gap-3">
                                {/* Download/Open External Button */}
                                {previewFile.url && (
                                    <button
                                        type="button"
                                        onClick={() => window.open(previewFile.url, '_blank')}
                                        className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition active:scale-95"
                                        title="Download / Open External"
                                    >
                                        <Download size={20} className="text-white" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPreviewFile(null)}
                                    className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition active:scale-95"
                                >
                                    <X size={20} className="text-white" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                            {(previewFile.type && previewFile.type.startsWith('image/')) || (previewFile.name && (previewFile.name.toLowerCase().endsWith('.jpg') || previewFile.name.toLowerCase().endsWith('.png') || previewFile.name.toLowerCase().endsWith('.jpeg'))) ? (
                                <img
                                    src={previewFile.url || (previewFile.fileObj instanceof File ? URL.createObjectURL(previewFile.fileObj) : (previewFile instanceof File ? URL.createObjectURL(previewFile) : previewFile.data))}
                                    alt="Preview"
                                    className="max-w-full max-h-full object-contain"
                                />
                            ) : (
                                <div className="text-center p-8">
                                    <p className="mb-4 text-gray-400">Preview not available for this file type.</p>
                                    <a
                                        href={previewFile.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-6 py-3 bg-orange-500 rounded-xl font-bold text-white inline-block"
                                        download={previewFile.name}
                                    >
                                        Download / Open External
                                    </a>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 pb-8 md:pb-4 bg-black/50 backdrop-blur-md flex justify-center z-50">
                            <button
                                onClick={() => setPreviewFile(null)}
                                className="px-6 py-2 bg-white/10 hover:bg-white/20 border border-white/20 rounded-full text-white font-medium transition-colors"
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default AddReminderModal;
