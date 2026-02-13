import React, { useState, useEffect } from 'react';
import { X, UserPlus, Trash2, Users, Mail } from 'lucide-react';
import { dataService } from '../../services/data';

const ShareModal = ({ isOpen, onClose, note }) => {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    // Use derived state from props to ensure updates are reflected immediately
    // FIX: Maintain local state for immediate feedback, sync with props when they change
    const [localSharedWith, setLocalSharedWith] = useState([]);

    // Sync initial state when note changes
    useEffect(() => {
        if (note?.sharedWith) {
            setLocalSharedWith(note.sharedWith);
        } else {
            setLocalSharedWith([]);
        }
    }, [note?.id, note?.sharedWith]);

    // NEW: Robust Sync: Subscribe to the note in realtime to handle any state mismatches or stale objects from parent
    useEffect(() => {
        if (!note?.id) return;

        // Use dataService to get realtime updates for this specific note
        const unsub = dataService.getNoteRealtime(note.id, (updatedNote) => {
            if (updatedNote && updatedNote.sharedWith) {
                setLocalSharedWith(updatedNote.sharedWith);
            }
        });

        return () => unsub();
    }, [note?.id]);

    if (!isOpen || !note) return null;

    const handleShare = async (e) => {
        e.preventDefault();
        if (!email) return;
        setIsLoading(true);
        setErrorMsg('');

        try {
            const result = await dataService.shareNote(note.id, email);
            if (result) {
                setSuccessMsg(`Access granted to ${email}`);

                // Optimistic update with deduplication check
                setLocalSharedWith(prev => {
                    if (prev.includes(email)) return prev;
                    return [...prev, email];
                });

                setEmail('');
                setTimeout(() => setSuccessMsg(''), 8000);
            } else {
                setErrorMsg('Sharing failed. Please try again.');
            }
        } catch (err) {
            console.error(err);
            setErrorMsg('Error sharing note. Ensure you are online.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnshare = async (userEmail) => {
        if (!confirm(`Remove access for ${userEmail}?`)) return;
        try {
            await dataService.unshareNote(note.id, userEmail);
            setLocalSharedWith(prev => prev.filter(e => e !== userEmail)); // Remove locally
            // Note: Parent component must handle the data refresh to update the 'note' prop
        } catch (err) {
            console.error(err);
            alert("Failed to remove user.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4 animate-fade-in">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                <div className="bg-orange-50 dark:bg-gray-700/50 px-6 py-4 flex justify-between items-center border-b border-orange-100 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Users size={20} className="text-orange-500" />
                        Share Note
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6">
                    <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">Invite People</h4>
                    <form onSubmit={handleShare} className="flex gap-2 mb-6">
                        <input
                            type="email"
                            placeholder="user@example.com"
                            className="flex-1 p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="bg-orange-500 hover:bg-orange-600 text-white p-2 rounded-lg disabled:opacity-50"
                        >
                            <UserPlus size={20} />
                        </button>
                    </form>

                    {successMsg && (
                        <div className="mb-4 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg flex flex-col gap-2 border border-green-200 dark:border-green-800">
                            <p className="text-sm text-green-700 dark:text-green-300 font-medium">✓ {successMsg}</p>
                            <p className="text-xs text-green-600 dark:text-green-400">Note: User must log in to see this note.</p>
                            <a
                                href={`mailto:${email || ''}?subject=Shared Note: ${note.title}&body=I've shared a note with you on RemindMe.%0D%0A%0D%0AYou can view it here: https://remindme-app-9988.web.app/notes`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs flex items-center justify-center gap-2 bg-green-600 text-white py-2 px-3 rounded-lg hover:bg-green-700 font-bold transition-colors shadow-sm"
                            >
                                <Mail size={16} /> Send Email Invite (Manual)
                            </a>
                        </div>
                    )}
                    {errorMsg && <p className="text-sm text-red-600 mb-4 bg-red-50 p-2 rounded">{errorMsg}</p>}

                    <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">Who has access</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        <div className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">
                                    Me
                                </div>
                                <span className="text-sm text-gray-600 dark:text-gray-300">You (Owner)</span>
                            </div>
                        </div>
                        {localSharedWith.length === 0 && (
                            <p className="text-xs text-gray-400 italic p-2">Not shared with anyone yet.</p>
                        )}
                        {localSharedWith.map((userEmail) => (
                            <div key={userEmail} className="flex justify-between items-center p-2 bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-lg shadow-sm">
                                <span className="text-sm text-gray-800 dark:text-gray-200 truncate pr-2">{userEmail}</span>
                                <button
                                    onClick={() => handleUnshare(userEmail)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                    title="Revoke access"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareModal;
