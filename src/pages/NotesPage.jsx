import React, { useState, useEffect, useRef } from 'react';
import { useShare } from '../hooks/useShare';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Mic, Image as ImageIcon, Edit2, Trash2, X, MoreVertical, Share2, FileText, ShoppingCart, StopCircle, Play, ArrowRightLeft, Paperclip, Download, Eye, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoice } from '../hooks/useVoice';
import { fileStorage } from '../services/fileStorage';
import AddNoteModal from '../components/notes/AddNoteModal';
import TextPreviewModal from '../components/common/TextPreviewModal';
import { dataService } from '../services/data';
import ShareModal from '../components/common/ShareModal';
import { useAuth } from '../context/AuthContext';

const NotesPage = () => {
    const { user } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();
    const refs = useRef({});
    const [playingNoteId, setPlayingNoteId] = useState(null);

    // Highlight logic
    useEffect(() => {
        if (location.state?.focusId) {
            const element = refs.current[location.state.focusId];
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                element.classList.add('ring-4', 'ring-orange-200');
                setTimeout(() => element.classList.remove('ring-4', 'ring-orange-200'), 2000);
            }
        }

        if (location.state?.convertFromReminder) {
            const reminder = location.state.convertFromReminder;
            const convertedNote = {
                title: reminder.title,
                content: `Frequency: ${reminder.frequency}\nInstructions: ${reminder.instructions || 'None'}`,
                type: 'text',
                tags: [reminder.type]
            };
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

    const handleSave = (data) => {
        if (data.id) {
            dataService.updateNote(data.id, data);
        } else {
            dataService.addNote(data);
        }
        setTriggerReload(prev => prev + 1);
    };

    const getFilteredNotes = () => {
        let currentNotes = notes;
        if (searchQuery.trim()) {
            const searchResults = dataService.search(searchQuery);
            currentNotes = searchResults.notes;
        }
        return currentNotes.filter(n => {
            if (activeTab === 'All Notes') return true;
            if (activeTab === 'Voice') return n.type === 'voice';
            if (activeTab === 'Text') return n.type === 'text';
            if (activeTab === 'Lists') return n.type === 'shopping';
            return true;
        });
    };

    const filteredNotes = getFilteredNotes();

    return (
        <div className="max-w-6xl mx-auto pb-24 md:pb-10 relative min-h-screen">
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
            <motion.div layout className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4 md:mt-0">
                <AnimatePresence>
                    {filteredNotes.map((note) => (
                        <motion.div
                            layout
                            ref={el => refs.current[note.id] = el}
                            initial={{ opacity: 0, y: 10 }} // Subtler animation
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            key={note.id}
                            onClick={() => handleEdit(note)}
                            className={`card group cursor-pointer hover:ring-2 hover:ring-orange-100 dark:hover:ring-orange-900 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:shadow-md transition-all border-l-4 ${note.type === 'voice' ? 'border-l-teal-500' :
                                note.type === 'shopping' ? 'border-l-yellow-500' :
                                    'border-l-orange-500'
                                }`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex gap-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${note.type === 'voice' ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-100 dark:border-teal-800 text-teal-600 dark:text-teal-400' :
                                        note.type === 'shopping' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-100 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400' : 'bg-orange-50 dark:bg-orange-900/20 border-orange-100 dark:border-orange-800 text-orange-600 dark:text-orange-400'
                                        }`}>
                                        {note.type === 'voice' ? <Mic size={16} /> :
                                            note.type === 'shopping' ? <ShoppingCart size={16} /> : <FileText size={16} />}
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-900 dark:text-gray-100 leading-tight text-sm truncate pr-2">{note.title}</h3>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{note.date}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                    {note.ownerId === user?.uid && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSharingNote(note); }}
                                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-orange-600 transition-colors"
                                        >
                                            <Share2 size={16} />
                                        </button>
                                    )}
                                    {note.ownerId === user?.uid && (
                                        <button onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm('Delete this note?')) {
                                                dataService.deleteNote(note.id);
                                                setTriggerReload(prev => prev + 1);
                                            }
                                        }} className="p-2 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors">
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate('/reminders', { state: { convertFromNote: note } });
                                        }}
                                        className="p-2 rounded-full hover:bg-orange-50 dark:hover:bg-orange-900/30 text-gray-400 hover:text-orange-500 transition-colors"
                                        title="Convert to Reminder"
                                    >
                                        <ArrowRightLeft size={16} />
                                    </button>
                                </div>
                            </div>

                            {(note.type === 'voice' || note.audioData) && (
                                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-2 border border-gray-100 dark:border-gray-700 mb-3 group-hover:border-gray-200 transition-colors" onClick={e => e.stopPropagation()}>
                                    <button
                                        onClick={() => handlePlayAudio(note)}
                                        className={`w-full h-8 bg-white dark:bg-gray-800 rounded-lg border flex items-center justify-center gap-2 text-xs font-medium transition-all shadow-sm ${playingNoteId === note.id ? 'border-orange-200 text-orange-600 bg-orange-50' : 'border-gray-200 text-gray-700 hover:text-teal-600'}`}
                                    >
                                        {playingNoteId === note.id ? <StopCircle size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
                                        {playingNoteId === note.id ? 'Stop' : `Play${note.audioLength ? ` (${note.audioLength})` : ''}`}
                                    </button>
                                </div>
                            )}

                            {note.files && note.files.length > 0 && (
                                <div className="mb-3 space-y-1" onClick={e => e.stopPropagation()}>
                                    {(searchQuery ? note.files : note.files.slice(0, 3)).map((file, idx) => (
                                        <div key={idx} className={`flex flex-col p-1.5 rounded-lg bg-gray-50 dark:bg-gray-700/30 border transition-colors ${searchQuery && file.extractedText && file.extractedText.toLowerCase().includes(searchQuery.toLowerCase())
                                            ? 'border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/10 ring-1 ring-yellow-400/50'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-orange-200 dark:hover:border-gray-500'
                                            }`}>
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 overflow-hidden">
                                                    <div className="text-gray-500 shrink-0">
                                                        {file.type?.includes('image') ? <ImageIcon size={14} /> : <FileText size={14} />}
                                                    </div>
                                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate max-w-[140px]">{file.name}</span>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (file.url) window.open(file.url, '_blank');
                                                        else alert("Preview not available offline.");
                                                    }}
                                                    className="text-[10px] text-gray-400 hover:text-orange-600"
                                                >
                                                    <Eye size={12} />
                                                </button>
                                            </div>
                                            {/* SEARCH MATCH IDENTIFIER */}
                                            {/* SEARCH MATCH IDENTIFIER & SNIPPET */}
                                            {searchQuery && file.extractedText && file.extractedText.toLowerCase().includes(searchQuery.toLowerCase()) && (
                                                <div
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setPreviewData({ text: file.extractedText, title: file.name });
                                                    }}
                                                    className="mt-1 cursor-pointer group/snippet"
                                                >
                                                    <div className="text-[10px] bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300 px-2 py-1.5 rounded-md font-mono leading-snug border border-yellow-200 dark:border-yellow-800/50 hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors">
                                                        <div className="flex items-center gap-1 mb-1 font-bold text-yellow-700 dark:text-yellow-400 uppercase tracking-wider text-[9px]">
                                                            <Search size={10} /> Match in file
                                                        </div>
                                                        <span className="opacity-90 block italic break-words">
                                                            "...
                                                            {(() => {
                                                                const text = file.extractedText;
                                                                const query = searchQuery.toLowerCase();
                                                                const idx = text.toLowerCase().indexOf(query);
                                                                if (idx === -1) return text.substring(0, 60);

                                                                const start = Math.max(0, idx - 20);
                                                                const end = Math.min(text.length, idx + query.length + 60);
                                                                const sub = text.substring(start, end);

                                                                const parts = sub.split(new RegExp(`(${searchQuery})`, 'gi'));
                                                                return parts.map((part, i) =>
                                                                    part.toLowerCase() === query ? <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 dark:text-white rounded-sm px-0.5 mx-0.5 font-bold not-italic text-gray-900">{part}</mark> : part
                                                                );
                                                            })()}
                                                            ..."
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {!searchQuery && note.files.length > 3 && <span className="text-[10px] text-gray-400 pl-1">+{note.files.length - 3} more</span>}
                                </div>
                            )}

                            {note.type !== 'shopping' && note.content && (
                                <p className="text-gray-600 dark:text-gray-300 text-sm line-clamp-3 mb-4 leading-relaxed bg-gray-50/50 dark:bg-gray-800/50 p-2 rounded-lg">{note.content}</p>
                            )}

                            {note.type === 'shopping' && (
                                <div className="space-y-1.5 mb-2" onClick={e => e.stopPropagation()}>
                                    {note.items.slice(0, 3).map((item, i) => (
                                        <div
                                            key={i}
                                            className="flex items-center gap-2 cursor-pointer group/item"
                                            onClick={() => {
                                                const newItems = [...note.items];
                                                newItems[i].done = !newItems[i].done;
                                                handleSave({ ...note, items: newItems });
                                            }}
                                        >
                                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-colors ${item.done ? 'bg-orange-500 border-orange-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'}`}>
                                                {item.done && <Check size={10} className="text-white" />}
                                            </div>
                                            <span className={`text-xs ${item.done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>{item.text}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2 mt-auto flex-wrap pt-2 border-t border-gray-50 dark:border-gray-700">
                                {note.tags && note.tags.map(tag => (
                                    <span key={tag} className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-md text-[10px] font-bold">#{tag}</span>
                                ))}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {filteredNotes.length === 0 && (
                    <div className="col-span-full text-center py-20 text-gray-400 flex flex-col items-center">
                        <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                            <FileText size={32} className="opacity-50" />
                        </div>
                        <p className="font-medium">No notes found.</p>
                        <p className="text-sm opacity-60">Tap + to create one.</p>
                    </div>
                )}
            </motion.div>

            {/* FLOATING ACTION BUTTON - DESKTOP & MOBILE */}
            <div className="fixed bottom-24 md:bottom-10 right-6 md:right-10 z-40 flex flex-col gap-3">
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

// Helper Check icon
const Check = ({ size, className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

export default NotesPage;
