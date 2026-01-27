import { useState, useEffect, useCallback } from 'react';

export const useVoice = (config = {}) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState(null);
    const [recognition, setRecognition] = useState(null);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            setError('Voice recognition is not supported in this browser.');
            return;
        }

        const recognitionInstance = new SpeechRecognition();

        recognitionInstance.continuous = config.continuous !== undefined ? config.continuous : true;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = 'en-US'; // Changed to US English for better general mobile support, or make configurable. 
        // 'en-IN' is fine but 'en-US' is often the default model on phones if offline.

        recognitionInstance.onstart = () => setIsListening(true);
        recognitionInstance.onend = () => setIsListening(false);
        recognitionInstance.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            // Ignore 'no-speech' errors as they just mean silence
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
