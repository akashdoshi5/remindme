import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Mic, MicOff, Image as ImageIcon, Trash2, FileText, Paperclip, Loader2, CheckSquare, Tag, Play, Pause, GripVertical, Share2, Pin, Undo, Redo, Download } from 'lucide-react';
import { Reorder } from 'framer-motion';
import { useVoice } from '../../hooks/useVoice';
import { fileStorage } from '../../services/fileStorage';
import { ocrService } from '../../services/ocrService';
import { dataService } from '../../services/data';
import { useAuth } from '../../context/AuthContext';
import { mergeService } from '../../services/mergeService';
import { BackButtonManager } from '../../services/BackButtonManager';

// CUSTOM HOOK: useHistory
const useHistory = (initialState) => {
    const [history, setHistory] = useState([initialState]);
    const [index, setIndex] = useState(0);

    const currentState = history[index];

    const setState = useCallback((newState, overwrite = false) => {
        setHistory(prev => {
            const current = prev[index];
            if (current === newState) return prev; // No change

            // If overwrite, replace current head
            if (overwrite) {
                const newHistory = [...prev];
                newHistory[index] = newState;
                return newHistory;
            }

            // Normal push
            const newHistory = prev.slice(0, index + 1);
            newHistory.push(newState);
            return newHistory;
        });
        if (!overwrite) setIndex(prev => prev + 1);
    }, [index]);

    const undo = useCallback(() => {
        setIndex(prev => Math.max(0, prev - 1));
    }, []);

    const redo = useCallback(() => {
        setIndex(prev => Math.min(history.length - 1, prev + 1));
    }, [history.length]);

    // External reset
    const reset = useCallback((state) => {
        setHistory([state]);
        setIndex(0);
    }, []);

    return { state: currentState, setState, undo, redo, canUndo: index > 0, canRedo: index < history.length - 1, reset };
};


