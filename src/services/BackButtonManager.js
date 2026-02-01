
// Simple LIFO stack for back button handlers
// Modals push their "close" handler when opening, pop when closing.
// If stack is empty, App.jsx handles default navigation.

const handlers = [];

export const BackButtonManager = {
    /**
     * Register a priority handler.
     * @param {Function} handler - Function to execute on back press. Return true to stop propagation.
     * @returns {Function} unregister - Call this to remove the handler.
     */
    register: (handler) => {
        handlers.push(handler);
        // console.log('BackButtonManager: Handler registered. Stack size:', handlers.length);
        return () => {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
                // console.log('BackButtonManager: Handler removed. Stack size:', handlers.length);
            }
        };
    },

    /**
     * Execute the top-most handler.
     * @returns {Promise<boolean>} true if handled, false if should fall back to default
     */
    handleBackPress: async () => {
        if (handlers.length > 0) {
            const topHandler = handlers[handlers.length - 1];
            try {
                // If handler returns true (or Promise<true>), we consider it handled.
                const result = await topHandler();
                return result !== false; // Default to handled unless explicitly false
            } catch (e) {
                console.error("Error in back handler:", e);
                return false;
            }
        }
        return false;
    }
};
