import { initializeApp } from "firebase/app";
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    PhoneAuthProvider,
    RecaptchaVerifier,
    signInWithPhoneNumber,
    signInWithCredential,
    setPersistence,
    browserLocalPersistence
} from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

const firebaseConfig = {
    apiKey: "AIzaSyBi1ZfMBLy3mA6EMOLtEfkWgqfCp2ghJwk",
    authDomain: "remindme-app-9988.firebaseapp.com",
    projectId: "remindme-app-9988",
    storageBucket: "remindme-app-9988.appspot.com",
    messagingSenderId: "973886994765",
    appId: "1:973886994765:web:7896eeb6d24442e1c69f04",
    measurementId: "G-77J75R9XMZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((error) => {
    console.error("Firebase persistence error", error);
});
const db = getFirestore(app);

// Initialize Native Google Auth
if (Capacitor.isNativePlatform()) {
    GoogleAuth.initialize({
        clientId: '973886994765-hm2vef586372i9d1crubnfq7dke3j0lf.apps.googleusercontent.com',
        scopes: ['profile', 'email'],
        grantOfflineAccess: true,
    });
}

// Google Sign In
const googleProvider = new GoogleAuthProvider();
export const signInWithGoogle = async () => {
    try {
        let user;
        if (Capacitor.isNativePlatform()) {
            // Native Google Sign-In
            const googleUser = await GoogleAuth.signIn();
            // Create credential
            const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
            const result = await signInWithCredential(auth, credential);
            user = result.user;
        } else {
            // Web Fallback
            const result = await signInWithPopup(auth, googleProvider);
            user = result.user;
        }
        await createUserDocument(user);
        return user;
    } catch (error) {
        console.error("Error signing in with Google", error);
        throw error;
    }
};

// Email Sign Up
export const registerWithEmail = async (email, password, name) => {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        await createUserDocument(user, { displayName: name });
        return user;
    } catch (error) {
        console.error("Error registering with email", error);
        throw error;
    }
};

// Email Sign In
export const loginWithEmail = async (email, password) => {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return userCredential.user;
    } catch (error) {
        console.error("Error logging in with email", error);
        throw error;
    }
};

// Phone Sign In Helper - Setup Recaptcha
export const setupRecaptcha = (elementId) => {
    if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, elementId, {
            'size': 'invisible',
            'callback': (response) => {
                // reCAPTCHA solved, allow signInWithPhoneNumber.
            }
        });
    }
};

// Phone Sign In
export const signInWithPhone = async (phoneNumber) => {
    try {
        const appVerifier = window.recaptchaVerifier;
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        return confirmationResult; // User enters code and calls confirmationResult.confirm(code)
    } catch (error) {
        console.error("Error signing in with phone", error);
        throw error;
    }
};


// Logout
export const logout = () => {
    return signOut(auth);
};

// Create User Document in Firestore
const createUserDocument = async (user, additionalData) => {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) {
        const { displayName, email, photoURL, phoneNumber } = user;
        const createdAt = new Date();

        try {
            await setDoc(userRef, {
                displayName,
                email,
                phoneNumber,
                photoURL,
                createdAt,
                ...additionalData
            });
        } catch (error) {
            console.error("Error creating user document", error);
        }
    }
};

const storage = getStorage(app);

export { auth, db, storage };
