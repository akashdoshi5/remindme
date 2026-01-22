import React, { useState } from 'react';
import { X, UserPlus, Trash2, Users, Mail } from 'lucide-react';
import { dataService } from '../../services/data';

const ShareModal = ({ isOpen, onClose, note }) => {
    if (!isOpen || !note) return null;

    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const sharedWith = note.sharedWith || [];

    const handleShare = async (e) => {
        e.preventDefault();
        if (!email) return;
        setIsLoading(true);
        setErrorMsg('');

        try {
            const result = await dataService.shareNote(note.id, email);
            if (result) {
                setSuccessMsg(`Access granted to ${email}`);
                setEmail('');
                setTimeout(() => setSuccessMsg(''), 3000);
            } else {
                setErrorMsg('Sharing failed. Please try again.');
            }
        } catch (err) {
            console.error(err);
            setErrorMsg('Error sharing note.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleUnshare = async (userEmail) => {
        if (!confirm(`Remove access for ${userEmail}?`)) return;
        try {
            await dataService.unshareNote(note.id, userEmail);
        } catch (err) {
            console.error(err);
            alert("Failed to remove user.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 animate-fade-in">
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
                        <div className="mb-4 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg flex flex-col gap-2">
                            <p className="text-sm text-green-600 dark:text-green-400">{successMsg}</p>
                            <a
                                href={`mailto:${email || ''}?subject=Shared Note: ${note.title}&body=I've shared a note with you on RemindMe Buddy. You can view it here: ${window.location.origin}/notes`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs flex items-center justify-center gap-1 bg-green-600 text-white py-1.5 rounded-md hover:bg-green-700 font-bold"
                            >
                                <Mail size={12} /> Send Email Invite
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
                        {sharedWith.length === 0 && (
                            <p className="text-xs text-gray-400 italic p-2">Not shared with anyone yet.</p>
                        )}
                        {sharedWith.map((userEmail) => (
                            <div key={userEmail} className="flex justify-between items-center p-2 bg-white dark:bg-gray-700 border border-gray-100 dark:border-gray-600 rounded-lg shadow-sm">
                                <span className="text-sm text-gray-800 dark:text-gray-200 truncate pr-2">{userEmail}</span>
                                <button
                                    onClick={() => handleUnshare(userEmail)}
                                    className="text-gray-400 hover:text-red-500 transition-colors"
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
