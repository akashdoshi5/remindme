import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export const useVoice = (config = {}) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [recognition, setRecognition] = useState(null);
    const isListeningRef = useRef(false);

    // Initial Setup
    useEffect(() => {
        // Native Listener Setup
        if (Capacitor.isNativePlatform()) {
            SpeechRecognition.removeAllListeners().then(() => {
                SpeechRecognition.addListener('partialResults', (data) => {
                    if (data.matches && data.matches.length > 0) {
                        setTranscript(data.matches[0]);
                    }
                });
                // Optional: Handle end of speech if plugin supports it, 
                // but usually we rely on manual stop or timeout.
                // Some versions emit 'listeningState' but it's inconsistent.
            }).catch(e => console.error("Failed to setup native speech listeners", e));

            return () => {
                SpeechRecognition.removeAllListeners();
            };
        }

        // Web Listener Setup
        const SpeechRecognitionWeb = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognitionWeb) {
            const recognitionInstance = new SpeechRecognitionWeb();
            recognitionInstance.continuous = config.continuous !== undefined ? config.continuous : true;
            recognitionInstance.interimResults = true;
            recognitionInstance.lang = 'en-US';

            recognitionInstance.onstart = () => {
                setIsListening(true);
                isListeningRef.current = true;
            };
            recognitionInstance.onend = () => {
                setIsListening(false);
                isListeningRef.current = false;
            };
            recognitionInstance.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                if (event.error !== 'no-speech') {
                    setError(event.error);
                }
                if (event.error === 'not-allowed') {
                    setIsListening(false);
                    isListeningRef.current = false;
                }
            };

            recognitionInstance.onresult = (event) => {
                const currentTranscript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('');
                setTranscript(currentTranscript);
            };

            setRecognition(recognitionInstance);

            return () => {
                recognitionInstance.onstart = null;
                recognitionInstance.onend = null;
                recognitionInstance.onerror = null;
                recognitionInstance.onresult = null;
                try {
                    recognitionInstance.abort();
                } catch (e) {
                    // Ignore abort errors
                }
            };
        } else if (!Capacitor.isNativePlatform()) {
            setError('Voice recognition is not supported in this browser.');
        }
    }, [config.continuous]);

    const startListening = useCallback(async (lang = 'en-US') => {
        // Prevent multiple start calls
        if (isListeningRef.current) return;

        // Optimistic update: Show "Listening" immediately
        setIsListening(true);
        isListeningRef.current = true;
        setTranscript('');
        setError(null);

        try {
            if (Capacitor.isNativePlatform()) {
                // Native Start
                const hasPermission = await SpeechRecognition.checkPermissions();
                if (hasPermission.speechRecognition !== 'granted') {
                    const status = await SpeechRecognition.requestPermissions();
                    if (status.speechRecognition !== 'granted') {
                        throw new Error("Microphone permission denied");
                    }
                }
                await SpeechRecognition.start({
                    language: lang,
                    partialResults: true,
                    popup: false
                });
            } else {
                // Web Start
                if (recognition) {
                    // Safe guard: Abort before starting to ensure clean state
                    try { recognition.abort(); } catch (e) { }

                    recognition.lang = lang;
                    try {
                        await recognition.start();
                    } catch (err) {
                        if (err.name === 'InvalidStateError' || err.message?.includes('already started')) {
                            console.log("Recognition already active, ignoring start call.");
                            // State is already true, so we are good.
                        } else {
                            throw err;
                        }
                    }
                }
            }
        } catch (e) {
            console.error("Mic start error:", e);
            if (e.name !== 'InvalidStateError' && !e.message?.includes('already started')) {
                setError(e.message || "Failed to start microphone");
                setIsListening(false);
                isListeningRef.current = false;
            }
        }
    }, [recognition]);

    const stopListening = useCallback(async () => {
        // Optimistically update UI to avoid "hanging" state if native plugin is slow
        setIsListening(false);
        isListeningRef.current = false;
        try {
            if (Capacitor.isNativePlatform()) {
                await SpeechRecognition.stop();
            } else {
                recognition?.stop();
            }
        } catch (e) {
            console.error("Stop listening error:", e);
        }
    }, [recognition]);

    const resetTranscript = useCallback(() => {
        setTranscript('');
    }, []);

    return {
        isListening,
        transcript,
        error,
        startListening,
        stopListening,
        resetTranscript,
        isSupported: Capacitor.isNativePlatform() || !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    };
};
