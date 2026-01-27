import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Image as ImageIcon, Trash2, FileText, Paperclip, Loader2, CheckSquare, Tag, Play, Square, Pause, Maximize2, Minimize2, GripVertical } from 'lucide-react';
import { Reorder, useDragControls } from 'framer-motion';
import { useVoice } from '../../hooks/useVoice';
import { fileStorage } from '../../services/fileStorage';
import { ocrService } from '../../services/ocrService';
import { dataService } from '../../services/data';

const AddNoteModal = ({ isOpen, onClose, onSave, noteToEdit, initialType = 'text', autoStartListening = false, searchQuery = '' }) => {
    // if (!isOpen) return null; // Removed to allow conditional rendering from parent to handle lifecycle

    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                if (performSaveRef.current) {
                    performSaveRef.current(true);
                } else {
                    onClose();
                }
            }
        };

        // Handle Hardware Back Button
        const handlePopState = (e) => {
            e.preventDefault();
            onClose();
        };

        if (isOpen) {
            window.addEventListener('keydown', handleEsc);
            // Push history state when modal opens
            window.history.pushState({ modal: 'note' }, '', window.location.pathname);
            window.addEventListener('popstate', handlePopState);
        }

        return () => {
            window.removeEventListener('keydown', handleEsc);
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isOpen, onClose]);

    const [noteType, setNoteType] = useState('text'); // 'text' or 'shopping'
    const [items, setItems] = useState([{ text: '', done: false, id: crypto.randomUUID() }]);
    const [content, setContent] = useState('');
    const [title, setTitle] = useState(''); // Explicit Title State
    const [tags, setTags] = useState('');
    const [showTagInput, setShowTagInput] = useState(false);

    // Files
    const [files, setFiles] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    // Audio
    const { isListening, transcript, startListening, stopListening, isSupported, resetTranscript } = useVoice({ continuous: true });
    const [audioData, setAudioData] = useState(null);
    const [recordingStatus, setRecordingStatus] = useState('idle'); // 'idle', 'recording', 'paused'
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef(null);

    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);
    const streamRef = useRef(null);
    const textareaRef = useRef(null);
    const performSaveRef = useRef(null); // Ref to hold latest save function

    // --- EFFECT: Initialization & Body Scroll Lock ---
    useEffect(() => {
        // Lock scroll on mount
        document.body.style.overflow = 'hidden';
        return () => {
            // Unlock scroll on unmount match stylesheet default
            document.body.style.overflow = '';
        };
    }, []);

    useEffect(() => {
        if (noteToEdit) {
            setTitle(noteToEdit.title && noteToEdit.title !== 'Untitled Note' && noteToEdit.title !== 'New Note' ? noteToEdit.title : '');
            setContent(noteToEdit.content || '');
            setTags(noteToEdit.tags ? noteToEdit.tags.join(', ') : '');
            setShowTagInput(!!(noteToEdit.tags && noteToEdit.tags.length > 0));
            setFiles(noteToEdit.files || []);
            setNoteType(noteToEdit.type === 'shopping' ? 'shopping' : 'text');
            setItems((noteToEdit.items && noteToEdit.items.length > 0) ? noteToEdit.items.map(i => ({ ...i, id: i.id || crypto.randomUUID() })) : [{ text: '', done: false, id: crypto.randomUUID() }]);
            setAudioData(noteToEdit.audioData || null);
        } else {
            setTitle('');
            setContent('');
            setTags('');
            setShowTagInput(false);
            setFiles([]);
            setNoteType(initialType === 'shopping' ? 'shopping' : 'text');
            setItems([{ text: '', done: false, id: crypto.randomUUID() }]);
            setAudioData(null);
        }
    }, [noteToEdit, isOpen, initialType]);

    // --- EFFECT: Focus & Selection (Search) ---
    useEffect(() => {
        if (isOpen && noteType === 'text' && searchQuery && content && textareaRef.current) {
            const index = content.toLowerCase().indexOf(searchQuery.toLowerCase());
            if (index !== -1) {
                setTimeout(() => {
                    const ta = textareaRef.current;
                    if (ta) {
                        ta.focus();
                        ta.setSelectionRange(index, index + searchQuery.length);
                        // Center the line
                        const lineHeight = 24;
                        const lines = content.substring(0, index).split('\n').length - 1;
                        ta.scrollTop = lines * lineHeight - (ta.clientHeight / 2);
                    }
                }, 300);
            }
        }
    }, [isOpen, noteType, searchQuery, content]);

    // --- AUDIO LOGIC ---
    const MAX_AUDIO_SIZE = 3 * 1024 * 1024; // 3 MB

    const startRecordingRobust = React.useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];
            let currentSize = 0;

            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    currentSize += event.data.size;
                    if (currentSize > MAX_AUDIO_SIZE) {
                        stopRecording();
                        stopListening();
                        alert("Audio recording exceeded 3MB limit. Recording stopped.");
                        return;
                    }
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorder.onstop = () => {
                const mimeType = mediaRecorder.mimeType;
                const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

                if (audioBlob.size > MAX_AUDIO_SIZE) {
                    alert("Audio recording exceeded 3MB limit.");
                    setAudioData(null);
                } else {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        setAudioData(reader.result);
                    };
                    reader.readAsDataURL(audioBlob);
                }

                streamRef.current?.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            };

            mediaRecorder.start();
            setRecordingStatus('recording');
        } catch (err) {
            console.error("Error accessing microphone:", err);
            stopListening();
            setRecordingStatus('idle');
            alert("Could not access microphone.");
        }
    }, [stopListening]);

    const stopRecording = () => {
        if (mediaRecorderRef.current && (mediaRecorderRef.current.state === 'recording' || mediaRecorderRef.current.state === 'paused')) {
            mediaRecorderRef.current.stop();
        }
        setRecordingStatus('idle');
    };

    // Auto-start listening if requested
    useEffect(() => {
        if (isOpen && autoStartListening && isSupported && !noteToEdit) {
            resetTranscript();
            setAudioData(null);
            startListening();
            startRecordingRobust();
        } else if (!isOpen) {
            stopListening();
            stopRecording();
        }
    }, [isOpen, autoStartListening, noteToEdit, isSupported, resetTranscript, startListening, stopListening, startRecordingRobust]);

    // Transcript handling
    useEffect(() => {
        if (!isListening && transcript) {
            if (noteType === 'text') {
                setContent(prev => (prev ? prev + ' ' : '') + transcript);
            } else {
                setItems(prev => {
                    const newItems = [...prev];
                    const lastIdx = newItems.length - 1;
                    if (newItems[lastIdx].text === '') {
                        newItems[lastIdx].text = transcript;
                    } else {
                        newItems.push({ text: transcript, done: false });
                    }
                    return newItems;
                });
            }
            resetTranscript();
        }
    }, [isListening, transcript, noteType, resetTranscript]);


    // --- HANDLERS ---

    const toggleRecording = () => {
        if (recordingStatus !== 'idle') {
            stopListening();
            stopRecording();
        } else {
            setAudioData(null);
            startListening();
            startRecordingRobust();
        }
    };

    const handlePlayAudio = () => {
        if (!audioRef.current && audioData) {
            audioRef.current = new Audio(audioData);
            audioRef.current.onended = () => setIsPlaying(false);
        }

        if (isPlaying) {
            audioRef.current.pause();
            setIsPlaying(false);
        } else {
            audioRef.current.play();
            setIsPlaying(true);
        }
    };

    const deleteAudio = () => {
        if (window.confirm("Remove this audio recording?")) {
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
            setAudioData(null);
            setIsPlaying(false);
        }
    };

    const toggleNoteType = () => {
        if (noteType === 'text') {
            // Convert to Checklist
            if (content.trim()) {
                const newItems = content.split('\n').map(line => {
                    const isDone = line.trim().toLowerCase().startsWith('[x]');
                    const text = isDone ? line.replace('[x]', '').trim() : line.trim();
                    return { text, done: isDone };
                }).filter(i => i.text);
                setItems(newItems.length > 0 ? newItems : [{ text: '', done: false }]);
            } else {
                setItems([{ text: '', done: false }]);
            }
            setNoteType('shopping');
        } else {
            // Convert to Text
            const joinedState = items
                .filter(i => i.text.trim())
                .map(i => `${i.done ? '[x] ' : ''}${i.text}`)
                .join('\n');
            setContent(joinedState);
            setNoteType('text');
        }
    };

    // File Uploads
    const handleFileUpload = async (e) => {
        const selectedFiles = Array.from(e.target.files);
        if (selectedFiles.length === 0) return;

        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        const invalidFiles = selectedFiles.filter(f => f.size > MAX_SIZE);
        if (invalidFiles.length > 0) {
            alert(`File(s) too large (Max 5MB):\n${invalidFiles.map(f => f.name).join('\n')}`);
            return;
        }

        // Limit Check (Simplified for brevity)
        const allNotes = dataService.getNotes();
        let currentDbCount = allNotes.reduce((acc, note) => acc + (note.files ? note.files.length : 0), 0);
        if (noteToEdit) currentDbCount = Math.max(0, currentDbCount - (noteToEdit.files?.length || 0));

        if (currentDbCount + files.length + selectedFiles.length > 50) {
            alert("Storage Limit Exceeded (Max 50 files total).");
            return;
        }

        const newFileEntries = selectedFiles.map(f => ({
            tempId: crypto.randomUUID(),
            file: f,
            name: f.name,
            type: f.type,
            status: 'uploading',
            progress: 0,
            text: '',
            storageData: null
        }));

        setFiles(prev => [...prev, ...newFileEntries]);

        newFileEntries.forEach(async (entry) => {
            try {
                const uploadPromise = fileStorage.saveFile(entry.file, (progress) => {
                    setFiles(prev => prev.map(f => f.tempId === entry.tempId ? { ...f, progress: Math.round(progress) } : f));
                });
                const ocrPromise = ocrService.extractText(entry.file);
                const [storageData, extractedText] = await Promise.all([uploadPromise, ocrPromise]);

                setFiles(prev => prev.map(f => f.tempId === entry.tempId ? { ...f, status: 'ready', progress: 100, text: extractedText || '', storageData } : f));
            } catch (err) {
                console.error("Upload failed", err);
                setFiles(prev => prev.map(f => f.tempId === entry.tempId ? { ...f, status: 'error' } : f));
            }
        });
    };

    const handleRemoveFile = async (index) => {
        const fileToRemove = files[index];
        if (fileToRemove.storageData) await fileStorage.deleteFile(fileToRemove.storageData);
        else if (fileToRemove.id && !fileToRemove.file) await fileStorage.deleteFile(fileToRemove.id);
        setFiles(files.filter((_, i) => i !== index));
    };

    // Submit
    // Auto-save logic
    const [localId, setLocalId] = useState(noteToEdit?.id || null);
    const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
    const lastSavedData = useRef(null);

    // Initial ID sync
    useEffect(() => { setLocalId(noteToEdit?.id || null); }, [noteToEdit]);

    const performSave = async (shouldClose = false) => {
        if (files.some(f => f.status === 'uploading')) {
            if (shouldClose) alert("Please wait for files to upload.");
            return;
        }

        setSaveStatus('saving');

        try {
            // Derive Title
            let finalTitle = title.trim();
            if (!finalTitle && (noteType === 'text')) {
                // Optional: Auto-generate if empty? User said "If title is not written then only text below".
                // This implies we should NOT auto-generate a title visible in the UI as a header.
                // But we need a title for the DB or search? 
                // Let's set it to empty string or a placeholder that ISN'T displayed as a header in NotesPage.
                // NotesPage logic: if (note.title && note.title !== 'New Note'...) show <h3>.
                // So if we save '', it won't show. Perfection.
                finalTitle = '';
            } else if (!finalTitle && noteType === 'shopping') {
                finalTitle = 'Checklist'; // One exception maybe? Or keep empty.
            }

            // If completely empty and no content, maybe default to "Untitled"?
            // But for now let's respect the "No Title" wish.
            if (!finalTitle && !content && items.length === 0 && files.length === 0) finalTitle = "Untitled Note";

            const finalFiles = files.map(f => {
                if (f.storageData) {
                    return {
                        id: f.storageData.id,
                        name: f.name,
                        type: f.type,
                        url: f.storageData.url,
                        storageType: f.storageData.type,
                        path: f.storageData.path,
                        extractedText: f.text
                    };
                }
                return f;
            });

            const dataToSave = {
                title: finalTitle,
                content: noteType === 'text' ? content : '',
                items: noteType === 'shopping' ? items.filter(i => i.text.trim()) : undefined,
                tags: tags.split(',').map(t => t.trim()).filter(Boolean),
                type: noteType,
                date: noteToEdit ? noteToEdit.date : new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' }),
                files: finalFiles,
                audioData: audioData,
                id: localId || undefined, // Use localId if we created one in this session
                ownerId: noteToEdit?.ownerId, // Preserve owner
                sharedWith: noteToEdit?.sharedWith // Preserve shared
            };

            // Simple check to avoid saving unchanged data recursively
            if (JSON.stringify(dataToSave) === JSON.stringify(lastSavedData.current) && !shouldClose) {
                setSaveStatus('saved');
                return;
            }

            const savedNote = await onSave(dataToSave);

            if (savedNote && savedNote.id) {
                setLocalId(savedNote.id);
                dataToSave.id = savedNote.id;
            }

            lastSavedData.current = dataToSave;
            setSaveStatus('saved');

            if (shouldClose) onClose();

        } catch (error) {
            console.error("Save failed", error);
            setSaveStatus('error');
            if (shouldClose) alert("Failed to save. Please try again.");
        }
    };

    // Debounced Auto-save
    useEffect(() => {
        if (!isOpen) return;

        // Skip initial mount save unless verified dirty? 
        // We'll rely on the 'saving' indicator.

        const timer = setTimeout(() => {
            performSave(false);
        }, 1500);

        return () => clearTimeout(timer);
    }, [content, items, tags, files, audioData, noteType, title]); // Dependencies for auto-save

    const handleSubmit = (e) => {
        if (e) e.preventDefault();
        performSave(true);
    };

    // Sync Ref for ESC handler
    useEffect(() => {
        performSaveRef.current = performSave;
    });

    // Display Logic
    const displayContent = noteType === 'text' ? (content + (isListening && transcript ? ' ' + transcript : '')) : content;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 md:p-6 transition-all overflow-hidden">
            <div className="bg-white dark:bg-gray-900 w-full max-w-2xl h-[85vh] md:h-[80vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 animate-slide-up">

                {/* 1. Header */}
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex items-center gap-3 flex-1 mr-4">
                        <input
                            type="text"
                            placeholder="Title"
                            className="w-full text-lg font-bold text-gray-800 dark:text-gray-100 bg-transparent outline-none placeholder-gray-400"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                        {saveStatus === 'saving' && <span className="text-xs text-orange-500 animate-pulse font-medium shrink-0">Saving...</span>}
                        {saveStatus === 'saved' && <span className="text-xs text-green-500 font-medium shrink-0">Saved</span>}
                        {saveStatus === 'error' && <span className="text-xs text-red-500 font-medium shrink-0">Error saving</span>}
                    </div>
                    <button onClick={() => performSave(true)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 shrink-0">
                        <X size={20} />
                    </button>
                </div>

                {/* 2. Main Content Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 custom-scrollbar relative">

                    {/* Audio Preview */}
                    {audioData && (
                        <div className="mb-6 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-2xl flex items-center gap-4 border border-orange-100 dark:border-orange-800/50">
                            <button onClick={handlePlayAudio} className="w-10 h-10 rounded-full bg-orange-500 shadow-lg shadow-orange-500/30 flex items-center justify-center text-white shrink-0 hover:scale-105 transition-transform">
                                {isPlaying ? <Pause size={18} className="fill-current" /> : <Play size={18} className="fill-current ml-0.5" />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <div className="h-1 bg-orange-200 dark:bg-orange-800 rounded-full overflow-hidden w-full">
                                    <div className={`h-full bg-orange-500 ${isPlaying ? 'animate-progress' : 'w-full'}`}></div>
                                </div>
                                <div className="flex justify-between mt-1.5">
                                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">Voice Note</span>
                                </div>
                            </div>
                            <button
                                onClick={deleteAudio}
                                className="p-2 text-gray-400 hover:text-red-500 transition-colors hover:bg-white dark:hover:bg-gray-800 rounded-full"
                                title="Delete Audio"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    )}

                    {/* Editor */}
                    {noteType === 'text' ? (
                        <textarea
                            ref={textareaRef}
                            className="w-full h-full bg-transparent resize-none outline-none text-lg md:text-xl leading-relaxed text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-gray-600 font-medium"
                            placeholder="Start typing..."
                            value={displayContent}
                            onChange={(e) => setContent(e.target.value)}
                            autoFocus={!noteToEdit}
                        />
                    ) : (
                        <div className="space-y-3">
                            <Reorder.Group axis="y" values={items} onReorder={setItems} className="space-y-3">
                                {items.map((item, idx) => (
                                    <Reorder.Item key={item.id || idx} value={item} className="flex items-start gap-3 group bg-white dark:bg-gray-800 rounded-lg">
                                        <div className="mt-2 text-gray-300 cursor-grab active:cursor-grabbing hover:text-orange-500">
                                            <GripVertical size={16} />
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newItems = [...items];
                                                newItems[idx].done = !newItems[idx].done;
                                                setItems(newItems);
                                            }}
                                            className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.done ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-orange-400'}`}
                                        >
                                            <CheckSquare size={14} className="fill-current" />
                                        </button>
                                        <input
                                            type="text"
                                            placeholder="List item..."
                                            className={`flex-1 bg-transparent border-none outline-none text-lg ${item.done ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}
                                            value={item.text}
                                            onChange={(e) => {
                                                const newItems = [...items];
                                                newItems[idx].text = e.target.value;
                                                setItems(newItems);
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const newItems = [...items];
                                                    const newItem = { text: '', done: false, id: crypto.randomUUID() };
                                                    newItems.splice(idx + 1, 0, newItem);
                                                    setItems(newItems);
                                                    setTimeout(() => {
                                                        const inputs = document.querySelectorAll('input[placeholder="List item..."]');
                                                        if (inputs[idx + 1]) inputs[idx + 1].focus();
                                                    }, 0);
                                                } else if (e.key === 'Backspace' && !item.text && items.length > 1) {
                                                    e.preventDefault();
                                                    const newItems = items.filter((_, i) => i !== idx);
                                                    setItems(newItems);
                                                    setTimeout(() => {
                                                        const inputs = document.querySelectorAll('input[placeholder="List item..."]');
                                                        if (inputs[idx - 1]) inputs[idx - 1].focus();
                                                    }, 0);
                                                }
                                            }}
                                        />
                                        <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-opacity">
                                            <X size={16} />
                                        </button>
                                    </Reorder.Item>
                                ))}
                            </Reorder.Group>
                            <button onClick={() => setItems([...items, { text: '', done: false, id: crypto.randomUUID() }])} className="text-gray-400 hover:text-orange-500 font-medium text-sm pl-8 transition-colors">
                                + Add Item
                            </button>
                        </div>
                    )}


                    {/* Files List (Inline) */}
                    {files.length > 0 && (
                        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-3">
                            {files.map((file, idx) => (
                                <div key={idx} className="relative group bg-gray-50 dark:bg-gray-800 rounded-xl p-3 border border-gray-100 dark:border-gray-700 flex items-center gap-3">
                                    <div
                                        onClick={() => window.open(file.url || URL.createObjectURL(file.file), '_blank')}
                                        className="w-10 h-10 rounded-lg bg-white dark:bg-gray-700 flex items-center justify-center text-gray-500 shrink-0 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                    >
                                        {file.type?.includes('image') ? <ImageIcon size={20} /> : <FileText size={20} />}
                                    </div>
                                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => window.open(file.url || URL.createObjectURL(file.file), '_blank')}>
                                        <p className="text-sm font-medium truncate text-gray-700 dark:text-gray-300 hover:underline">{file.name}</p>
                                        <div className="text-xs text-gray-400">
                                            {file.status === 'uploading' ? `${file.progress}%` : (file.status === 'ready' ? 'Attached' : file.status)}
                                        </div>
                                    </div>
                                    <button onClick={() => handleRemoveFile(idx)} className="absolute -top-1 -right-1 bg-red-100 dark:bg-red-900 text-red-500 rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <X size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Tag Input (Conditional) */}
                    {showTagInput && (
                        <div className="mt-6 flex items-center gap-2 animate-fade-in">
                            <Tag size={16} className="text-gray-400" />
                            <input
                                type="text"
                                placeholder="Add tags (separated by comma)"
                                className="flex-1 bg-transparent border-none outline-none text-sm text-gray-600 dark:text-gray-400 placeholder-gray-400"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                            />
                        </div>
                    )}
                </div>

                {/* 3. Bottom Toolbar */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 backdrop-blur-md sticky bottom-0 z-20">

                    {/* Recording Status Overlay in Toolbar */}
                    {recordingStatus !== 'idle' && (
                        <div className="absolute -top-12 left-0 right-0 flex justify-center px-4">
                            <div className="bg-red-500 text-white text-sm font-bold px-4 py-1.5 rounded-full shadow-lg flex items-center gap-2 animate-bounce-slight">
                                <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                                {recordingStatus === 'paused' ? 'Paused' : 'Recording...'}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-4 h-12">
                        <div className="flex items-center gap-1 md:gap-2 h-full">
                            {/* Mic */}
                            <button
                                onClick={toggleRecording}
                                className={`p-2.5 rounded-full transition-all flex items-center justify-center ${recordingStatus !== 'idle' ? 'bg-red-100 text-red-600 animate-pulse' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                                title="Record Audio"
                            >
                                {recordingStatus !== 'idle' ? <MicOff size={22} /> : <Mic size={22} />}
                            </button>

                            {/* Attach */}
                            <label className={`p-3 rounded-full transition-all cursor-pointer ${files.some(f => f.status === 'uploading') ? 'opacity-50' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                                <Paperclip size={22} />
                            </label>

                            {/* Checklist Toggle */}
                            <button
                                onClick={toggleNoteType}
                                className={`p-3 rounded-full transition-all ${noteType === 'shopping' ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                                title="Toggle Checklist"
                            >
                                <CheckSquare size={22} />
                            </button>

                            {/* Tags Toggle */}
                            <button
                                onClick={() => setShowTagInput(!showTagInput)}
                                className={`p-3 rounded-full transition-all ${showTagInput ? 'text-orange-600 dark:text-orange-400' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                            >
                                <Tag size={22} />
                            </button>
                        </div>

                        <button
                            onClick={handleSubmit}
                            disabled={saveStatus === 'saving' || files.some(f => f.status === 'uploading')}
                            className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-full font-bold shadow-lg hover:shadow-xl hover:scale-105 transition-all text-sm md:text-base flex items-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {saveStatus === 'saving' ? (
                                <>
                                    <Loader2 size={18} className="animate-spin" /> Saving...
                                </>
                            ) : (
                                'Done'
                            )}
                        </button>
                    </div>
                </div>

            </div >
        </div >
    );
};

// Extracted Item for isolated Drag Controls
const ChecklistItem = ({ item, idx, setItems, items }) => {
    const dragControls = useDragControls();

    return (
        <Reorder.Item
            value={item}
            id={item.id}
            dragListener={false}
            dragControls={dragControls}
            className="flex items-start gap-3 group bg-white dark:bg-gray-800 rounded-lg"
        >
            <div
                className="mt-2 text-gray-300 cursor-grab active:cursor-grabbing hover:text-orange-500 touch-none"
                onPointerDown={(e) => dragControls.start(e)}
            >
                <GripVertical size={16} />
            </div>
            <button
                onClick={() => {
                    const newItems = [...items];
                    newItems[idx].done = !newItems[idx].done;
                    setItems(newItems);
                }}
                className={`mt-1 w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.done ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300 dark:border-gray-600 text-transparent hover:border-orange-400'}`}
            >
                <CheckSquare size={14} className="fill-current" />
            </button>
            <input
                type="text"
                placeholder="List item..."
                className={`flex-1 bg-transparent border-none outline-none text-lg ${item.done ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'}`}
                value={item.text}
                onChange={(e) => {
                    const newItems = [...items];
                    newItems[idx].text = e.target.value;
                    setItems(newItems);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const newItems = [...items];
                        const newItem = { text: '', done: false, id: crypto.randomUUID() };
                        newItems.splice(idx + 1, 0, newItem);
                        setItems(newItems);
                        setTimeout(() => {
                            const inputs = document.querySelectorAll('input[placeholder="List item..."]');
                            if (inputs[idx + 1]) inputs[idx + 1].focus();
                        }, 0);
                    } else if (e.key === 'Backspace' && !item.text && items.length > 1) {
                        e.preventDefault();
                        const newItems = items.filter((_, i) => i !== idx);
                        setItems(newItems);
                        setTimeout(() => {
                            const inputs = document.querySelectorAll('input[placeholder="List item..."]');
                            if (inputs[idx - 1]) inputs[idx - 1].focus();
                        }, 0);
                    }
                }}
            />
            <button onClick={() => setItems(items.filter((_, i) => i !== idx))} className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-opacity">
                <X size={16} />
            </button>
        </Reorder.Item>
    );
};

export default AddNoteModal;
