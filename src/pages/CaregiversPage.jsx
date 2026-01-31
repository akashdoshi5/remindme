import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Phone, MessageCircle, MoreVertical, Shield, ShieldAlert, X, Mail, Trash2, Edit2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dataService } from '../services/data';

const CaregiversPage = () => {
    const [caregivers, setCaregivers] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Modal State
    const [name, setName] = useState('');
    const [relation, setRelation] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    // Edit State
    const [editId, setEditId] = useState(null);

    useEffect(() => {
        setCaregivers(dataService.getCaregivers());
    }, [isModalOpen]);

    const openInviteModal = () => {
        setEditId(null);
        setName('');
        setRelation('');
        setPhone('');
        setEmail('');
        setIsModalOpen(true);
    };

    const openEditModal = (caregiver) => {
        setEditId(caregiver.id);
        setName(caregiver.name);
        setRelation(caregiver.relation);
        setPhone(caregiver.phone);
        setEmail(caregiver.email || '');
        setIsModalOpen(true);
    };

    const handleSave = (e) => {
        e.preventDefault();
        const payload = {
            name,
            relation,
            phone,
            email,
            role: 'Viewer', // Hardcoded as requested
            isEmergencyContact: editId ? caregivers.find(c => c.id === editId)?.isEmergencyContact : false
        };

        if (editId) {
            dataService.updateCaregiver(editId, payload);
        } else {
            dataService.addCaregiver(payload);
        }

        setIsModalOpen(false);
    };

    const toggleEmergency = (id) => {
        const c = caregivers.find(x => x.id === id);
        dataService.updateCaregiver(id, { isEmergencyContact: !c.isEmergencyContact });
        setCaregivers(prev => prev.map(x => x.id === id ? { ...x, isEmergencyContact: !x.isEmergencyContact } : x));
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 md:mb-8 gap-4 px-1 mt-4 md:mt-2">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                    <Users className="text-indigo-600" />
                    My Caregivers
                </h1>
                <button
                    onClick={openInviteModal}
                    className="btn btn-primary gap-2 shadow-orange-500/20 px-6 text-lg"
                >
                    <UserPlus size={22} /> Invite Caregiver
                </button>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <AnimatePresence>
                    {caregivers.map((person) => (
                        <motion.div
                            key={person.id}
                            layout
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`card p-5 hover:border-orange-200 transition-all group ${person.isEmergencyContact ? 'ring-2 ring-red-100 border-red-200' : ''}`}
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-4">
                                    <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold shadow-sm ${person.isEmergencyContact
                                        ? 'bg-red-50 text-red-600 border border-red-100'
                                        : 'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                        }`}>
                                        {person.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{person.name}</h3>
                                            {person.isEmergencyContact && (
                                                <ShieldAlert size={16} className="text-red-500" fill="currentColor" fillOpacity={0.2} />
                                            )}
                                        </div>
                                        <p className="text-gray-500 text-sm font-medium">{person.relation} • {person.role || 'Viewer'}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => openEditModal(person)}
                                        className="text-gray-400 hover:text-indigo-500 transition-colors p-2 rounded-full hover:bg-indigo-50"
                                        title="Edit Caregiver"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (window.confirm('Remove this caregiver?')) {
                                                dataService.deleteCaregiver(person.id);
                                                setCaregivers(prev => prev.filter(c => c.id !== person.id));
                                            }
                                        }}
                                        className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-red-50"
                                        title="Remove Caregiver"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <a href={`tel:${person.phone}`} className="flex items-center justify-center gap-2 py-2 rounded-xl bg-gray-50 text-gray-700 font-medium text-sm hover:bg-green-50 hover:text-green-700 transition-colors border border-gray-100">
                                    <Phone size={16} /> Call
                                </a>
                                <a href={`mailto:${person.email}`} className="flex items-center justify-center gap-2 py-2 rounded-xl bg-gray-50 text-gray-700 font-medium text-sm hover:bg-blue-50 hover:text-blue-700 transition-colors border border-gray-100">
                                    <Mail size={16} /> Email
                                </a>
                            </div>

                            <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md ${person.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                    {person.status || 'Sent'}
                                </span>

                                <button
                                    onClick={() => toggleEmergency(person.id)}
                                    className={`text-xs flex items-center gap-1 font-medium transition-colors ${person.isEmergencyContact ? 'text-red-600 hover:text-red-700' : 'text-gray-400 hover:text-red-500'
                                        }`}
                                >
                                    <Shield size={14} />
                                    {person.isEmergencyContact ? 'Emergency Contact' : 'Set as Emergency'}
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {/* Add New Placeholder */}
                <motion.div
                    layout
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={openInviteModal}
                    className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-gray-400 hover:border-orange-300 hover:text-orange-500 hover:bg-orange-50/30 transition-all cursor-pointer min-h-[200px]"
                >
                    <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-white transition-colors">
                        <UserPlus size={28} />
                    </div>
                    <span className="font-bold text-lg">Add Caregiver</span>
                    <p className="text-sm mt-1 opacity-70">Invite family or doctors</p>
                </motion.div>
            </div>

            {/* Invite/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md animate-fade-in shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700">
                        <div className="bg-gray-50 dark:bg-gray-700/50 px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{editId ? 'Edit Caregiver' : 'Invite Caregiver'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
                                <X size={24} className="text-gray-500 dark:text-gray-400" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
                                <input required type="text" className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Dr. Emily Wilson" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Relation</label>
                                <input required type="text" className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500" value={relation} onChange={e => setRelation(e.target.value)} placeholder="e.g. Daughter" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number</label>
                                <input required type="tel" className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 000-0000" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email (Important for Linking)</label>
                                <input required type="email" className="w-full p-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-orange-500" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" />
                            </div>
                            <button type="submit" className="btn btn-primary w-full py-3.5 mt-2 text-lg shadow-orange-500/25">{editId ? 'Save Changes' : 'Send Invite'}</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CaregiversPage;
