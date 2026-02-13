import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar, Bell, Shield, Clock, Search, BookOpen, ShieldCheck, Users, Pill, FileText, CheckSquare, Languages } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const HELP_CONTENT = {
    en: {
        title: 'How to use',
        gotIt: 'Got it',
        sections: [
            {
                id: 'search',
                title: 'Find Anything Fast',
                icon: Search,
                color: 'orange',
                description: 'Search by title, content, **start/end dates**, or even content inside files (PDFs, Images). Instant full-text search across all your records.'
            },
            {
                id: 'medication',
                title: 'Medication Courses',
                icon: Pill,
                color: 'purple',
                description: "For antibiotics or schedules, toggle **'Complex Schedule'** to set times for Breakfast/Lunch/Dinner or custom intervals for a specific duration."
            },
            {
                id: 'recurring',
                title: 'Edit Recurring Events',
                icon: Calendar,
                color: 'indigo',
                description: 'Choose **"This Event Only"** for one instance, or **"All Future Events"** for the series. Past history is always preserved.'
            },
            {
                id: 'conversion',
                title: 'Checklist to Reminder',
                icon: CheckSquare,
                color: 'blue',
                description: 'Convert a checklist note into a reminder. **All items** (checked/unchecked) are moved to the instructions automatically.'
            },
            {
                id: 'history',
                title: 'Action Window & Reports',
                icon: Clock,
                color: 'blue',
                description: 'Mark reminders **Taken** within 2 hours. Use **Reports** to edit today or yesterday logs. Older logs are **locked** to preserve history.'
            },
            {
                id: 'permissions',
                title: 'Sharing & Privacy',
                icon: ShieldCheck,
                color: 'green',
                description: 'Collaborators can view and edit content but **cannot delete or share** notes they do not own. You stay in control.'
            }
        ]
    },
    hi: {
        title: 'कैसे उपयोग करें',
        gotIt: 'समझ गया',
        sections: [
            {
                id: 'search',
                title: 'सब कुछ जल्दी खोजें',
                icon: Search,
                color: 'orange',
                description: 'टाइटल, सामग्री, **शुरुआत/समाप्ति तारीख**, या फाइलों के अंदर की सामग्री से खोजें। अपनी सभी यादों को तुरंत खोजें।'
            },
            {
                id: 'medication',
                title: 'दवा का कोर्स',
                icon: Pill,
                color: 'purple',
                description: "एंटीबायोटिक्स या शेड्यूल के लिए, नाश्ते/दोपहर के भोजन/रात के खाने का समय या कस्टम अंतराल सेट करने के लिए **'Complex Schedule'** चुनें।"
            },
            {
                id: 'recurring',
                title: 'दोहराई जाने वाली घटनाएं',
                icon: Calendar,
                color: 'indigo',
                description: 'एक बार के लिए **"This Event Only"** या पूरी श्रृंखला के लिए **"All Future Events"** चुनें। पुराना इतिहास सुरक्षित रहता है।'
            },
            {
                id: 'conversion',
                title: 'चेकलिस्ट से रिमाइंडर',
                icon: CheckSquare,
                color: 'blue',
                description: 'चेकलिस्ट नोट को रिमाइंडर में बदलें। **सभी आइटम** (पूर्ण/अपूर्ण) अपने आप निर्देशों में चले जाएंगे।'
            },
            {
                id: 'history',
                title: 'एक्शन विंडो और रिपोर्ट्स',
                icon: Clock,
                color: 'blue',
                description: '2 घंटे के भीतर रिमाइंडर मार्क करें। **Reports** का उपयोग आज या कल के लॉग्स एडिट करने के लिए करें। पुराने लॉग्स **लॉक** कर दिए जाते हैं।'
            },
            {
                id: 'permissions',
                title: 'साझाकरण और गोपनीयता',
                icon: ShieldCheck,
                color: 'green',
                description: 'सहयोगी देख सकते हैं और एडिट कर सकते हैं लेकिन वे उन नोट्स को **डिलीट या शेयर नहीं कर सकते** जिनके वे मालिक नहीं हैं।'
            }
        ]
    },
    mr: {
        title: 'कसे वापरावे',
        gotIt: 'समजले',
        sections: [
            {
                id: 'search',
                title: 'काहीही पटकन शोधा',
                icon: Search,
                color: 'orange',
                description: 'शीर्षक, मजकूर, **सुरुवात/शेवटची तारीख**, किंवा फायलींच्या आतील मजकूराद्वारे शोधा. सर्व नोंदी झटपट शोधा.'
            },
            {
                id: 'medication',
                title: 'औषधांचा कोर्स',
                icon: Pill,
                color: 'purple',
                description: "अँटीबायोटिक्स किंवा वेळापत्रकासाठी, नाश्ता/दुपारचे जेवण/रात्रीचे जेवण किंवा सानुकूल वेळ सेट करण्यासाठी **'Complex Schedule'** निवडा."
            },
            {
                id: 'recurring',
                title: 'आवर्ती इव्हेंट्स',
                icon: Calendar,
                color: 'indigo',
                description: 'एका वेळेसाठी **"This Event Only"** किंवा पूर्ण मालिकेसाठी **"All Future Events"** निवडा. जुना इतिहास नेहमी सुरक्षित राहतो.'
            },
            {
                id: 'conversion',
                title: 'चेकलिस्ट ते रिमाइंडर',
                icon: CheckSquare,
                color: 'blue',
                description: 'चेकलिस्ट नोटचे रिमाइंडरमध्ये रूपांतर करा. **सर्व आयटम** स्वयंचलितपणे सूचनांमध्ये हस्तांतरित केले जातात.'
            },
            {
                id: 'history',
                title: 'ॲक्शन विंडो आणि रिपोर्ट्स',
                icon: Clock,
                color: 'blue',
                description: '२ तासांच्या आत रिमाइंडर मार्क करा. **Reports** मध्ये आज किंवा कालचे लॉग बदला. जुने लॉग इतिहास जपण्यासाठी **लॉक** केले जातात.'
            },
            {
                id: 'permissions',
                title: 'शेअरिंग आणि गोपनीयता',
                icon: ShieldCheck,
                color: 'green',
                description: 'सहयोगी नोट पाहू आणि बदलू शकतात, परंतु ते मालक नसलेल्या नोट्स **डिलीट किंवा शेअर करू शकत नाहीत**.'
            }
        ]
    }
};

