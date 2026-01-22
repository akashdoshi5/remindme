import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, signInWithGoogle, signInWithPhone, loginWithEmail, registerWithEmail, logout } from '../services/firebase';


const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            setUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const login = async (method, data = {}) => {
        if (method === 'google') {
            return signInWithGoogle();
        } else if (method === 'phone') {
            return signInWithPhone(data.phone);
        } else if (method === 'email') {
            return loginWithEmail(data.email, data.password);
        }
    };

    const register = async (email, password, name) => {
        return registerWithEmail(email, password, name);
    };

    const value = {
        user,
        loading,
        login,
        register,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
