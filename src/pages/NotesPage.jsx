import React, { useState, useEffect, useRef } from 'react';
import { useShare } from '../hooks/useShare';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Mic, Image as ImageIcon, Edit2, Trash2, X, MoreVertical, Share2, FileText, ShoppingCart, StopCircle, Play, ArrowRightLeft, Paperclip, Download, Eye, Users, GripVertical, Pin, Maximize2, Minimize2 } from 'lucide-react';
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion';
import { useVoice } from '../hooks/useVoice';
import { fileStorage } from '../services/fileStorage';
import AddNoteModal from '../components/notes/AddNoteModal';
import TextPreviewModal from '../components/common/TextPreviewModal';
import { dataService } from '../services/data';
import ShareModal from '../components/common/ShareModal';
import { useAuth } from '../context/AuthContext';
import NoteCard from '../components/notes/NoteCard';

const NotesPage = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const refs = useRef({});
    const [playingNoteId, setPlayingNoteId] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const isSelectionMode = selectedIds.size > 0;
    const [highlightedId, setHighlightedId] = useState(null);

    const handleToggleSelect = (id) => {
        setHighlightedId(null); // Clear highlights immediately on selection
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleClearSelection = () => {
        setSelectedIds(new Set());
        setHighlightedId(null);
    };

    // Auto-clear highlight when selection mode active
    useEffect(() => {
        if (isSelectionMode && highlightedId) {
            setHighlightedId(null);
        }
    }, [isSelectionMode, highlightedId]);

    // Highlight logic
    useEffect(() => {
        if (location.state?.focusId) {
            setHighlightedId(location.state.focusId);
            setTimeout(() => setHighlightedId(null), 3000);

            // Scroll to element
            const element = refs.current[location.state.focusId];
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        if (location.state?.convertFromReminder) {
            const reminder = location.state.convertFromReminder;
            const convertedNote = dataService.convertReminderToNote(reminder);
            setEditingNote(convertedNote);
            setIsModalOpen(true);
            window.history.replaceState({}, document.title);
        }

        if (location.state?.openAdd) {
            handleAddNew('text');
            window.history.replaceState({}, document.title);
        }

        if (location.state?.searchQuery) {
            setSearchQuery(location.state.searchQuery);
        }
    }, [location.state]);

    const handlePlayAudio = (note) => {
        if (playingNoteId === note.id) {
            window.speechSynthesis.cancel();
            setPlayingNoteId(null);
            return;
        }

        window.speechSynthesis.cancel();
        setPlayingNoteId(note.id);

        if (note.audioData) {
            const audio = new Audio(note.audioData);
            audio.onended = () => setPlayingNoteId(null);
            audio.play().catch(e => {
                console.error("Playback error", e);
                setPlayingNoteId(null);
                alert("Could not play audio.");
            });
        } else {
            const utterance = new SpeechSynthesisUtterance(note.content);
            utterance.onend = () => setPlayingNoteId(null);
            window.speechSynthesis.speak(utterance);
        }
    };

    const [activeTab, setActiveTab] = useState('All Notes');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingNote, setEditingNote] = useState(null);
    const [newNoteType, setNewNoteType] = useState('text');
    const [autoStartVoice, setAutoStartVoice] = useState(false);
    const [notes, setNotes] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [triggerReload, setTriggerReload] = useState(0);
    const [previewData, setPreviewData] = useState(null);
    const [sharingNote, setSharingNote] = useState(null);
    const { share } = useShare();

    useEffect(() => {
        const loadNotes = () => setNotes(dataService.getNotes());
        loadNotes();
        const handleStorageUpdate = () => loadNotes();
        window.addEventListener('storage-update', handleStorageUpdate);
        return () => window.removeEventListener('storage-update', handleStorageUpdate);
    }, [triggerReload]);

    const handleAddNew = (type = 'text', startVoice = false) => {
        setEditingNote(null);
        setNewNoteType(type);
        setAutoStartVoice(startVoice);
        setIsModalOpen(true);
    };

    const handleEdit = (note) => {
        setEditingNote(note);
        setIsModalOpen(true);
    };

    const handleSave = async (data) => {
        let savedParams;
        if (data.id && !data.forceCreate) {
            await dataService.updateNote(data.id, data);
            savedParams = data;
        } else {
            // Remove forceCreate flag before sending to service
            const { forceCreate, ...cleanData } = data;
            savedParams = await dataService.addNote(cleanData);
        }
        setTriggerReload(prev => prev + 1);
        return savedParams;
    };



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

    const getFilteredNotes = () => {
        let filtered = notes;

        if (activeTab === 'Voice') {
            filtered = notes.filter(n => n.type === 'voice' || n.audioData);
        } else if (activeTab === 'Checklist') {
            filtered = notes.filter(n => n.type === 'shopping');
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

    const handleBatchDelete = () => {
        if (window.confirm(`Delete ${selectedIds.size} notes?`)) {
            selectedIds.forEach(id => dataService.deleteNote(id));
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
            dataService.updateNote(note.id, { isPinned: !allPinned });
        });
        setTriggerReload(prev => prev + 1);
        handleClearSelection();
    };

    const handleBatchShare = () => {
        // We can't really batch share nicely in UI without a Loop of prompts or a new Modal.
        // User asked for "Share" in batch actions.
        // "Share" usually implies opening the Share Modal. 
        // If multiple selected, maybe we shouldn't support sharing multiple via Email link (mailto limit).
        // If internal sharing, we can add a list of users.
        // For now, let's disable Share if > 1 or show alert.
        if (selectedIds.size === 1) {
            const note = notes.find(n => n.id === Array.from(selectedIds)[0]);
            setSharingNote(note);
            handleClearSelection();
        } else {
            alert("Batch sharing not supported yet. Please select one note.");
        }
    };

    const handleBatchConvert = () => {
        if (selectedIds.size === 1) {
            const note = notes.find(n => n.id === Array.from(selectedIds)[0]);
            navigate('/reminders', { state: { convertFromNote: note } });
            handleClearSelection();
        }
    };


    const filteredNotes = getFilteredNotes();

    return (
        <div
            className="max-w-6xl mx-auto pb-24 md:pb-10 relative min-h-screen"
            onClick={(e) => {
                // Click outside to deselect
                if (isSelectionMode && !e.target.closest('.card') && !e.target.closest('button')) {
                    handleClearSelection();
                }
            }}
        >
            {/* FLOATING ACTION BAR FOR BATCH ACTIONS */}
            <AnimatePresence>
                {isSelectionMode && (
                    <motion.div
                        initial={{ y: 100, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 100, opacity: 0 }}
                        className="fixed bottom-24 md:bottom-10 left-0 right-0 mx-auto w-fit bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-6 py-3 rounded-full shadow-2xl z-50 flex items-center gap-6 border border-gray-100 dark:border-gray-800"
                    >
                        <span className="font-bold text-sm whitespace-nowrap text-gray-900 dark:text-white">{selectedIds.size} Selected</span>

                        <div className="h-6 w-px bg-gray-200 dark:bg-gray-700"></div>

                        <div className="flex gap-4">
                            <button onClick={handleBatchPin} title="Pin/Unpin" className="hover:text-orange-500 transition-colors">
                                <Pin size={20} />
                            </button>
                            <button onClick={handleBatchDelete} title="Delete" className="hover:text-red-500 transition-colors">
                                <Trash2 size={20} />
                            </button>

                            {selectedIds.size === 1 && (
                                <>
                                    <button onClick={handleBatchShare} title="Share" className="hover:text-blue-400 transition-colors">
                                        <Share2 size={20} />
                                    </button>
                                    <button onClick={handleBatchConvert} title="Convert to Reminder" className="hover:text-orange-400 transition-colors">
                                        <ArrowRightLeft size={20} />
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
            <div className="sticky top-20 z-30 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur-sm -mx-4 px-4 py-2 border-b border-gray-200 dark:border-gray-800 md:static md:bg-transparent md:p-0 md:border-none md:mb-6 transition-all">
                <div className="flex flex-col gap-3">


                    <div className="flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 shadow-sm text-sm"
                            />
                            {searchQuery && (
                                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1 items-center">
                        {['All Notes', 'Voice', 'Text', 'Lists'].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${(activeTab === tab)
                                    ? 'bg-orange-600 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                                    }`}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </div>
            </div>




            {isModalOpen && (
                <AddNoteModal
                    isOpen={isModalOpen}
                    onClose={() => {
                        setIsModalOpen(false);
                        setAutoStartVoice(false);
                    }}
                    onSave={handleSave}
                    noteToEdit={editingNote}
                    initialType={newNoteType}
                    autoStartListening={autoStartVoice}
                    searchQuery={searchQuery}
                />
            )}

            <TextPreviewModal
                isOpen={!!previewData}
                onClose={() => setPreviewData(null)}
                title={previewData?.title || ''}
                text={previewData?.text || ''}
                searchQuery={searchQuery}
            />

            <ShareModal
                isOpen={!!sharingNote}
                onClose={() => setSharingNote(null)}
                note={sharingNote}
            />

            {/* Notes Grid */}
            <div className="mt-4 md:mt-0 space-y-8">
                {(!searchQuery && activeTab === 'All Notes') ? (
                    <>
                        {/* PINNED SECTION */}
                        {filteredNotes.some(n => n.isPinned) && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[10px] font-black tracking-widest text-gray-400 dark:text-gray-500 uppercase">Pinned</span>
                                </div>
                                <Reorder.Group
                                    axis="y"
                                    values={filteredNotes.filter(n => n.isPinned)}
                                    onReorder={(newPinnedOrder) => {
                                        const unpinned = notes.filter(n => !n.isPinned);
                                        const merged = [...newPinnedOrder, ...unpinned];
                                        setNotes(merged);
                                        dataService.reorderNotes(merged);
                                    }}
                                    as="div"
                                    className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
                                >
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
                                                setSharingNote={setSharingNote}
                                                setTriggerReload={setTriggerReload}
                                                navigate={navigate}
                                                playingNoteId={playingNoteId}
                                                handlePlayAudio={handlePlayAudio}
                                                searchQuery={searchQuery}
                                                setPreviewData={setPreviewData}
                                                isReorderable={true}
                                            />
                                        ))}
                                    </AnimatePresence>
                                </Reorder.Group>
                            </div>
                        )}

                        {/* OTHERS SECTION */}
                        <div className="space-y-4">
                            {filteredNotes.some(n => n.isPinned) && (
                                <div className="flex items-center gap-2 px-1">
                                    <span className="text-[10px] font-black tracking-widest text-gray-400 dark:text-gray-500 uppercase">Others</span>
                                </div>
                            )}
                            <Reorder.Group
                                axis="y"
                                values={filteredNotes.filter(n => !n.isPinned)}
                                onReorder={(newOthersOrder) => {
                                    const pinned = notes.filter(n => n.isPinned);
                                    const merged = [...pinned, ...newOthersOrder];
                                    setNotes(merged);
                                    dataService.reorderNotes(merged);
                                }}
                                as="div"
                                className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
                            >
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
                                            setSharingNote={setSharingNote}
                                            setTriggerReload={setTriggerReload}
                                            navigate={navigate}
                                            playingNoteId={playingNoteId}
                                            handlePlayAudio={handlePlayAudio}
                                            searchQuery={searchQuery}
                                            setPreviewData={setPreviewData}
                                            isReorderable={true}
                                        />
                                    ))}
                                </AnimatePresence>
                            </Reorder.Group>
                        </div>
                    </>
                ) : (
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
                                    setSharingNote={setSharingNote}
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

                {filteredNotes.length === 0 && (
                    <div className="col-span-full text-center py-20 text-gray-400 flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <FileText size={32} className="opacity-50" />
                        </div>
                        <p className="font-medium">No notes found.</p>
                        <p className="text-sm opacity-60">Tap + to create one.</p>
                    </div>
                )}
            </div>

            <div className="fixed bottom-24 md:bottom-10 right-6 md:right-10 z-40 flex flex-col gap-3 items-center">
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
