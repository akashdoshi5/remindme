import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, Clock, ShieldCheck, Users } from 'lucide-react';

const HelpGuide = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-[60] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                            <BookOpen className="text-orange-500" />
                            How to use
                        </h2>
                        <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 transition-colors">
                            <X size={20} className="text-gray-600 dark:text-gray-300" />
                        </button>
                    </div>

                    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
                        {/* Section 1: 2-Hour Rule */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Clock size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">The 2-Hour Rule</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    Consistency is key. You can only mark a reminder as <span className="font-bold text-green-600">Taken</span> within <strong>2 hours</strong> of its scheduled time.
                                </p>
                                <ul className="mt-2 text-xs text-gray-500 space-y-1 list-disc list-inside">
                                    <li>Too Early? You must wait.</li>
                                    <li>Too Late? It counts as <strong>Missed</strong>.</li>
                                </ul>
                            </div>
                        </div>

                        {/* Section 4: Search Notes */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center text-orange-600 dark:text-orange-400">
                                <Search size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Find Notes Fast</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    Use the search bar on the Home or Notes page to instantly find notes by title, content, or tags.
                                </p>
                            </div>
                        </div>

                        {/* Section 2: Edit Lock */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Yesterday & Today Only</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    To keep your history accurate, you can only update reports for <strong>Today</strong> or <strong>Yesterday</strong> (1-day history lock). Older records are permanently locked.
                                </p>
                            </div>
                        </div>

                        {/* Section 3: Caregivers */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center text-green-600 dark:text-green-400">
                                <Users size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Caregivers & Privacy</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    Caregivers can view your progress but <strong>cannot edit</strong> your data. Your health record belongs to you.
                                </p>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-8 bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-3 rounded-2xl font-bold active:scale-95 transition-transform"
                    >
                        Got it
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default HelpGuide;
