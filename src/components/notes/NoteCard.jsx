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
            }
            // 2. Start Drag
            if (navigator.vibrate) navigator.vibrate(50);
            dragControls.start(e, { snapToCursor: false });
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
                    ? 'ring-4 ring-orange-500 bg-orange-50 dark:bg-orange-900/20 z-10 shadow-xl border-transparent transition-all duration-200'
                    : highlightedId === note.id
                        ? 'ring-4 ring-cyan-500 ring-dashed bg-cyan-50/10 dark:bg-cyan-900/10 z-10 shadow-md border-transparent'
                        : 'ring-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm border-l-4 md:hover:bg-gray-50 md:dark:hover:bg-gray-700/50 transition-all duration-200'
                } 
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
                    className="absolute inset-0 z-30 cursor-pointer"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onClick(note);
                    }}
                />
            )}

            {/* SELECTION CHECKMARK BADGE (Top Left) */}
            {isSelected && (
                <div className="absolute -top-3 -left-3 bg-orange-500 text-white rounded-full p-1 shadow-md z-40 scale-110">
                    <Check size={16} />
                </div>
            )}

            <div className="flex justify-between items-start mb-2">
                <div className="flex gap-2 items-center flex-wrap">
                    <div className={`p-2 rounded-full ${note.type === 'voice' ? 'bg-teal-100 text-teal-600 dark:bg-teal-900/30' :
                        note.type === 'shopping' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30' :
                            'bg-orange-100 text-orange-600 dark:bg-orange-900/30'
                        }`}>
                        {note.type === 'voice' ? <Mic size={18} /> :
                            note.type === 'shopping' ? <div className="font-bold px-1 relative top-[1px] text-xs">LIST</div> :
                                <div className="relative">
                                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                    <FileText size={18} />
                                </div>
                        }
                    </div>
                </div>

                {/* RIGHT SIDE HEADER: Shared Badge + Pin Button */}
                <div className="flex items-center gap-2">
                    {/* Shared Indicator (Inline) */}
                    {(note.ownerId && note.ownerId !== user?.uid) ? (
                        <div className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1">
                            <Users size={10} /> Shared
                        </div>
                    ) : (note.sharedWith && note.sharedWith.length > 0) && (
                        <div className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-[10px] px-2 py-1 rounded-full font-bold flex items-center gap-1">
                            <Share2 size={10} /> Shared
                        </div>
                    )}

                    {/* PIN BUTTON */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSave({ ...note, isPinned: !note.isPinned });
                        }}
                        className={`p-2 rounded-full transition-all ${note.isPinned
                            ? 'text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rotate-45'
                            : 'text-gray-300 dark:text-gray-600 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        title={note.isPinned ? "Unpin Note" : "Pin Note"}
                    >
                        <Pin size={18} fill={note.isPinned ? "currentColor" : "none"} />
                    </button>
                </div>
            </div>

            {/* Content Preview */}
            <div className="space-y-2">
                <div className="flex justify-between items-start">
                    <h3 className="font-bold text-gray-900 dark:text-gray-100 line-clamp-1 flex-1 pr-6">
                        {note.title || 'Untitled Note'}
                    </h3>
                </div>

                {/* Text Content */}
                {note.content && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 whitespace-pre-wrap font-medium">
                        {note.content}
                    </p>
                )}

                {/* Checklist Preview */}
                {note.type === 'shopping' && note.items && (
                    <div className="space-y-1 mt-2">
                        {note.items.slice(0, 3).map((item, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                <span className={`w-4 h-4 rounded border flex items-center justify-center
                                    ${item.done ? 'bg-gray-200 dark:bg-gray-700 border-transparent' : 'border-gray-300 dark:border-gray-600'}`}>
                                    {item.done && <Check size={10} />}
                                </span>
                                <span className={item.done ? 'line-through opacity-50' : ''}>{item.text}</span>
                            </div>
                        ))}
                        {note.items.length > 3 && (
                            <div className="text-xs text-gray-400 italic pl-6">
                                + {note.items.length - 3} more items...
                            </div>
                        )}
                    </div>
                )}

                {/* Attachments Preview */}
                {note.files && note.files.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto debug-screens py-1 mt-2 scrollbar-none">
                        {note.files.map((file, index) => (
                            <div key={index} className="relative w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                                {file.type.startsWith('image/') ? (
                                    <ImagePreview file={file} />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                                        <Paperclip size={16} />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Audio Player Preview */}
                {note.audioData && (
                    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handlePlayAudio(note);
                            }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all w-full justify-center
                                ${playingNoteId === note.id
                                    ? 'bg-orange-500 text-white shadow-md scale-105'
                                    : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200'
                                }`}
                        >
                            {playingNoteId === note.id ? (
                                <>
                                    <StopCircle size={14} className="animate-pulse" />
                                    <span>Stop Playing</span>
                                </>
                            ) : (
                                <>
                                    <Play size={14} />
                                    <span>Play Audio Note</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
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
