import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Activity, User, Mail, Lock, ArrowRight } from 'lucide-react';

const SignupPage = () => {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(false);

    // Form Data
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSignup = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await register(email, password, name);
            navigate('/');
        } catch (error) {
            console.error(error);
            alert("Registration failed: " + error.message);
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
                    <h1 className="text-3xl font-bold mb-2 text-gray-900">Create Account</h1>
                    <p className="text-gray-500">Join RemindMe Buddy today</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                    <div className="relative">
                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Full Name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-100 focus:border-orange-500 focus:outline-none"
                            required
                        />
                    </div>

                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="email"
                            placeholder="Email Address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-100 focus:border-orange-500 focus:outline-none"
                            required
                        />
                    </div>

                    <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-12 pr-4 py-4 rounded-xl border-2 border-gray-100 focus:border-orange-500 focus:outline-none"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-orange-700 transition-colors shadow-lg shadow-orange-500/20 disabled:opacity-50"
                    >
                        {isLoading ? 'Creating Account...' : 'Sign Up'} <ArrowRight size={20} />
                    </button>

                    <div className="text-center mt-4">
                        <Link to="/login" className="text-sm text-gray-500 hover:text-orange-600 transition-colors">
                            Already have an account? Sign In
                        </Link>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default SignupPage;
