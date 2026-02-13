import React, { useState, useEffect, useRef } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { haptics } from '../services/haptics';
import { useShare } from '../hooks/useShare';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Mic, Image as ImageIcon, Edit2, Trash2, X, MoreVertical, Share2, FileText, ShoppingCart, StopCircle, Play, ArrowRightLeft, Paperclip, Download, Eye, Users, GripVertical, Pin, Maximize2, Minimize2, XCircle, RefreshCcw, Bell } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { useVoice } from '../hooks/useVoice';
import { fileStorage } from '../services/fileStorage';
import AddNoteModal from '../components/notes/AddNoteModal';
import TextPreviewModal from '../components/common/TextPreviewModal';
import { dataService } from '../services/data';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import NoteCard from '../components/notes/NoteCard';

const NotesPage = () => {
    const { user } = useAuth();
    const { openNoteModal, openShareModal } = useUI();
    const location = useLocation();
    const navigate = useNavigate();
    const refs = useRef({});
    const [playingNoteId, setPlayingNoteId] = useState(null);
    const audioRef = useRef(null); // Fix: Track audio instance
    const [selectedIds, setSelectedIds] = useState(new Set());
    const isSelectionMode = selectedIds.size > 0;
    const [highlightedId, setHighlightedId] = useState(null);


    // --- Deep Link Handling ---
    useEffect(() => {
        // Check if navigating to a specific note ID
        if (location.state?.noteId) {
            setHighlightedId(location.state.noteId);

            // Open Modal if coming from Search
            if (location.state.searchQuery) {
                // Notes are loaded in 'notes' state, but might not be ready on first render if dataService is async?
                // dataService.getNotes() is sync (returns local cache).
                const allNotes = dataService.getNotes();
                const note = allNotes.find(n => n.id === location.state.noteId);
                if (note) {
                    // Pass searchQuery to auto-scroll
                    openNoteModal({ noteToEdit: note, searchQuery: location.state.searchQuery });
                }
            }

            // Scroll into view after a tick
            setTimeout(() => {
                refs.current[location.state.noteId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
        if (location.state?.convertFromReminder) {
            const reminder = location.state.convertFromReminder;
            const convertedNote = dataService.convertReminderToNote(reminder);
            openNoteModal({ noteToEdit: convertedNote });
            window.history.replaceState({}, document.title);
        }
        // Check for state OR query params
        const params = new URLSearchParams(location.search);
        if (location.state?.openAdd || params.get('add') === 'true') {
            openNoteModal({ type: 'text' });
            navigate(location.pathname, { replace: true, state: {} });
        }
    }, [location.state, location.search]);


    const [activeTab, setActiveTab] = useState('All Notes');
    // const [isModalOpen, setIsModalOpen] = useState(false); // REMOVED
    // const [editingNote, setEditingNote] = useState(null); // REMOVED
    // const [newNoteType, setNewNoteType] = useState('text'); // REMOVED
    // const [autoStartVoice, setAutoStartVoice] = useState(false); // REMOVED
    const [notes, setNotes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [triggerReload, setTriggerReload] = useState(0);
    const [previewData, setPreviewData] = useState(null);

    // Pull to Refresh State
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [pullY, setPullY] = useState(0);
    const touchStartRef = useRef(0);

    // --- Load Notes ---
    useEffect(() => {
        const loadNotes = () => {
            const allNotes = dataService.getNotes();
            setNotes(allNotes);
        };
        loadNotes();

        const handleStorageUpdate = () => {
            loadNotes();
        };

        window.addEventListener('storage-update', handleStorageUpdate);
        return () => window.removeEventListener('storage-update', handleStorageUpdate);
    }, [triggerReload]);

    const handleTouchStart = (e) => {
        if (window.scrollY === 0) {
            touchStartRef.current = e.touches[0].clientY;
        }
    };

    const handleTouchMove = (e) => {
        if (touchStartRef.current > 0 && window.scrollY === 0) {
            const y = e.touches[0].clientY - touchStartRef.current;
            if (y > 0) {
                setPullY(y > 100 ? 100 + (y - 100) * 0.3 : y);
            }
        }
    };

    const handleTouchEnd = async () => {
        if (pullY > 80 && !isRefreshing) {
            haptics.medium();
            setIsRefreshing(true);
            setPullY(0);
            await dataService.forceSync();
            setTimeout(() => setIsRefreshing(false), 500);
        } else {
            setPullY(0);
        }
        touchStartRef.current = 0;
    };


    const handleAddNew = (type = 'text', startVoice = false) => {
        openNoteModal({ type, autoStart: startVoice });
    };

    const handleEdit = (note) => {
        openNoteModal({ noteToEdit: note, searchQuery: searchQuery });
    };

    const handleSave = async (data) => {
        if (data.id) {
            await dataService.updateNote(data.id, data);
            setTriggerReload(prev => prev + 1); // Ensure UI refreshes
        }
    };

    // handleDelete - Global modal handles it too? 
    // AddNoteModal call in App.jsx:
    // onDelete={async (id) => { await dataService.deleteNote(id); closeNoteModal(); ... }}
    // The NoteCard calls handleEdit -> openGlobalModal -> Modal has delete button.
    // What about "Select Mode" delete? NoteCard doesn't delete, it edits or selects.
    // So distinct delete handlers? 
    // NoteCard has NO delete button on card face? 
    // It has Context menu? 
    // Let's keep handleDelete for now if it's used elsewhere? 
    // It is passed to NoteCard? 
    // <NoteCard ... handleEdit={handleEdit} ... />
    // It DOES NOT pass handleDelete to NoteCard.
    // So handleDelete was only for the Modal.
    // So we can remove it.

    const handleDelete = async (id) => {
        // local unused
    };

    // --- Audio Playback Handlers ---
    // --- Audio Playback Handlers ---
    const handlePlayAudio = (note) => {
        const noteId = note.id;
        const audioData = note.audioData;

        // Stop if currently playing
        if (playingNoteId === noteId && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setPlayingNoteId(null);
            return;
        }

        // Stop any other currently playing audio first
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        if (!audioData) {
            console.error("No audio data found for note", noteId);
            return;
        }

        const audio = new Audio(audioData);
        audioRef.current = audio;
        setPlayingNoteId(noteId);

        audio.onended = () => {
            setPlayingNoteId(null);
            audioRef.current = null;
        };

        audio.onerror = (e) => {
            console.error("Audio playback error", e);
            setPlayingNoteId(null);
            audioRef.current = null;
            alert("Playback failed. This could be due to a connection issue or unsupported audio format on this device.");
        };

        audio.play().catch(err => {
            console.error('Error playing audio:', err);
            setPlayingNoteId(null);
        });
    };

    const handleStopAudio = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setPlayingNoteId(null);
    };

    // ... (rest of render)

    // AddNoteModal removed - using Global Modal from App.jsx





    // --- EFFECT: Handle Hardware Back Button for Selection Mode ---
    React.useEffect(() => {
        const handlePopState = (event) => {
            if (isSelectionMode) {
                // Return to normal mode (Deselect All)
                handleClearSelection();
                // Prevent browser back navigation if possible (stay on page)
                window.history.pushState(null, '', window.location.pathname);
            }
        };

        if (isSelectionMode) {
            // Push a state so we have something to "pop"
            window.history.pushState(null, '', window.location.pathname);
            window.addEventListener('popstate', handlePopState);
        }

        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isSelectionMode]);

    // --- Selection Handlers ---
    const handleToggleSelect = (noteId) => {
        haptics.selection();
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(noteId)) {
                newSet.delete(noteId);
            } else {
                newSet.add(noteId);
            }
            return newSet;
        });
    };

    const handleClearSelection = () => {
        setSelectedIds(new Set());
    };

    const getFilteredNotes = () => {
        let filtered = notes;

        if (activeTab === 'Voice') {
            filtered = notes.filter(n => n.type === 'voice' || n.audioData);
        } else if (activeTab === 'Lists') {
            filtered = notes.filter(n => n.type === 'shopping' || n.type === 'list');
        } else if (activeTab === 'Shared') {
            filtered = notes.filter(n => (n.ownerId && n.ownerId !== user?.uid) || (n.sharedWith && n.sharedWith.length > 0));
        } else if (activeTab === 'Text') {
            filtered = notes.filter(n => n.type === 'text');
        }

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(note =>
                note.title.toLowerCase().includes(query) ||
                (note.content && note.content.toLowerCase().includes(query)) ||
                (note.items && note.items.some(i => i.text.toLowerCase().includes(query))) ||
                (note.tags && note.tags.some(t => t.toLowerCase().includes(query))) ||
                (note.files && note.files.some(f => f.name.toLowerCase().includes(query) || (f.extractedText && f.extractedText.toLowerCase().includes(query))))
            );
        }

        // Sort: Pinned first
        return [...filtered].sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return 0; // Keep existing order
        });
    };





    const handleNoteClick = (note) => {
        if (isSelectionMode) {
            handleToggleSelect(note.id);
        } else {
            handleEdit(note);
        }
    };

    const handleBatchDelete = async () => {
        // Enforce Ownership
        const nonOwned = Array.from(selectedIds).some(id => {
            const n = notes.find(note => note.id === id);
            return n.ownerId && n.ownerId !== user?.uid;
        });

        if (nonOwned) {
            alert("You cannot delete notes shared with you. Please deselect them.");
            return;
        }

        if (window.confirm(`Delete ${selectedIds.size} notes?`)) {
            // Wait for all delete operations to complete
            await Promise.all(Array.from(selectedIds).map(id => dataService.deleteNote(id)));
            haptics.heavy();
            setTriggerReload(prev => prev + 1);
            handleClearSelection();
        }
    };

    const handleBatchPin = () => {
        const selectedNotes = notes.filter(n => selectedIds.has(n.id));
        // If ALL selected are pinned -> Unpin them.
        // Otherwise -> Pin them all.
        const allPinned = selectedNotes.every(n => n.isPinned);

        selectedNotes.forEach(note => {
            // Pinning is a local user preference usually, but in this app it's stored on the note.
            // If it's stored on the note and synced, then a shared user pinning it pins it for everyone?
            // Handbook says: "Local wins for isPinned (ephemeral UI state)". 
            // So we can allow pinning shared notes if it's treated as local state or if we don't care about sync impact for now.
            // Requirement was: "No share and delete button". Didn't mention Pin.
            dataService.updateNote(note.id, { isPinned: !allPinned });
        });
        setTriggerReload(prev => prev + 1);
        handleClearSelection();
    };

    const handleBatchShare = () => {
        if (selectedIds.size === 1) {
            const note = notes.find(n => n.id === Array.from(selectedIds)[0]);

            // Enforce Ownership
            if (note.ownerId && note.ownerId !== user?.uid) {
                alert("You cannot share a note you don't own.");
                return;
            }

            openShareModal(note);
            handleClearSelection();
        } else {
            alert("Batch sharing not supported yet. Please select one note.");
        }
    };

    const handleBatchConvert = () => {
        if (selectedIds.size === 1) {
            const note = notes.find(n => n.id === Array.from(selectedIds)[0]);

            // Format Content if Checklist
            let convertedNote = { ...note };
            if (note.type === 'shopping' && note.items && note.items.length > 0) {
                convertedNote.content = note.items
                    .filter(i => !i.done) // keep all or active? Let's keep active for reminders
                    .map(i => `- ${i.text} ${i.done ? '(Done)' : ''}`)
                    .join('\n');
            }

            navigate('/reminders', { state: { convertFromNote: convertedNote } });
            handleClearSelection();
        }
    };


    const filteredNotes = getFilteredNotes();

    return (
        <div
            className="max-w-6xl mx-auto pb-28 md:pb-10 pb-safe relative min-h-screen px-4 md:px-0"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={(e) => {
                // Click outside to deselect
                if (isSelectionMode && !e.target.closest('.card') && !e.target.closest('button')) {
                    handleClearSelection();
                }
            }}
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
            {/* FLOATING ACTION BAR FOR BATCH ACTIONS */}
            <AnimatePresence>
                {isSelectionMode && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-24 md:bottom-10 pb-safe left-0 right-0 mx-auto w-fit bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-6 border border-gray-100 dark:border-gray-800"
                    >
                        <span className="font-bold text-sm whitespace-nowrap text-gray-900 dark:text-white">{selectedIds.size} Selected</span>

                        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>

                        <div className="flex gap-4">
                            <button onClick={handleBatchPin} title="Pin/Unpin" className="hover:text-orange-500 transition-colors">
                                <Pin size={20} />
                            </button>
                            {/* Only show Delete if ALL selected notes are owned by the user */}
                            {Array.from(selectedIds).every(id => {
                                const n = notes.find(note => note.id === id);
                                return n && (!n.ownerId || n.ownerId === user?.uid);
                            }) && (
                                    <button onClick={handleBatchDelete} title="Delete" className="hover:text-red-500 transition-colors">
                                        <Trash2 size={20} />
                                    </button>
                                )}

                            {selectedIds.size === 1 && (
                                <>
                                    {/* Only show Share if the single selected note is owned by the user */}
                                    {(() => {
                                        const noteId = Array.from(selectedIds)[0];
                                        const note = notes.find(n => n.id === noteId);
                                        const isOwner = note && (!note.ownerId || note.ownerId === user?.uid);
                                        return isOwner ? (
                                            <button onClick={handleBatchShare} title="Share" className="hover:text-blue-400 transition-colors">
                                                <Share2 size={20} />
                                            </button>
                                        ) : null;
                                    })()}
                                    <button onClick={handleBatchConvert} title="Convert to Reminder" className="hover:text-orange-400 transition-colors">
                                        <Bell size={20} />
                                    </button>
                                </>
                            )}
                        </div>

                        <div className="h-6 w-px bg-gray-700 dark:bg-gray-200"></div>

                        <button onClick={handleClearSelection} className="hover:opacity-75 transition-opacity">
                            <X size={20} />
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* STICKY HEADER & SEARCH */}
            <div className="sticky top-0 md:static z-30 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-sm -mx-4 px-4 py-2 border-b border-gray-200 dark:border-gray-700/50 md:bg-transparent md:p-0 md:border-none md:mb-6 transition-all shadow-sm md:shadow-none">
                <div className="flex flex-col gap-2">

                    {/* Persistent Search Bar */}
                    <div className="flex items-center gap-2 bg-white dark:bg-gray-900 p-2 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 animate-fade-in my-1">
                        <Search size={20} className="text-gray-400 ml-2" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                const val = e.target.value;
                                setSearchQuery(val);
                                // FIX: Sync history state immediately so "Back" button doesn't restore stale search
                                // ALSO: Clear noteId so we don't trigger "Open Note" effect while typing
                                navigate(location.pathname, {
                                    replace: true,
                                    state: { ...location.state, searchQuery: val || undefined, noteId: undefined }
                                });
                            }}
                            placeholder="Search notes, text, files..."
                            className="flex-1 bg-transparent border-none outline-none text-gray-900 dark:text-white placeholder:text-gray-400 text-base"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => {
                                    setSearchQuery('');
                                    navigate(location.pathname, { replace: true, state: { ...location.state, searchQuery: undefined } });
                                }}
                                className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                                <XCircle size={18} />
                            </button>
                        )}
                    </div>

                    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 items-center">
                        {['All Notes', 'Voice', 'Text', 'Lists', 'Shared'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${(activeTab === tab)
                                    ? 'bg-orange-600 text-white shadow-md shadow-orange-500/20'
                                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            </div >




            {/* REMOVED AddNoteModal - Using Global */}

            <TextPreviewModal
                isOpen={!!previewData}
                onClose={() => setPreviewData(null)}
                title={previewData?.title || ''}
                text={previewData?.text || ''}
                imageUrl={previewData?.imageUrl || previewData?.url}
                searchQuery={searchQuery}
            />

            {/* Share Modal - Global in App.jsx now */}

            {/* Notes Grid */}
            <div className="mt-2 md:mt-0 space-y-4 md:space-y-8">
                {(!searchQuery || !searchQuery.trim()) ? (
                    <>
                        {/* PINNED SECTION */}
                        {filteredNotes.some(n => n.isPinned) && (
                            <div className="space-y-4">
                                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    <AnimatePresence>
                                        {filteredNotes.filter(n => n.isPinned).map((note) => (
                                            <NoteCard
                                                key={note.id}
                                                note={note}
                                                user={user}
                                                isSelected={selectedIds.has(note.id)}
                                                isSelectionMode={isSelectionMode}
                                                highlightedId={highlightedId}
                                                onToggleSelect={handleToggleSelect}
                                                onClick={handleNoteClick}
                                                handleEdit={handleEdit}
                                                handleSave={handleSave}
                                                setSharingNote={openShareModal}
                                                setTriggerReload={setTriggerReload}
                                                navigate={navigate}
                                                playingNoteId={playingNoteId}
                                                handlePlayAudio={handlePlayAudio}
                                                searchQuery={searchQuery}
                                                setPreviewData={setPreviewData}
                                                isReorderable={false}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </div>
                            </div>
                        )}

                        {/* OTHERS SECTION */}
                        <div className="space-y-4">
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                <AnimatePresence>
                                    {filteredNotes.filter(n => !n.isPinned).map((note) => (
                                        <NoteCard
                                            key={note.id}
                                            note={note}
                                            user={user}
                                            isSelected={selectedIds.has(note.id)}
                                            isSelectionMode={isSelectionMode}
                                            highlightedId={highlightedId}
                                            onToggleSelect={handleToggleSelect}
                                            onClick={handleNoteClick}
                                            handleEdit={handleEdit}
                                            handleSave={handleSave}
                                            setSharingNote={openShareModal}
                                            setTriggerReload={setTriggerReload}
                                            navigate={navigate}
                                            playingNoteId={playingNoteId}
                                            handlePlayAudio={handlePlayAudio}
                                            searchQuery={searchQuery}
                                            setPreviewData={setPreviewData}
                                            isReorderable={false}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    </>
                ) : (
                    /* SEARCH RESULTS */
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {filteredNotes.map((note) => (
                                <NoteCard
                                    key={note.id}
                                    note={note}
                                    user={user}
                                    isSelected={selectedIds.has(note.id)}
                                    isSelectionMode={isSelectionMode}
                                    highlightedId={highlightedId}
                                    onToggleSelect={handleToggleSelect}
                                    onClick={handleNoteClick}
                                    handleEdit={handleEdit}
                                    handleSave={handleSave}
                                    setSharingNote={openShareModal}
                                    setTriggerReload={setTriggerReload}
                                    navigate={navigate}
                                    playingNoteId={playingNoteId}
                                    handlePlayAudio={handlePlayAudio}
                                    searchQuery={searchQuery}
                                    setPreviewData={setPreviewData}
                                    isReorderable={false}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            {
                filteredNotes.length === 0 && (
                    <div className="col-span-full text-center py-20 text-gray-400 flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <FileText size={32} className="opacity-50" />
                        </div>
                        <p className="font-medium">No notes found.</p>
                        <p className="text-sm opacity-60">Tap + to create one.</p>
                    </div>
                )
            }


            <div className="fixed bottom-32 md:bottom-10 right-6 md:right-10 z-[100] flex flex-col gap-3 items-center pb-safe">
                <button
                    onClick={() => handleAddNew('text', true)}
                    className="w-12 h-12 bg-white dark:bg-gray-800 text-orange-600 shadow-lg rounded-full flex items-center justify-center border border-gray-100 dark:border-gray-700 hover:scale-105 transition-transform"
                    title="Record Audio"
                >
                    <Mic size={20} />
                </button>
                <button
                    onClick={() => handleAddNew('text')}
                    className="w-16 h-16 bg-gradient-to-tr from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-full shadow-lg shadow-orange-500/40 flex items-center justify-center hover:scale-105 transition-transform"
                    title="New Note"
                >
                    <Plus size={32} />
                </button>
            </div>
        </div >
    );
};

export default NotesPage;
