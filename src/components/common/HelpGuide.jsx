import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Bell, Shield, Clock, Search, BookOpen, ShieldCheck, Users, Pill } from 'lucide-react';

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
                        {/* Section 1: Find Fast (Search) */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-2xl flex items-center justify-center text-orange-600 dark:text-orange-400">
                                <Search size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Find Anything Fast</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    Search by title, content, or <strong>file attachments</strong>. Attach photos, PDFs, or documents to reminders and notes for quick reference.
                                </p>
                            </div>
                        </div>

                        {/* Section 2: Medication Courses (Complex Reminders) */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-2xl flex items-center justify-center text-purple-600 dark:text-purple-400">
                                <Pill size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Medication Courses</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    For antibiotics or multi-dose schedules, toggle <strong>'Complex Schedule'</strong> to set times for Breakfast/Lunch/Dinner or custom intervals (e.g., every 4 hours) for a specific duration.
                                </p>
                            </div>
                        </div>

                        {/* Section 3: Editing Recurring Reminders */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                                <Calendar size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Edit Recurring Reminders</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    When editing a recurring reminder, choose <strong>"This Event Only"</strong> to change just one instance, or <strong>"All Future Events"</strong> to update the entire series. Past history is always preserved.
                                </p>
                            </div>
                        </div>

                        {/* Section 4: Smart History & 2-Hour Rule */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center text-blue-600 dark:text-blue-400">
                                <Clock size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Action Window & History</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    Mark reminders as <strong>Taken</strong> within 2 hours before or after the scheduled time. Beyond that, they're marked as "Missed". Use <span className="font-bold text-purple-600">Reports</span> to manually edit today's and yesterday's logs. Past reminders are auto-marked as "Taken" to keep your history clean.
                                </p>
                            </div>
                        </div>

                        {/* Section 5: Shared Notes */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-teal-100 dark:bg-teal-900/30 rounded-2xl flex items-center justify-center text-teal-600 dark:text-teal-400">
                                <Users size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Share Notes</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    Share important notes, lists, and documents with caregivers or family members. They'll see updates in real-time.
                                </p>
                            </div>
                        </div>

                        {/* Section 6: Caregivers */}
                        <div className="flex gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-2xl flex items-center justify-center text-green-600 dark:text-green-400">
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">Caregivers & Privacy</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    Caregivers can view your progress reports but <strong>cannot edit</strong> your reminders or data. You stay in full control.
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
