import { useState, useEffect, useCallback } from 'react';

export const useVoice = (config = {}) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [recognition, setRecognition] = useState(null);

    useEffect(() => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            setError('Voice recognition is not supported in this browser.');
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognitionInstance = new SpeechRecognition();

        recognitionInstance.continuous = config.continuous !== undefined ? config.continuous : true; // Default to true for notes
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = 'en-IN'; // Default to Indian English, can be parameterized

        recognitionInstance.onstart = () => setIsListening(true);
        recognitionInstance.onend = () => setIsListening(false);
        recognitionInstance.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            setError(event.error);
            setIsListening(false);
        };

        recognitionInstance.onresult = (event) => {
            const currentTranscript = Array.from(event.results)
                .map(result => result[0].transcript)
                .join('');
            setTranscript(currentTranscript);
        };

        setRecognition(recognitionInstance);
    }, []);

    const startListening = useCallback(() => {
        setTranscript('');
        setError(null);
        recognition?.start();
    }, [recognition]);

    const stopListening = useCallback(() => {
        recognition?.stop();
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
        isSupported: !!recognition
    };
};