const AddNoteModal = ({ isOpen, onClose, onSave, onDelete, onShare, noteToEdit, initialType = 'text', autoStartListening = false, searchQuery = '' }) => {
    const { user } = useAuth();

    // BACK BUTTON
    const performSaveRef = useRef(null);
    useEffect(() => {
        if (!isOpen) return;
        const unregister = BackButtonManager.register(async () => {
            if (performSaveRef.current) await performSaveRef.current(true);
            else onClose();
            return true;
        });
        return unregister;
    }, [isOpen, onClose]);

    // STATE
    const [noteType, setNoteType] = useState(initialType);
    const [items, setItems] = useState([{ text: '', done: false, id: crypto.randomUUID() }]);

    // Content with History
    const { state: content, setState: setContent, undo, redo, canUndo, canRedo, reset: resetContent } = useHistory('');

    const [title, setTitle] = useState('');
    const [tags, setTags] = useState('');
    const [showTagInput, setShowTagInput] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const [files, setFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);

    // --- PREVIEW STATE ---
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

    // SYNC STATE
    const [localId, setLocalId] = useState(noteToEdit?.id || crypto.randomUUID());
    const [isNew, setIsNew] = useState(!noteToEdit);
    const [saveStatus, setSaveStatus] = useState('saved');
    // Merge Refs
    const baseContentRef = useRef(''); // The last known sync state (Snapshot) for Text
    const baseFilesRef = useRef([]);   // Base state for Files


    // --- REAL-TIME SYNC ---
    useEffect(() => {
        if (!isOpen || !noteToEdit?.id) return;

        // Start listening to the specific note
        const unsubscribe = dataService.getNoteRealtime(noteToEdit.id, (remoteNote) => {
            if (!remoteNote) return; // Deleted?

            // 1. Text Merge
            if (remoteNote.type === 'text') {
                const currentLocal = content || '';
                const base = baseContentRef.current || '';
                const remote = remoteNote.content || '';

                if (remote !== base) {
                    console.log("Remote update detected. Merging...");
                    // Calc 3-way merge
                    const merged = mergeService.threeWayMerge(base, currentLocal, remote);

                    if (merged !== currentLocal) {
                        // Update Local state
                        setContent(merged);
                        console.log("Merged content applied.");
                    }
                    baseContentRef.current = remote; // Update new base
                }
            }

            // 2. Title Merge (Last Write Wins for simplicity, if remote changed and we didn't touch it much)
            if (remoteNote.title !== undefined && remoteNote.title !== title) {
                // For now, only update if we haven't touched title? 
                // Or just let it be LWW. Real LWW requires tracking baseTitle.
                // We'll skip complex title merge for now to avoid jumpiness.
            }

            // Update other fields
            if (remoteNote.isPinned !== undefined) setIsPinned(remoteNote.isPinned);
            if (remoteNote.tags) setTags(remoteNote.tags.join(', '));
            // 3. File Merge (3-Way)
            const remoteFiles = remoteNote.files || [];
            const baseFiles = baseFilesRef.current || [];

            // Identify Remote Changes
            const addedRemotely = remoteFiles.filter(rf => !baseFiles.some(bf => bf.id === rf.id));
            const removedRemotely = baseFiles.filter(bf => !remoteFiles.some(rf => rf.id === bf.id));

            if (addedRemotely.length > 0 || removedRemotely.length > 0) {
                setFiles(prev => {
                    let newFiles = [...prev];

                    // Apply Deletions
                    if (removedRemotely.length > 0) {
                        newFiles = newFiles.filter(f => {
                            // Keep if it's a temp file (no storageData/id yet)
                            if (!f.storageData?.id && !f.id) return true;
                            // If it has an ID, check if it was removed remotely
                            const idToCheck = f.storageData?.id || f.id;
                            return !removedRemotely.some(rm => rm.id === idToCheck);
                        });
                    }

                    // Apply Additions
                    addedRemotely.forEach(rf => {
                        // Check if we already have it (avoid dupes)
                        const exists = newFiles.some(f => (f.storageData?.id === rf.id) || (f.id === rf.id));
                        if (!exists) {
                            newFiles.push({
                                tempId: crypto.randomUUID(),
                                name: rf.name,
                                type: rf.type,
                                status: 'ready',
                                text: rf.extractedText || '',
                                storageData: { id: rf.id, url: rf.url, path: rf.path }
                            });
                        }
                    });
                    return newFiles;
                });
                baseFilesRef.current = remoteFiles; // Update Base
            }

            // 4. Audio Merge (Smart Check)
            if (remoteNote.audioData) {
                // If we don't have audio, or if remote changed and we didn't touch it
                // Simple logic: If we have no audio, take remote.
                // If we have audio, but it matches base (old), and remote is new, take remote.
                const currentAudio = audioData;
                // const baseAudio = baseAudioRef.current; // We need to track this too!

                // For now, if current is null, take remote.
                if (!currentAudio) {
                    setAudioData(remoteNote.audioData);
                }
            } else if (remoteNote.audioData === null && audioData) {
                // Remote deleted it?
                // If we haven't touched it (matches base), delete ours too.
                // Skipping complex delete sync for audio to prevent accidental loss for now.
            }

            if (remoteNote.items && noteType === 'shopping') {
                // Checklist sync is hard. Naive replacement for now if remote changed.
                // Ideally check diff.
            }

        });

        return () => {
            unsubscribe();
        };
    }, [isOpen, noteToEdit?.id, content, setContent, noteType, title]);

    // --- INITIALIZATION ---
    useEffect(() => {
        // FIX: Allow re-initialization if noteToEdit changes, even if ID matches (e.g. slight updates)
        // verify if we are truly switching context or just receiving a background update
        // actually, we should just trust noteToEdit if it exists and is different from current state?
        // Simpler: Just rely on local state unless noteToEdit ID changes OR if we are opening fresh.

        // If we are already editing this note, we still might want to refresh if it was re-opened
        // The previous check was: if (localId && noteToEdit?.id === localId && !isNew) return;
        // This blocked "re-opening" the same note from the list if the modal wasn't fully unmounted or state wasn't cleared.
        // We will remove it to ensure we always load the latest props when the modal opens/note changes.

        if (noteToEdit) {
            setTitle(noteToEdit.title && noteToEdit.title !== 'Untitled Note' ? noteToEdit.title : '');

            const initialContent = noteToEdit.content || '';
            // Only reset history if we are genuinely switching notes
            if (localId !== noteToEdit.id) {
                resetContent(initialContent);
            } else if (content === '') {
                // specific case: if local is empty but remote has content (initial load)
                setContent(initialContent);
            }

            baseContentRef.current = initialContent; // Set base
            baseFilesRef.current = noteToEdit.files || [];

            setTags(noteToEdit.tags ? noteToEdit.tags.join(', ') : '');
            setShowTagInput(!!(noteToEdit.tags && noteToEdit.tags.length > 0));
            setFiles(noteToEdit.files || []);
            setNoteType(noteToEdit.type === 'shopping' ? 'shopping' : 'text');

            // Fix: Ensure items are mapped correctly
            const initialItems = (noteToEdit.items && noteToEdit.items.length > 0)
                ? noteToEdit.items.map(i => ({ ...i, id: i.id || crypto.randomUUID() }))
                : [{ text: '', done: false, id: crypto.randomUUID() }];
            setItems(initialItems);

            setAudioData(noteToEdit.audioData || null);
            setIsPinned(!!noteToEdit.isPinned);

            setLocalId(noteToEdit.id);
            setIsNew(false);
        } else {
            // New Note
            if (!isNew) { // Only reset if we weren't already in "New" mode
                resetContent('');
                baseContentRef.current = '';
                baseFilesRef.current = [];
                setTitle('');
                setTags('');
                setFiles([]);
                setItems([{ text: '', done: false, id: crypto.randomUUID() }]);
                setIsPinned(false);
                setAudioData(null);
                setLocalId(crypto.randomUUID());
                setIsNew(true);
            }
        }
    }, [noteToEdit, isOpen]); // Removed localId/isNew from dependencies to prevent loops, added isOpen to refresh on open






    // --- DRAG & DROP & AUDIO ---
    const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
    const handleDrop = (e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) handleFileUpload({ target: { files: e.dataTransfer.files } }); };

    const { isListening, transcript, startListening, stopListening, isSupported, resetTranscript } = useVoice({ continuous: true });
    const [audioData, setAudioData] = useState(null);
    const [recordingStatus, setRecordingStatus] = useState('idle');
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const audioRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const textareaRef = useRef(null);

    // Audio Helpers
    const formatTime = (time) => { if (!time) return "0:00"; const m = Math.floor(time / 60); const s = Math.floor(time % 60); return `${m}:${s < 10 ? '0' : ''}${s}`; };
    const handleSeek = (e) => { const t = Number(e.target.value); setCurrentTime(t); if (audioRef.current) audioRef.current.currentTime = t; };
    const handlePlayAudio = () => { if (audioRef.current) { if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); } else { audioRef.current.play().catch(console.error); setIsPlaying(true); } } };

    useEffect(() => {
        if (audioData) {
            if (!audioRef.current || audioRef.current.src !== audioData) {
                if (audioRef.current) audioRef.current.pause();
                const a = new Audio(audioData);
                audioRef.current = a;
                a.onloadedmetadata = () => setDuration(a.duration);
                a.ontimeupdate = () => setCurrentTime(a.currentTime);
                a.onended = () => { setIsPlaying(false); setCurrentTime(0); };
            }
        } else {
            setDuration(0); setCurrentTime(0);
            if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
        }
    }, [audioData]);

    const deleteAudio = () => { if (window.confirm("Remove audio?")) { if (audioRef.current) audioRef.current.pause(); setAudioData(null); setIsPlaying(false); } };

    // Body Lock
    useEffect(() => { document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = ''; }; }, []);

    // Search Focus
    useEffect(() => { if (isOpen && noteType === 'text' && searchQuery && content && textareaRef.current) { const idx = content.toLowerCase().indexOf(searchQuery.toLowerCase()); if (idx !== -1) { setTimeout(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(idx, idx + searchQuery.length); }, 300); } } }, [isOpen, noteType, searchQuery, content]);

    // Audio Recording
    const MAX_AUDIO_SIZE = 25 * 1024 * 1024;
    const startRecordingRobust = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
            mediaRecorderRef.current = recorder;
            audioChunksRef.current = [];
            let size = 0;
            recorder.ondataavailable = (e) => { if (e.data.size > 0) { size += e.data.size; if (size > MAX_AUDIO_SIZE) { stopRecordingAsync(); stopListening(); alert("Limit exceeded"); return; } audioChunksRef.current.push(e.data); } };
            recorder.start();
            setRecordingStatus('recording');
        } catch (e) { console.error(e); stopListening(); setRecordingStatus('idle'); if (!autoStartListening) alert("Mic error"); }
    }, [stopListening, autoStartListening]);

    const stopRecordingAsync = () => new Promise(resolve => {
        if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') { setRecordingStatus('idle'); resolve(null); return; }
        mediaRecorderRef.current.onstop = () => {
            const blob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
            if (blob.size > MAX_AUDIO_SIZE) { alert("Limit exceeded"); setAudioData(null); resolve(null); }
            else { const r = new FileReader(); r.onloadend = () => { setAudioData(r.result); resolve(r.result); }; r.readAsDataURL(blob); }
            streamRef.current?.getTracks().forEach(t => t.stop());
            setRecordingStatus('idle');
        };
        mediaRecorderRef.current.stop();
    });

    useEffect(() => { if (isOpen && autoStartListening && isSupported && !noteToEdit) { resetTranscript(); setAudioData(null); startListening(); startRecordingRobust(); } else if (!isOpen) { stopListening(); if (mediaRecorderRef.current?.state === 'recording') stopRecordingAsync(); } }, [isOpen, autoStartListening, noteToEdit, isSupported, resetTranscript, startListening, startRecordingRobust, stopListening]);

    // Transcript
    useEffect(() => {
        if (!isListening && transcript) {
            if (noteType === 'text') {
                setContent((content ? content + ' ' : '') + transcript);
            } else {
                setItems(prev => [...prev, { text: transcript, done: false, id: crypto.randomUUID() }]);
            }
            resetTranscript();
        }
    }, [isListening, transcript, noteType, setContent, resetTranscript]);

    // Handlers
    const toggleRecording = () => { if (recordingStatus !== 'idle') { stopListening(); stopRecordingAsync(); } else { setAudioData(null); startListening(); startRecordingRobust(); } };

    // File Upload
    const handleFileUpload = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (!selectedFiles.length) return;
        const newFileEntries = selectedFiles.map(f => ({ tempId: crypto.randomUUID(), file: f, name: f.name, type: f.type, status: 'uploading', progress: 0, text: '', storageData: null }));
        setFiles(prev => [...prev, ...newFileEntries]);
        newFileEntries.forEach(async (entry) => {
            try {
                const up = fileStorage.saveFile(entry.file, p => setFiles(prev => prev.map(f => f.tempId === entry.tempId ? { ...f, progress: Math.round(p) } : f)));
                const ocr = ocrService.extractText(entry.file);
                const [sd, txt] = await Promise.all([up, ocr]);
                setFiles(prev => prev.map(f => f.tempId === entry.tempId ? { ...f, status: 'ready', progress: 100, text: txt || '', storageData: sd } : f));
            } catch (e) { setFiles(prev => prev.map(f => f.tempId === entry.tempId ? { ...f, status: 'error' } : f)); }
        });
    };
    const handleRemoveFile = async (idx) => { setFiles(files.filter((_, i) => i !== idx)); };

    // SAVE LOGIC
    const lastSavedData = useRef(null);
    const performSave = async (shouldClose = false) => {
        if (files.some(f => f.status === 'uploading')) { if (shouldClose) alert("Wait for upload"); return; }
        setSaveStatus('saving');

        let finalAudio = audioData;
        if (recordingStatus === 'recording') { stopListening(); const rd = await stopRecordingAsync(); if (rd) finalAudio = rd; }

        try {
            // Blank check
            const isBlank = !title.trim() && (!noteType === 'text' || !content.trim()) && (!noteType === 'shopping' || !items.length) && !files.length && !finalAudio;
            const isShared = (noteToEdit?.sharedWith?.length > 0);

            if (isBlank && !isShared) {
                if (localId && !isNew) await dataService.deleteNote(localId);
                setSaveStatus('saved');
                if (shouldClose) onClose();
                return;
            }

            let finalTitle = title.trim() || ((!content && !items.length && !files.length) ? "Untitled Note" : "");
            if (!finalTitle && noteType === 'shopping') finalTitle = 'Checklist';

            const finalFiles = files.map(f => f.storageData ? { id: f.storageData.id, name: f.name, type: f.type, url: f.storageData.url, path: f.storageData.path, extractedText: f.text } : f);

            const dataToSave = {
                title: finalTitle,
                content: noteType === 'text' ? content : '',
                items: noteType === 'shopping' ? items : undefined,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                type: noteType,
                date: noteToEdit ? noteToEdit.date : new Date().toLocaleString(),
                updatedAt: new Date().toISOString(),
                files: finalFiles,
                audioData: finalAudio,
                id: localId,
                ownerId: noteToEdit?.ownerId,
                sharedWith: isNew ? [] : noteToEdit?.sharedWith,
                isPinned: isPinned
            };

            // Optimistically update Base for Sync
            if (noteType === 'text') {
                baseContentRef.current = content;
            }
            baseFilesRef.current = finalFiles;

            const saved = await onSave(dataToSave);
            if (saved?.id) setLocalId(saved.id);
            setIsNew(false);
            lastSavedData.current = dataToSave;
            setSaveStatus('saved');

            if (shouldClose) onClose();

        } catch (e) {
            console.error(e);
            setSaveStatus('error');
        }
    };

    useEffect(() => { performSaveRef.current = performSave; }, [performSave]);
    useEffect(() => { if (!isOpen || recordingStatus === 'recording') return; const t = setTimeout(() => performSave(false), 1500); return () => clearTimeout(t); }, [content, items, tags, files, audioData, title, isPinned]);

    const displayContent = content + (isListening && transcript ? ' ' + transcript : '');

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 md:p-6 transition-all overflow-hidden">
            <div className="bg-white dark:bg-gray-900 w-full max-w-2xl h-[85vh] md:h-[80vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-slide-up">

                {/* Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-3 flex-1 mr-4">
                        <input type="text" placeholder="Title" className="w-full text-lg font-bold bg-transparent outline-none text-gray-800 dark:text-gray-100" value={title} onChange={e => setTitle(e.target.value)} />
                        {saveStatus === 'saving' && <Loader2 size={16} className="animate-spin text-orange-500" />}
                        {saveStatus === 'saved' && <span className="text-xs text-green-500">Saved</span>}
                    </div>
                    <div className="flex items-center gap-1">
                        {/* Undo/Redo */}
                        <div className="flex items-center mr-2 border-r border-gray-200 dark:border-gray-700 pr-2 gap-1">
                            <button onClick={undo} disabled={!canUndo} className={`p-2 rounded-full transition-colors ${!canUndo ? 'text-gray-300 dark:text-gray-700' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`}><Undo size={18} /></button>
                            <button onClick={redo} disabled={!canRedo} className={`p-2 rounded-full transition-colors ${!canRedo ? 'text-gray-300 dark:text-gray-700' : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}`}><Redo size={18} /></button>
                        </div>

                        <button onClick={() => setIsPinned(!isPinned)} className={`p-2 rounded-full ${isPinned ? 'bg-orange-100 text-orange-600' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}><Pin size={20} className={isPinned ? "fill-current" : ""} /></button>
                        {/* Share & Delete Logic kept same */}
                        {noteToEdit && onShare && <button onClick={() => onShare(noteToEdit)} className={`p-2 rounded-full ${noteToEdit.sharedWith?.length ? 'text-green-600 bg-green-50' : 'text-gray-400 hover:text-green-600'}`}><Share2 size={20} /></button>}
                        {noteToEdit && onDelete && <button onClick={() => window.confirm("Delete?") && onDelete(noteToEdit.id)} className="p-2 text-gray-400 hover:text-red-500 rounded-full"><Trash2 size={20} /></button>}
                        <button onClick={() => performSave(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-500 ml-2"><X size={20} /></button>
                    </div>
                </div>

                {/* Content */}
                <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`flex-1 overflow-y-auto p-6 custom-scrollbar relative transition-colors ${isDragging ? 'bg-orange-50 dark:bg-orange-900/20' : ''}`}>
                    {isDragging && <div className="absolute inset-0 z-50 flex items-center justify-center bg-orange-100/50 backdrop-blur-sm pointer-events-none text-orange-600 font-bold"><Paperclip size={48} /> Drop Files</div>}

                    {audioData && (
                        <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl flex items-center gap-4 border border-orange-100">
                            <button onClick={handlePlayAudio} className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
                            <div className="flex-1"><input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek} className="w-full accent-orange-500 h-1.5 bg-orange-200 rounded-lg" /></div>
                            <button onClick={deleteAudio} className="text-gray-400 hover:text-red-500"><Trash2 size={18} /></button>
                        </div>
                    )}

                    {noteType === 'text' ? (
                        <textarea ref={textareaRef} className="w-full h-full bg-transparent resize-none outline-none text-lg leading-relaxed text-gray-800 dark:text-gray-200 placeholder-gray-300" placeholder="Start typing..." value={displayContent} onChange={e => setContent(e.target.value)} autoFocus={!noteToEdit} />
                    ) : (
                        <div className="space-y-3">
                            <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-3">
                                {items.map((item, idx) => (
                                    <Reorder.Item key={item.id || idx} value={item} className="flex items-start gap-3 group bg-white dark:bg-gray-800 rounded-lg">
                                        <div className="mt-2 text-gray-300 cursor-grab hover:text-orange-500"><GripVertical size={16} /></div>
                                        <input type="checkbox" checked={item.done} onChange={() => { const n = [...items]; n[idx].done = !n[idx].done; setItems(n); }} className="mt-1.5 w-5 h-5 accent-orange-500" />
                                        <input type="text" value={item.text} onChange={e => { const n = [...items]; n[idx].text = e.target.value; setItems(n); }} className={`flex-1 bg-transparent outline-none text-lg ${item.done ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`} placeholder="Item..." />
                                        <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X size={16} /></button>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                            <button onClick={() => setItems([...items, { text: '', done: false, id: crypto.randomUUID() }])} className="text-gray-400 hover:text-orange-500">+ Add Item</button>
                        </div>
                    )}

                    {files.length > 0 && (
                        <div className="mt-8 flex flex-col gap-2">
                            {files.map((file, idx) => (
                                <div key={idx} className={`flex flex-col p-3 mb-2 bg-gray-50 dark:bg-gray-800 border rounded-lg transition-all ${file.status === 'error' ? 'border-red-300 bg-red-50' : (file.status === 'uploading' ? 'border-orange-300 ring-1 ring-orange-100' : 'border-green-200 dark:border-green-900')}`}>
                                    <div className="flex items-center justify-between mb-2">
                                        {/* Clickable Area for Preview */}
                                        <div
                                            className="flex items-center gap-3 overflow-hidden flex-1 p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-all"
                                        >
                                            {/* Status Icon */}
                                            {file.status === 'uploading' ? (
                                                <span className="animate-spin text-orange-500 text-lg">⏳</span>
                                            ) : file.status === 'error' ? (
                                                <span className="text-red-500 text-lg">⚠️</span>
                                            ) : (
                                                <div className="bg-green-100 dark:bg-green-900/30 p-1.5 rounded-full">
                                                    <CheckSquare size={16} className="text-green-600 dark:text-green-400" />
                                                </div>
                                            )}

                                            <div className="flex flex-col min-w-0 items-start">
                                                {/* FORCE BUTTON: Semantic button for clickability */}
                                                <button
                                                    type="button"
                                                    className={`text-sm font-medium truncate dark:text-gray-200 hover:underline text-blue-600 dark:text-blue-400 ${file.status === 'error' ? 'text-red-600 dark:text-red-400 decoration-red-600' : ''}`}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        const url = file.url || file.storageData?.url || (file.file instanceof File ? URL.createObjectURL(file.file) : (file instanceof File ? URL.createObjectURL(file) : null));

                                                        if (!url) {
                                                            if (file.status === 'uploading') return;
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
                                                            url: url,
                                                            fileObj: file.file
                                                        });
                                                    }}
                                                >
                                                    {file.name}
                                                </button>
                                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                                    {file.status === 'uploading' ? 'Uploading...' : file.status === 'error' ? 'Failed' : 'Attached • Click to view'}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0 ml-2">
                                            <button type="button" onClick={() => handleRemoveFile(idx)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md text-gray-400 hover:text-red-500" title="Remove"><X size={18} /></button>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    {file.status === 'uploading' && (
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden relative">
                                            <div
                                                className="bg-gradient-to-r from-orange-400 to-orange-600 h-full rounded-full transition-all duration-300 relative z-10"
                                                style={{ width: `${file.progress || 0}%` }}></div>
                                            <div className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-600 dark:text-gray-300 mix-blend-difference">
                                                {file.progress || 0}%
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Explicit Drag & Drop Box */}
                    <div className="mt-4">
                        <label
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${isDragging
                                ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 scale-[1.02]'
                                : 'border-gray-200 dark:border-gray-700 hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 text-gray-500 dark:text-gray-400'
                                }`}
                        >
                            <Paperclip size={18} />
                            <span className="text-sm">{isDragging ? 'Drop Files Here' : 'Attach File or Drag & Drop'}</span>
                            <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                        </label>
                    </div>

                    {showTagInput && <div className="mt-6 flex items-center gap-2"><Tag size={16} className="text-gray-400" /><input type="text" placeholder="Tags..." className="flex-1 bg-transparent outline-none text-sm text-gray-600 dark:text-gray-400" value={tags} onChange={e => setTags(e.target.value)} /></div>}
                </div>

                {/* Toolbar */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-md flex justify-between relative">
                    {recordingStatus !== 'idle' && <div className="absolute -top-10 left-0 right-0 flex justify-center"><div className="bg-red-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">Recording ({formatTime(duration)})...</div></div>}
                    <div className="flex gap-4">
                        <button onClick={toggleRecording} className={`p-2.5 rounded-full transition-all ${recordingStatus !== 'idle' ? 'bg-red-100 text-red-600' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800'}`}>{recordingStatus !== 'idle' ? <MicOff size={22} /> : <Mic size={22} />}</button>
                        <label className="p-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-pointer transition-all">
                            <Paperclip size={22} />
                            <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                        </label>
                        <button onClick={() => setNoteType(noteType === 'text' ? 'shopping' : 'text')} className="p-2.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-all">{noteType === 'text' ? <CheckSquare size={22} /> : <FileText size={22} />}</button>
                    </div>
                </div>
            </div>

            {/* FULL SCREEN FILE PREVIEW OVERLAY */}
            {
                previewFile && (
                    <div className="fixed inset-0 z-[150] bg-black text-white flex flex-col animate-fade-in">
                        {/* Header */}
                        <div className="flex items-center justify-between p-4 bg-black/50 backdrop-blur-md absolute top-0 left-0 right-0">
                            <span className="truncate font-medium flex-1 mr-4">{previewFile?.name || 'Preview'}</span>
                            <div className="flex items-center gap-3">
                                {/* Download Button */}
                                {(previewFile.url || previewFile.fileObj) && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                const url = previewFile?.url;
                                                const filename = previewFile?.name || 'download';

                                                // If it's a blob URL or local file, direct download
                                                if (url && (url.startsWith('blob:') || previewFile.fileObj)) {
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = filename;
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                } else {
                                                    // Remote URL - try fetch to force download instead of open
                                                    const response = await fetch(url);
                                                    const blob = await response.blob();
                                                    const blobUrl = URL.createObjectURL(blob);
                                                    const a = document.createElement('a');
                                                    a.href = blobUrl;
                                                    a.download = filename;
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                    URL.revokeObjectURL(blobUrl);
                                                }
                                            } catch (e) {
                                                console.error("Download failed", e);
                                                window.open(previewFile.url, '_blank');
                                            }
                                        }}
                                        className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition active:scale-95"
                                        title="Download File"
                                    >
                                        <div className="text-white"><Download size={20} /></div>
                                    </button>
                                )}
                                {/* Share Button */}
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (navigator.share) {
                                            try {
                                                const file = previewFile.fileObj || await (await fetch(previewFile.url)).blob();
                                                // Create a file object with correct type
                                                const fileArray = [new File([file], previewFile.name, { type: previewFile.type || 'application/octet-stream' })];

                                                const shareData = {
                                                    title: previewFile.name,
                                                    files: fileArray
                                                };

                                                if (navigator.canShare && navigator.canShare(shareData)) {
                                                    await navigator.share(shareData);
                                                } else {
                                                    // Fallback for text share if files not supported or blocked
                                                    await navigator.share({
                                                        title: previewFile.name,
                                                        text: `Sharing ${previewFile.name}`,
                                                        url: previewFile.url
                                                    });
                                                }
                                            } catch (e) {
                                                console.error("Share failed", e);
                                                // If native share fails (e.g. abort), fallback to opening
                                                if (e.name !== 'AbortError') window.open(previewFile.url, '_blank');
                                            }
                                        } else {
                                            window.open(previewFile.url, '_blank');
                                        }
                                    }}
                                    className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition active:scale-95"
                                    title="Share File"
                                >
                                    <div className="text-white"><Share2 size={20} /></div>
                                </button>
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
                            {(previewFile?.type && previewFile.type.startsWith('image/')) || (previewFile?.name && (previewFile.name.toLowerCase().endsWith('.jpg') || previewFile.name.toLowerCase().endsWith('.png') || previewFile.name.toLowerCase().endsWith('.jpeg'))) ? (
                                <img
                                    src={previewFile.url || (previewFile.fileObj instanceof File ? URL.createObjectURL(previewFile.fileObj) : (previewFile instanceof File ? URL.createObjectURL(previewFile) : previewFile.data))}
                                    alt="Preview"
                                    className="max-w-full max-h-full object-contain"
                                />
                            ) : (
                                <div className="text-center p-8">
                                    <p className="mb-4 text-gray-400">Preview not available for this file type.</p>
                                    <a
                                        href={previewFile?.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-6 py-3 bg-orange-500 rounded-xl font-bold text-white inline-block"
                                        download={previewFile?.name || 'download'}
                                    >
                                        Download / Open External
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }
        </div>
    );
};

export default AddNoteModal;
