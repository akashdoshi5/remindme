import React, { useRef } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import {
    Mic, Image as ImageIcon, Play, Paperclip,
    Pin, MoreVertical, StopCircle, // Removed GripVertical
    FileText, Share2, Users
} from 'lucide-react';
import { motion } from 'framer-motion';

// Helper Check icon
const Check = ({ size, className }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

// Helper Component for Safe Image Preview
const ImagePreview = ({ file }) => {
    const [status, setStatus] = React.useState('loading'); // loading, loaded, error

    React.useEffect(() => {
        const img = new Image();
        img.src = file.data;
        img.onload = () => setStatus('loaded');
        img.onerror = () => setStatus('error');
    }, [file.data]);

    if (status !== 'loaded') {
        return (
            <div className="w-full h-full flex items-center justify-center text-gray-300 bg-gray-100 dark:bg-gray-800">
                <ImageIcon size={16} />
            </div>
        );
    }

    return (
        <img
            src={file.data}
            alt="preview"
            className="w-full h-full object-cover"
            onError={() => setStatus('error')}
        />
    );
};

const NoteCard = ({ note, user, handleEdit, handleSave, setSharingNote, setTriggerReload, navigate, playingNoteId, handlePlayAudio, searchQuery, setPreviewData, isSelected, isSelectionMode, highlightedId, onToggleSelect, onClick, isReorderable = true }) => {
    const dragControls = useDragControls();
    const [longPressTimer, setLongPressTimer] = React.useState(null);

    const [startPos, setStartPos] = React.useState({ x: 0, y: 0 });
    const longPressHappened = useRef(false);

    const handlePointerDown = (e) => {
        // Persist event for async drag start
        e.persist();
        longPressHappened.current = false;

        setStartPos({ x: e.clientX, y: e.clientY });

        // UNIFIED TIMER: 300ms Hold -> Select AND Start Drag (Reduced from 400ms for responsiveness)
        const timer = setTimeout(() => {
            // 1. Select if not already selected
            if (!isSelected && onToggleSelect) {
                longPressHappened.current = true;
                onToggleSelect(note.id);

                // 2. Start Drag ONLY if this is the first selection (start of mode)
                // User requirement: "When 2nd note is selected, it should not be dragged"
                if (!isSelectionMode) {
                    if (navigator.vibrate) navigator.vibrate(50);
                    dragControls.start(e, { snapToCursor: false });
                }
            }
        }, 300);

        setLongPressTimer(timer);
    };

    const handleToggleSelectSafe = (id) => {
        if (onToggleSelect) onToggleSelect(id);
    };

    const handlePointerMove = (e) => {
        const moveX = Math.abs(e.clientX - startPos.x);
        const moveY = Math.abs(e.clientY - startPos.y);

        // Relaxed Scroll Detection (10px threshold) to allow slight finger jitter during long press
        if (moveX > 10 || moveY > 10) {
            // Moved -> Cancel Timers
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                setLongPressTimer(null);
            }
        }
    };

    const handlePointerCancel = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            setLongPressTimer(null);
        }
    };

    const handlePointerUp = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            setLongPressTimer(null);
        }
    };

    const handlePointerLeave = () => {
        if (longPressTimer) {
            clearTimeout(longPressTimer);
            setLongPressTimer(null);
        }
    };

    const CardComponent = isReorderable ? Reorder.Item : motion.div;

    const navProps = isReorderable ? {
        value: note,
        dragListener: false,
        dragControls: dragControls,
        onDragStart: () => {
            if (!isSelected && onToggleSelect) {
                onToggleSelect(note.id);
            }
        },
        dragElastic: 0.1,
        dragMomentum: false,
        dragTransition: { bounceStiffness: 600, bounceDamping: 35 },
        style: { touchAction: "pan-y", position: 'relative' } // Ensure relative position for grid
    } : {
        layout: true,
        style: { position: 'relative' }
    };

    return (
        <CardComponent
            {...navProps}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileDrag={{ scale: 1.05, boxShadow: "0px 10px 30px rgba(0,0,0,0.15)", zIndex: 50, cursor: "grabbing" }}
            onClick={(e) => {
                if (longPressHappened.current) {
                    longPressHappened.current = false;
                    return;
                }
                if (isSelectionMode) {
                    e.preventDefault();
                    e.stopPropagation();
                    onClick(note);
                } else {
                    // Normal click to edit
                    onClick(note);
                }
            }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerMove={handlePointerMove}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            className={`card group cursor-pointer relative select-none outline-none overflow-hidden
                ${isSelected
                    ? 'ring-2 ring-orange-500 bg-orange-50 dark:bg-orange-900/20 z-10 shadow-lg border-transparent'
                    : 'ring-0 border-gray-200 dark:border-gray-700 shadow-sm border-l-4 bg-white dark:bg-gray-800'
                } 
                transition-all duration-200
                ${(!isSelected && highlightedId !== note.id) ? (
                    note.type === 'voice' ? 'border-l-teal-500' :
                        note.type === 'shopping' ? 'border-l-yellow-500' :
                            'border-l-orange-500'
                ) : 'border-l-transparent'}
                ${note.width === 'full' ? 'md:col-span-2' : ''}`}
        >
            {/* Selection Mode Overlay: Tapping anywhere toggles selection */}
            {isSelectionMode && (
                <div
                    className="absolute inset-0 z-30"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClick(note);
                    }}
                    onPointerDown={(e) => {
                        // Pass through for drag initiation if already selected?
                        // If not selected, we want to select.
                        // But if we want multi-drag, this overlay might block `useDragControls`.
                        // For now, keep it simple.
                    }}
                />
            )}

            {/* SELECTION CHECKMARK BADGE (Top Left) */}
            {isSelected && (
                <div className="absolute -top-3 -left-3 bg-orange-500 text-white rounded-full p-1 shadow-md z-40 scale-110">
                    <Check size={16} />
                </div>
            )}

            <div className="flex justify-between items-center mb-2 gap-3">
                <div className="flex gap-2 items-center flex-1 min-w-0">
                    {/* TYPE ICON */}
                    <div className={`p-1.5 rounded-full shrink-0 ${note.type === 'voice' ? 'bg-teal-100 text-teal-600 dark:bg-teal-900/30' :
                        note.type === 'shopping' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30' :
                            'bg-orange-100 text-orange-600 dark:bg-orange-900/30'
                        }`}>
                        {note.type === 'voice' ? <Mic size={14} /> :
                            note.type === 'shopping' ? <div className="font-bold px-0.5 text-[10px]">LIST</div> :
                                <div className="relative">
                                    <FileText size={14} />
                                </div>
                        }
                    </div>

                    {/* TITLE MOVED HERE */}
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 truncate text-sm">
                        {note.title || 'Untitled'}
                    </h3>
                </div>

                {/* RIGHT SIDE HEADER: Shared Badge + Pin Button */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Shared Indicator (Compact) */}
                    {(note.ownerId && note.ownerId !== user?.uid) ? (
                        <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Users size={10} />
                        </div>
                    ) : (note.sharedWith && note.sharedWith.length > 0) && (
                        <div className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <Share2 size={10} />
                        </div>
                    )}

                    {/* PIN BUTTON */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSave({ ...note, isPinned: !note.isPinned });
                        }}
                        className={`p-1.5 rounded-full transition-all ${note.isPinned
                            ? 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rotate-45'
                            : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        title={note.isPinned ? "Unpin Note" : "Pin Note"}
                    >
                        <Pin size={16} fill={note.isPinned ? "currentColor" : "none"} />
                    </button>
                </div>
            </div>

            {/* Content Preview */}
            <div className="space-y-1">
                {/* Text Content */}
                {note.content && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-4 whitespace-pre-wrap font-medium">
                        {note.content}
                    </p>
                )}

                {/* Search Match in Attachment Context */}
                {/* CRITICAL FEATURE: Search Context Snippet. Must show file name and be clickable to open text preview. Do not remove. */}
                {/* Search Match in Attachment Context */}
                {/* CRITICAL FEATURE: Search Context Snippet. Must show file name and be clickable to open text preview. Do not remove. */}
                {searchQuery && note.files?.length > 0 && note.files.filter(f =>
                    (f.extractedText && f.extractedText.toLowerCase().includes(searchQuery.toLowerCase())) ||
                    (f.name && f.name.toLowerCase().includes(searchQuery.toLowerCase()))
                ).map((match, idx) => {
                    const isTextMatch = match.extractedText && match.extractedText.toLowerCase().includes(searchQuery.toLowerCase());
                    let snippet = null;

                    if (isTextMatch) {
                        const lowerText = match.extractedText.toLowerCase();
                        const index = lowerText.indexOf(searchQuery.toLowerCase());
                        const start = Math.max(0, index - 20);
                        const end = Math.min(match.extractedText.length, index + searchQuery.length + 40);
                        snippet = match.extractedText.substring(start, end);
                    } else if (match.extractedText) {
                        // Name match, but text exists -> show beginning of text as fallback? 
                        // Or just show nothing? User asked for "preview".
                        // Let's just show no snippet if it's a pure filename match to be clean, 
                        // but clicking will still open the full text.
                    }

                    return (
                        <div
                            key={idx}
                            onClick={(e) => {
                                e.stopPropagation();
                                setPreviewData({ title: match.name, text: match.extractedText });
                            }}
                            className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-md text-xs text-gray-600 dark:text-gray-400 italic cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors"
                        >
                            <span className="font-bold not-italic text-yellow-700 dark:text-yellow-500 block mb-0.5">Match in {match.name}:</span>
                            {snippet && <span>"...{snippet}..."</span>}
                        </div>
                    );
                })}

                {/* Checklist Preview */}
                {note.type === 'shopping' && note.items && (
                    <div className="space-y-1 mt-2">
                        {note.items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span className={`w-3 h-3 rounded border flex items-center justify-center
                                    ${item.done ? 'bg-gray-200 dark:bg-gray-700 border-transparent' : 'border-gray-300 dark:border-gray-600'}`}>
                                    {item.done && <Check size={8} />}
                                </span>
                                <span className={item.done ? 'line-through opacity-50' : ''}>{item.text}</span>
                            </div>
                        ))}
                        {note.items.length > 3 && (
                            <div className="text-[10px] text-gray-400 italic pl-5">
                                + {note.items.length - 3} more...
                            </div>
                        )}
                    </div>
                )}

                {/* Attachments & Voice Pill */}
                <div className="flex flex-wrap gap-2 mt-2">
                    {/* Attachments Pill */}
                    {note.files && note.files.length > 0 && (
                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-md text-[10px] font-bold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
                            <Paperclip size={10} />
                            <span>{note.files.length}</span>
                        </div>
                    )}

                    {/* Audio Player Preview (Compact) */}
                    {note.audioData && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePlayAudio(note);
                            }}
                            className={`flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-bold transition-all border
                                ${playingNoteId === note.id
                                    ? 'bg-orange-100 text-orange-600 border-orange-200'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-500 border-gray-200 dark:border-gray-700'
                                }`}
                        >
                            {playingNoteId === note.id ? <StopCircle size={10} className="animate-pulse" /> : <Play size={10} />}
                            <span>Voice Note</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Footer / Meta - REMOVED Date and Drag Handle as per request */}
            {/* 
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center">
                 Date was here 
            </div>
            */}

        </CardComponent>
    );
};

export default NoteCard;
