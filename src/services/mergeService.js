import DiffMatchPatch from 'diff-match-patch';

const dmp = new DiffMatchPatch();

export const mergeService = {
    /**
     * Calculates the patches required to go from text1 to text2
     */
    createPatches: (text1, text2) => {
        const diffs = dmp.diff_main(text1, text2);
        dmp.diff_cleanupSemantic(diffs);
        return dmp.patch_make(text1, diffs);
    },

    /**
     * Applies patches to a text and returns the result
     */
    applyPatches: (text, patches) => {
        const [newText, results] = dmp.patch_apply(patches, text);
        // results is an array of booleans indicating success of each patch
        return newText;
    },

    /**
     * Merges remote changes into local text while preserving local edits.
     * 
     * @param {string} baseText - The last known common state (snapshot before local edits)
     * @param {string} currentLocalText - The current text with user's unsaved edits
     * @param {string} newRemoteText - The new text received from the server
     * @returns {string} - The merged text
     */
    threeWayMerge: (baseText, currentLocalText, newRemoteText) => {
        // 1. Calculate what changed remotely: Base -> Remote
        const patches = mergeService.createPatches(baseText, newRemoteText);

        // 2. Apply those remote changes to our Local state
        // This preserves our local "Hello " and adds the remote "World"
        const [mergedText, results] = dmp.patch_apply(patches, currentLocalText);

        console.log("Merge Results:", {
            baseLength: baseText.length,
            localLength: currentLocalText.length,
            remoteLength: newRemoteText.length,
            mergedLength: mergedText.length,
            success: results
        });

        return mergedText;
    }
};
