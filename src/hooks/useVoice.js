import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

export const useVoice = (config = {}) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [recognition, setRecognition] = useState(null);

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

            recognitionInstance.onstart = () => setIsListening(true);
            recognitionInstance.onend = () => setIsListening(false);
            recognitionInstance.onerror = (event) => {
                console.error('Speech recognition error', event.error);
                if (event.error !== 'no-speech') {
                    setError(event.error);
                }
                if (event.error === 'not-allowed') {
                    setIsListening(false);
                }
            };

            recognitionInstance.onresult = (event) => {
                const currentTranscript = Array.from(event.results)
                    .map(result => result[0].transcript)
                    .join('');
                setTranscript(currentTranscript);
            };

            setRecognition(recognitionInstance);
        } else if (!Capacitor.isNativePlatform()) {
            setError('Voice recognition is not supported in this browser.');
        }
    }, [config.continuous]);

    const startListening = useCallback(async () => {
        if (isListening) return;
        setTranscript('');
        setError(null);

        try {
            if (Capacitor.isNativePlatform()) {
                // Native Start
                setIsListening(true); // Optimistic

                // Permission Check
                const hasPermission = await SpeechRecognition.checkPermissions();
                if (hasPermission.speechRecognition !== 'granted') {
                    const status = await SpeechRecognition.requestPermissions();
                    if (status.speechRecognition !== 'granted') {
                        throw new Error("Microphone permission denied");
                    }
                }

                await SpeechRecognition.start({
                    language: "en-US",
                    partialResults: true,
                    popup: false
                });
            } else {
                // Web Start
                recognition?.start();
            }
        } catch (e) {
            console.error("Mic start error:", e);
            setError(e.message || "Failed to start microphone");
            setIsListening(false);
        }
    }, [recognition, isListening]);

    const stopListening = useCallback(async () => {
        try {
            if (Capacitor.isNativePlatform()) {
                await SpeechRecognition.stop();
                setIsListening(false);
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
