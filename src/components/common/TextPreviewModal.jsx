import React, { useEffect, useRef } from 'react';
import { X, Search } from 'lucide-react';

const TextPreviewModal = ({ isOpen, onClose, title, text, searchQuery }) => {
    const contentRef = useRef(null);

    useEffect(() => {
        if (isOpen && searchQuery && contentRef.current) {
            // Wait for render
            setTimeout(() => {
                const firstMatch = contentRef.current.querySelector('mark');
                if (firstMatch) {
                    firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        }
    }, [isOpen, searchQuery, text]);

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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 border border-gray-200 dark:border-gray-700">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <Search size={20} className="text-orange-500" />
                        <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">Match Preview</h3>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto custom-scrollbar" ref={contentRef}>
                    <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-xl border border-gray-100 dark:border-gray-700 text-sm leading-relaxed whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300">
                        {getHighlightedText(text, searchQuery)}
                    </div>
                    {searchQuery && (
                        <p className="mt-4 text-xs text-gray-400 italic text-center">
                            Showing extracted text from <strong>{title}</strong>
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 rounded-b-2xl flex justify-end">
                    <button onClick={onClose} className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition-colors">
                        Close Preview
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TextPreviewModal;
