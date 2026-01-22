import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Activity, Phone, ArrowRight } from 'lucide-react';

const LoginPage = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);

    // Auth States
    const [authMethod, setAuthMethod] = useState('initial'); // 'initial', 'phone', 'email'
    const [step, setStep] = useState('input'); // 'input', 'otp'

    // Form Data
    const [phoneNumber, setPhoneNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmationResult, setConfirmationResult] = useState(null);

    React.useEffect(() => {
        import('../services/firebase').then(module => {
            module.setupRecaptcha('recaptcha-container');
        });
    }, []);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            await login('google');
            navigate('/');
        } catch (error) {
            console.error(error);
            alert("Google Sign In failed: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePhoneSignIn = async () => {
        setIsLoading(true);
        try {
            // Ensure phone number has country code if not present, e.g., +91 for India default or use exact input
            const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
            const result = await login('phone', { phone: formattedPhone });
            setConfirmationResult(result);
            setStep('otp');
        } catch (error) {
            console.error(error);
            alert("Phone Sign In failed: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyOtp = async () => {
        setIsLoading(true);
        try {
            await confirmationResult.confirm(otp);
            navigate('/');
        } catch (error) {
            console.error(error);
            alert("Invalid OTP");
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await login('email', { email, password });
            navigate('/');
        } catch (error) {
            console.error(error);
            alert("Login failed: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8"
            >
                <div className="text-center mb-10">
                    <div className="w-20 h-20 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-orange-600">
                        <Activity size={40} />
                    </div>
                    <h1 className="text-3xl font-bold mb-2 text-gray-900">RemindMe Buddy</h1>
                    <p className="text-gray-500">Your personal health companion</p>
                </div>

                <div className="space-y-4">
                    {/* Main Options */}
                    {authMethod === 'initial' && (
                        <>
                            <button
                                onClick={handleGoogleLogin}
                                disabled={isLoading}
                                className="w-full bg-white border-2 border-gray-100 text-gray-700 font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
                                Continue with Google
                            </button>

                            <button
                                onClick={() => setAuthMethod('phone')}
                                className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors shadow-lg shadow-orange-500/20"
                            >
                                <Phone size={20} />
                                Sign in with Phone
                            </button>

                            <button
                                onClick={() => setAuthMethod('email')}
                                className="w-full bg-gray-100 text-gray-700 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors"
                            >
                                Sign in with Email
                            </button>

                            <div className="mt-4 text-center">
                                <span className="text-gray-400 text-sm">Don't have an account? </span>
                                <button onClick={() => navigate('/signup')} className="text-orange-600 font-bold text-sm hover:underline">
                                    Sign Up
                                </button>
                            </div>
                        </>
                    )}

                    {/* Phone Auth Flow */}
                    {authMethod === 'phone' && (
                        <div className="space-y-4">
                            {step === 'input' ? (
                                <>
                                    <div className="relative">
                                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                        <input
                                            type="tel"
                                            placeholder="Phone number (e.g. 9876543210)"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-100 focus:border-orange-500 focus:outline-none"
                                        />
                                    </div>
                                    <div id="recaptcha-container"></div>
                                    <button
                                        onClick={handlePhoneSignIn}
                                        disabled={isLoading || !phoneNumber}
                                        className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors shadow-lg shadow-orange-500/20 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Sending OTP...' : 'Send OTP'} <ArrowRight size={20} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <input
                                        type="text"
                                        placeholder="Enter OTP"
                                        value={otp}
                                        onChange={(e) => setOtp(e.target.value)}
                                        className="w-full px-4 py-4 rounded-xl border-2 border-gray-100 focus:border-orange-500 focus:outline-none text-center text-xl tracking-widest"
                                    />
                                    <button
                                        onClick={handleVerifyOtp}
                                        disabled={isLoading || !otp}
                                        className="w-full bg-green-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-lg shadow-green-500/20 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Verifying...' : 'Verify OTP'}
                                    </button>
                                </>
                            )}
                            <button onClick={() => { setAuthMethod('initial'); setStep('input'); }} className="w-full text-gray-400 text-sm hover:text-gray-600">
                                Cancel
                            </button>
                        </div>
                    )}

                    {/* Email Auth Flow */}
                    {authMethod === 'email' && (
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <input
                                type="email"
                                placeholder="Email address"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-4 rounded-xl border-2 border-gray-100 focus:border-orange-500 focus:outline-none"
                                required
                            />
                            <input
                                type="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-4 rounded-xl border-2 border-gray-100 focus:border-orange-500 focus:outline-none"
                                required
                            />
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors shadow-lg shadow-orange-500/20 disabled:opacity-50"
                            >
                                {isLoading ? 'Signing in...' : 'Sign In'}
                            </button>
                            <button type="button" onClick={() => setAuthMethod('initial')} className="w-full text-gray-400 text-sm hover:text-gray-600">
                                Cancel
                            </button>
                        </form>
                    )}
                </div>

                <p className="text-center mt-8 text-sm text-gray-400">
                    By continuing, you agree to our Terms of Service and Privacy Policy.
                </p>
            </motion.div>
        </div>
    );
};

export default LoginPage;
