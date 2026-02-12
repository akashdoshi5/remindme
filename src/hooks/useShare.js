import { Share } from '@capacitor/share';
import { useCallback } from 'react';

export const useShare = () => {
    // Capacitor Share plugin handles web fallback automatically if supported,
    // or we can implement a custom fallback if needed. 
    // Ideally, Share.canShare() checks if sharing is possible.

    const share = useCallback(async (data) => {
        try {
            const canShareResult = await Share.canShare();
            if (canShareResult.value) {
                await Share.share({
                    title: data.title,
                    text: data.text,
                    url: data.url,
                    dialogTitle: 'Share Note'
                });
                return true;
            } else {
                // Fallback: Copy to clipboard if sharing is not supported
                // (e.g. some desktop browsers)
                throw new Error('Sharing not supported');
            }
        } catch (error) {
            console.warn('Share plugin failed or not supported, falling back to clipboard', error);
            try {
                const text = `${data.title}\n${data.text}\n${data.url || ''}`;
                await navigator.clipboard.writeText(text);
                alert('Copied to clipboard!');
                return true;
            } catch (clipboardError) {
                console.error('Error copying to clipboard:', clipboardError);
                return false;
            }
        }
    }, []);

    return { share, isSupported: true }; // Always return true as we have fallback
};
