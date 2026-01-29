import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCw } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8 text-center"
                    >
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6 text-red-600">
                            <AlertTriangle size={40} />
                        </div>
                        <h1 className="text-2xl font-bold mb-2 text-gray-900">Something went wrong</h1>
                        <p className="text-gray-500 mb-6">
                            RemindMe Buddy encountered an unexpected error.
                        </p>

                        <div className="bg-gray-100 p-4 rounded-xl text-left mb-6 overflow-auto max-h-40 text-xs font-mono text-gray-600">
                            {this.state.error && this.state.error.toString()}
                        </div>

                        <button
                            onClick={this.handleReload}
                            className="w-full bg-red-600 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20"
                        >
                            <RefreshCw size={20} /> Reload Application
                        </button>
                    </motion.div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
