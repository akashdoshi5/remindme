import React, { useEffect, useState } from 'react';
import { Bell, Clock, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { haptics } from '../../services/haptics';

const AlarmModal = ({ reminder, onSnooze, onDone, onClose, isSilent }) => {
    // Alarm sound that repeats until stopped - more attention-grabbing than a single chime
    const playAlarm = () => {
        if (!reminder) return null;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;

            const ctx = new AudioContext();

            // Attempt to resume if suspended
            if (ctx.state === 'suspended') {
                ctx.resume().catch(e => console.warn("Audio resume failed", e));
            }

            const gainNode = ctx.createGain();
            gainNode.connect(ctx.destination);
            gainNode.connect(ctx.destination);
            gainNode.gain.setValueAtTime(0.7, ctx.currentTime); // Louder for alarm mode

            let isPlaying = true;
            let timerId = null;

            // ALARM SOUND (Looping, Aggressive)
            const playAlarmSequence = () => {
                const currentTime = ctx.currentTime;
                // Two-tone alarm pattern
                const frequencies = [880, 660, 880];
                const beepDuration = 0.15;
                const pause = 0.05;

                // Play first sequence
                frequencies.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const beepGain = ctx.createGain();
                    osc.type = 'square';
                    osc.frequency.value = freq;
                    osc.connect(beepGain);
                    beepGain.connect(gainNode);

                    const start = currentTime + (i * (beepDuration + pause));
                    playBeep(osc, beepGain, start, beepDuration, freq);
                });

                // Play second sequence immediately after (Double Alarm)
                const sequenceDuration = frequencies.length * (beepDuration + pause);
                const gap = 0.3; // Short gap between the two bursts

                frequencies.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const beepGain = ctx.createGain();
                    osc.type = 'square';
                    osc.frequency.value = freq;
                    osc.connect(beepGain);
                    beepGain.connect(gainNode);

                    const start = currentTime + sequenceDuration + gap + (i * (beepDuration + pause));
                    playBeep(osc, beepGain, start, beepDuration, freq);
                });
            };

            const playBeep = (osc, beepGain, start, duration, freq) => {
                beepGain.gain.setValueAtTime(0, start);
                beepGain.gain.linearRampToValueAtTime(0.4, start + 0.02);
                beepGain.gain.setValueAtTime(0.4, start + duration - 0.02);
                beepGain.gain.linearRampToValueAtTime(0, start + duration);

                osc.start(start);
                osc.stop(start + duration);
            };

            // CHIME SOUND (Single, Soft)
            const playChime = () => {
                const currentTime = ctx.currentTime;
                const osc = ctx.createOscillator();
                const chimeGain = ctx.createGain();

                osc.type = 'sine'; // Soft sine wave
                osc.frequency.value = 660; // E5
                osc.connect(chimeGain);
                chimeGain.connect(gainNode);

                chimeGain.gain.setValueAtTime(0, currentTime);
                chimeGain.gain.linearRampToValueAtTime(0.6, currentTime + 0.1);
                chimeGain.gain.exponentialRampToValueAtTime(0.01, currentTime + 1.5); // Long clean decay

                osc.start(currentTime);
                osc.stop(currentTime + 1.5);
            };

            // Logic Switch
            const isAlarm = reminder.soundType === 'alarm';

            if (isAlarm) {
                // Play immediately and repeat every 2.0s (longer gap due to double sequence)
                playAlarmSequence();
                timerId = setInterval(() => {
                    if (isPlaying) playAlarmSequence();
                }, 2000);
            } else {
                // Play ONCE
                playChime();
            }

            return () => {
                isPlaying = false;
                if (timerId) clearInterval(timerId);
                gainNode.gain.cancelScheduledValues(ctx.currentTime);
                gainNode.gain.setValueAtTime(0, ctx.currentTime);
                setTimeout(() => ctx.close(), 100); // Close after slight delay to prevent clip
            };
        } catch (e) {
            console.error("Audio Context Error", e);
            return null;
        }
    };

    useEffect(() => {
        // Resolve isSilent
        const silent = typeof isSilent === 'function' ? isSilent() : isSilent;
        if (silent || !reminder) {
            if (silent && reminder) console.log("Alarm is silent due to Sleep Schedule.");
            return;
        }

        // 1. Haptic Feedback (Vibration)
        // 1. Haptic Feedback (Vibration)
        if (reminder.soundType === 'alarm') {
            haptics.alarm();
        } else {
            // Standard Notification Vibration
            haptics.notification();
        }

        // 2. Play Sound
        const stopAlarm = playAlarm();

        return () => {
            if (stopAlarm) stopAlarm();
            haptics.stop(); // Stop vibration
        };
    }, [reminder?.uniqueId, reminder?.soundType, isSilent]); // Trigger on uniqueId change OR settings change

    const handleAction = (actionFn, ...args) => {
        // No vibration or sound on action
        actionFn(...args);
    };

    if (!reminder) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative"
                >
                    <div className="bg-gradient-to-br from-orange-500 to-orange-600 p-8 text-white text-center relative overflow-hidden">
                        <motion.div
                            animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
                            transition={{ repeat: Infinity, duration: 1.5, repeatDelay: 0.5 }}
                            className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md"
                        >
                            <Bell size={40} className="text-white" />
                        </motion.div>
                        <h2 className="text-3xl font-bold mb-2">{reminder.title}</h2>
                        <p className="text-orange-100 text-lg">{reminder.time}</p>

                        {/* Silent Mode Indicator */}
                        {typeof isSilent === 'function' && isSilent() && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/20 text-white/90 text-sm font-medium backdrop-blur-md border border-white/10">
                                <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
                                Silent Mode Active (Sleep Schedule)
                            </div>
                        )}

                        {/* Ripple Effect Background */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/10 rounded-full blur-3xl -z-10 animate-pulse"></div>
                    </div>

                    <div className="p-8">
                        {reminder.instructions && (
                            <div className="bg-gray-50 p-4 rounded-xl mb-8 border border-gray-100 text-center">
                                <p className="text-gray-700 font-medium">{reminder.instructions}</p>
                            </div>
                        )}

                        <div className="flex flex-col gap-4">
                            <div className="grid grid-cols-4 gap-2 mb-4">
                                {[1, 5, 10, 15].map((min) => (
                                    <button
                                        key={min}
                                        onClick={() => handleAction(onSnooze, min)}
                                        className="flex flex-col items-center justify-center p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-orange-200 hover:text-orange-600 transition-all font-medium text-sm"
                                    >
                                        <Clock size={20} className="mb-1" />
                                        +{min}m
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={() => handleAction(onDone)}
                                className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-orange-600 text-white hover:bg-orange-700 shadow-lg shadow-orange-500/30 transition-all font-bold text-lg"
                            >
                                <Check size={28} />
                                Mark as Done
                            </button>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default AlarmModal;
