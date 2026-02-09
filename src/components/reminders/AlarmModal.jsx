import React, { useEffect, useState } from 'react';
import { Bell, Clock, Check, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AlarmModal = ({ reminder, onSnooze, onDone, onClose, isSilent }) => {
    // Alarm sound that repeats until stopped - more attention-grabbing than a single chime
    const playAlarm = () => {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;

            const ctx = new AudioContext();

            // Attempt to resume if suspended (fixes "no sound until interaction" on some browsers)
            if (ctx.state === 'suspended') {
                ctx.resume().catch(e => console.warn("Audio resume failed", e));
            }

            let isPlaying = true;
            const gainNode = ctx.createGain();
            gainNode.connect(ctx.destination);
            gainNode.gain.setValueAtTime(0.5, ctx.currentTime);

            // Function to play one alarm beep sequence
            const playBeepSequence = (startTime) => {
                if (!isPlaying) return;

                // Two-tone alarm pattern (classic alarm sound: high-low-high)
                const frequencies = [880, 660, 880]; // A5, E5, A5
                const beepDuration = 0.15;
                const pauseBetweenBeeps = 0.05;

                frequencies.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const beepGain = ctx.createGain();

                    osc.type = 'square'; // Sharper alarm-like sound
                    osc.frequency.value = freq;

                    osc.connect(beepGain);
                    beepGain.connect(gainNode);

                    const beepStart = startTime + (i * (beepDuration + pauseBetweenBeeps));
                    beepGain.gain.setValueAtTime(0, beepStart);
                    beepGain.gain.linearRampToValueAtTime(0.4, beepStart + 0.02);
                    beepGain.gain.setValueAtTime(0.4, beepStart + beepDuration - 0.02);
                    beepGain.gain.linearRampToValueAtTime(0, beepStart + beepDuration);

                    osc.start(beepStart);
                    osc.stop(beepStart + beepDuration);
                });
            };

            // Play alarm sequence repeatedly every 1.5 seconds
            let currentTime = ctx.currentTime;
            const sequenceInterval = 1.5; // seconds between alarm sequences

            // Schedule initial sequences
            for (let i = 0; i < 20; i++) { // Pre-schedule 30 seconds of alarm
                playBeepSequence(currentTime + (i * sequenceInterval));
            }

            return () => {
                isPlaying = false;
                gainNode.gain.setValueAtTime(0, ctx.currentTime);
                ctx.close();
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

        // 1. Haptic Feedback (Vibration) - 2 times
        if (navigator.vibrate) {
            try {
                // Pulse (500ms) - Pause (200ms) - Pulse (500ms)
                navigator.vibrate([500, 200, 500]);
            } catch (err) {
                console.warn("Vibration failed", err);
            }
        }

        // 2. Play Alarm Sound (repeating until dismissed)
        const stopAlarm = playAlarm();

        return () => {
            if (stopAlarm) stopAlarm();
            if (navigator.vibrate) navigator.vibrate(0); // Stop vibration
        };
    }, [reminder?.uniqueId, isSilent]); // Use uniqueId to ensure it triggers on new alarms

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
                                        {min}m
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
