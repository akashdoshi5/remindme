import { useState, useCallback } from 'react';

export const useShare = () => {
    const isSupported = typeof navigator !== 'undefined' && !!navigator.share;

    const share = useCallback(async (data) => {
        if (isSupported) {
            try {
                await navigator.share(data);
                return true;
            } catch (error) {
                console.error('Error sharing:', error);
                return false;
            }
        } else {
            // Fallback: Copy to clipboard
            try {
                const text = `${data.title}\n${data.text}\n${data.url || ''}`;
                await navigator.clipboard.writeText(text);
                alert('Copied to clipboard!'); // Simple feedback for now
                return true;
            } catch (error) {
                console.error('Error copying to clipboard:', error);
                return false;
            }
        }
    }, [isSupported]);

    return { share, isSupported };
};
