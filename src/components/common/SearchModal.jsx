import React, { useState, useEffect } from 'react';
import { Search, X, Bell, FileText, ArrowRight, Clock, Mic, MicOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '../../services/data';
import { useNavigate } from 'react-router-dom';
import { useVoice } from '../../hooks/useVoice';

const SearchModal = ({ isOpen, onClose, autoStartListening = false }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ reminders: [], notes: [] });
    const navigate = useNavigate();
    const { isListening, transcript, startListening, stopListening, isSupported } = useVoice();

    // Auto-start voice if requested
    useEffect(() => {
        if (isOpen && autoStartListening) {
            startListening();
        } else {
            stopListening();
        }
    }, [isOpen, autoStartListening]);

    // Update query with transcript
    useEffect(() => {
        if (isListening && transcript) {
            setQuery(transcript);
        }
    }, [transcript, isListening]);

    useEffect(() => {
        if (query.trim()) {
            const searchResults = dataService.search(query);
            setResults(searchResults);
        } else {
            setResults({ reminders: [], notes: [] });
        }
    }, [query]);

    // Close on escape key
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') {
                stopListening();
                onClose();
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    const handleNavigate = (path, options = {}) => {
        navigate(path, options);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 pt-24 px-4">
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-gray-200 dark:border-gray-700"
            >
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                    <Search className={`transition-colors ${isListening ? 'text-orange-500 animate-pulse' : 'text-gray-400'}`} size={24} />
                    <input
                        type="text"
                        placeholder={isListening ? "Listening..." : "Search reminders, notes, instructions..."}
                        className="flex-1 text-xl outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600 text-gray-800 dark:text-gray-100 bg-transparent"
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    {isSupported && (
                        <button
                            onClick={isListening ? stopListening : startListening}
                            className={`p-2 rounded-full transition-colors mr-1 ${isListening ? 'bg-red-50 dark:bg-red-900/20 text-red-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400'}`}
                        >
                            {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                        </button>
                    )}
                    <button onClick={() => { stopListening(); onClose(); }} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                <div className="overflow-y-auto p-2 scrollbar-thin">
                    {query.trim() === '' ? (
                        <div className="p-8 text-center text-gray-400">
                            <Search size={48} className="mx-auto mb-4 opacity-20" />
                            <p>Type to search across your personal assistant</p>
                        </div>
                    ) : (
                        <div className="space-y-6 p-2">
                            {results.reminders.length === 0 && results.notes.length === 0 && (
                                <div className="text-center text-gray-500 py-8">
                                    No results found for "{query}"
                                </div>
                            )}

                            {results.reminders.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Reminders</h3>
                                    <div className="space-y-2">
                                        {results.reminders.map(r => (
                                            <div
                                                key={r.id}
                                                onClick={() => handleNavigate('/reminders', { state: { highlightId: r.uniqueId || r.id, targetDate: r.date, openEdit: true } })}
                                                className="flex items-center gap-4 p-3 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-xl cursor-pointer group transition-colors border border-transparent hover:border-orange-100 dark:hover:border-orange-800"
                                            >
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${r.type === 'Medication' ? 'bg-orange-100 text-orange-600' : 'bg-blue-100 text-blue-600'}`}>
                                                    <Bell size={18} />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-orange-700 dark:group-hover:text-orange-400">{r.title}</h4>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{r.instructions || r.frequency}</p>
                                                </div>
                                                <div className="text-xs font-medium bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                                    <Clock size={12} /> {r.time}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {results.notes.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 px-2">Notes</h3>
                                    <div className="space-y-2">
                                        {results.notes.map(n => (
                                            <div
                                                key={n.id}
                                                onClick={() => handleNavigate('/notes', { state: { focusId: n.id, searchQuery: query } })}
                                                className="flex items-center gap-4 p-3 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-xl cursor-pointer group transition-colors border border-transparent hover:border-teal-100 dark:hover:border-teal-800"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                                                    <FileText size={18} />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-gray-800 dark:text-gray-200 group-hover:text-teal-700 dark:group-hover:text-teal-400">{n.title}</h4>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{n.content}</p>
                                                </div>
                                                <ArrowRight size={16} className="text-gray-300 group-hover:text-teal-500 -translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 text-xs text-center text-gray-400 border-t border-gray-100 dark:border-gray-700">
                    Press <kbd className="bg-white dark:bg-gray-600 border border-gray-200 dark:border-gray-500 rounded px-1 font-sans text-gray-500 dark:text-gray-300">Esc</kbd> to close
                </div>
            </motion.div>
        </div>
    );
};

export default SearchModal;