const HelpGuide = ({ isOpen, onClose }) => {
    const { language: appLang } = useLanguage();
    const [localLang, setLocalLang] = useState(appLang);

    if (!isOpen) return null;

    const content = HELP_CONTENT[localLang] || HELP_CONTENT.en;

    const colorClasses = {
        orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400',
        purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
        indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
        blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
        green: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
        teal: 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 z-[1000] flex items-end sm:items-center justify-center p-4 backdrop-blur-sm pb-24 sm:pb-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-3xl p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="flex flex-col gap-4 mb-6 shrink-0">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                                <BookOpen className="text-orange-500" />
                                {content.title}
                            </h2>
                            <button onClick={onClose} className="p-2 bg-gray-100 dark:bg-gray-800 rounded-full hover:bg-gray-200 transition-colors">
                                <X size={20} className="text-gray-600 dark:text-gray-300" />
                            </button>
                        </div>

                        {/* Language Selector */}
                        <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 p-1 rounded-xl self-start">
                            <div className="p-2 text-gray-400">
                                <Languages size={16} />
                            </div>
                            {['en', 'hi', 'mr'].map((lang) => (
                                <button
                                    key={lang}
                                    onClick={() => setLocalLang(lang)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${localLang === lang
                                        ? 'bg-white dark:bg-gray-700 text-orange-600 dark:text-orange-400 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                >
                                    {lang.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-6 overflow-y-auto pr-2 flex-1 scrollbar-hide">
                        {content.sections.map((section) => (
                            <div key={section.id} className="flex gap-4">
                                <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center ${colorClasses[section.color]}`}>
                                    <section.icon size={24} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 mb-1">{section.title}</h3>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                        {section.description.split('**').map((part, i) =>
                                            i % 2 === 1 ? <strong key={i} className="text-gray-900 dark:text-gray-100 font-semibold">{part}</strong> : part
                                        )}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <button
                        onClick={onClose}
                        className="w-full mt-8 bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-4 rounded-2xl font-bold active:scale-95 transition-transform flex items-center justify-center gap-2"
                    >
                        {content.gotIt}
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default HelpGuide;
