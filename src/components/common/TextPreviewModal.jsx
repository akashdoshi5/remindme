import React, { useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';

import { BackButtonManager } from '../../services/BackButtonManager';

const TextPreviewModal = ({ isOpen, onClose, title, text, searchQuery, imageUrl }) => {
    const contentRef = useRef(null);

    // Back Button Handling
    useEffect(() => {
        if (!isOpen) return;
        const unregister = BackButtonManager.register(async () => {
            onClose();
            return true;
        });
        return unregister;
    }, [isOpen, onClose]);

    useEffect(() => {
        if (isOpen && searchQuery && contentRef.current && !imageUrl) {
            // Wait for render
            setTimeout(() => {
                const firstMatch = contentRef.current.querySelector('mark');
                if (firstMatch) {
                    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }, [isOpen, searchQuery, text, imageUrl]);

    if (!isOpen) return null;

    // Helper to highlight text
    const getHighlightedText = (content, query) => {
        if (!query) return content;

        const parts = content.split(new RegExp(`(${query})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === query.toLowerCase() ? (
                        <mark key={i} className="bg-yellow-200 text-gray-900 font-bold px-0.5 rounded">
                            {part}
                        </mark>
                    ) : (
                        part
                    )
                )}
            </span>
        );
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 z-10">
                    <div className="flex items-center gap-2">
                        <Search size={20} className="text-orange-500" />
                        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 truncate max-w-[200px] sm:max-w-md">{title || 'Preview'}</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-gray-900 flex-1 relative" ref={contentRef}>
                    {imageUrl ? (
                        <div className="flex items-center justify-center p-4 min-h-[300px]">
                            <img
                                src={imageUrl}
                                alt={title}
                                className="max-w-full h-auto rounded-lg shadow-md object-contain max-h-[60vh]"
                            />
                        </div>
                    ) : (
                        <div className="p-6">
                            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm leading-relaxed whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300 shadow-sm">
                                {getHighlightedText(text || '', searchQuery)}
                            </div>
                            {searchQuery && (
                                <p className="mt-4 text-xs text-center text-gray-400 italic">
                                    Showing extracted text matches
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors">
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TextPreviewModal;
