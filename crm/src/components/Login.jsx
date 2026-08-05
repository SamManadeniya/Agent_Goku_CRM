import { useState, useEffect } from 'react'
import { Bot, Lock, User, KeyRound, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import bcrypt from 'bcryptjs'

export default function Login({ onLogin }) {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    // Background Carousel State
    const [bgIndex, setBgIndex] = useState(0)
    const backgrounds = [
        '/bg/bg1.jpg',
        '/bg/bg2.jpg',
        '/bg/bg3.jpg'
    ]

    useEffect(() => {
        const interval = setInterval(() => {
            setBgIndex((prev) => (prev + 1) % backgrounds.length)
        }, 8000) // Changed from 5s to 8s for slower rotation
        return () => clearInterval(interval)
    }, [])

    // Password Reset State
    const [isResetting, setIsResetting] = useState(false)
    const [recoveryKey, setRecoveryKey] = useState('')
    const [newPassword, setNewPassword] = useState('')

    const handleLogin = async (e) => {
        e.preventDefault()
        if (!username || !password) return setError('Please enter username and password')

        setError('')
        setLoading(true)

        try {
            const { data: user, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('username', username.toLowerCase())
                .single()

            if (dbError || !user) {
                throw new Error('Invalid username or password')
            }

            const isValid = await bcrypt.compare(password, user.password_hash)
            if (!isValid) {
                throw new Error('Invalid username or password')
            }

            onLogin({ id: user.id, username: user.username, role: user.role })
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleReset = async (e) => {
        e.preventDefault()
        if (!username || !recoveryKey || !newPassword) return setError('Please fill all fields')

        setError('')
        setLoading(true)

        try {
            if (recoveryKey !== 'admin123') {
                throw new Error('Invalid recovery key')
            }

            if (newPassword.length < 6) {
                throw new Error('New password must be at least 6 characters')
            }

            const { data: user, error: dbError } = await supabase
                .from('users')
                .select('*')
                .eq('username', username.toLowerCase())
                .single()

            if (dbError || !user) {
                throw new Error('User not found')
            }

            const salt = await bcrypt.genSalt(10)
            const hash = await bcrypt.hash(newPassword, salt)

            const { error: updateError } = await supabase
                .from('users')
                .update({ password_hash: hash })
                .eq('id', user.id)

            if (updateError) throw updateError

            setIsResetting(false)
            setPassword(newPassword)
            setRecoveryKey('')
            setNewPassword('')
            alert('Password reset successfully! You can now log in.')
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden">
            {/* Background Carousel */}
            {backgrounds.map((bg, index) => (
                <div
                    key={bg}
                    className={`absolute inset-0 w-full h-full bg-cover bg-center transition-all duration-[2000ms] ease-in-out ${index === bgIndex ? 'opacity-100 scale-105' : 'opacity-0 scale-100'}`}
                    style={{ backgroundImage: `url('${bg}')` }}
                />
            ))}

            {/* No Dark Overlay */}

            <div className="bg-white/95 backdrop-blur-md p-8 rounded-2xl shadow-2xl max-w-md w-full z-10">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
                        <Bot size={32} className="text-blue-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Agent Goku CRM</h1>
                    <p className="text-gray-500 text-sm mt-1">{isResetting ? 'Reset your password' : 'Sign in to manage conversations'}</p>
                </div>

                {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100">{error}</div>}

                {!isResetting ? (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="admin"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>

                        <div className="text-center mt-4">
                            <button
                                type="button"
                                onClick={() => { setIsResetting(true); setError(''); }}
                                className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                            >
                                Forgot Password?
                            </button>
                        </div>
                    </form>
                ) : (
                    <form onSubmit={handleReset} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="admin"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Recovery Key</label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="password"
                                    value={recoveryKey}
                                    onChange={(e) => setRecoveryKey(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="Enter recovery key"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                    placeholder="At least 6 characters"
                                />
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-lg transition-colors mt-2"
                        >
                            {loading ? 'Resetting...' : 'Reset Password'}
                        </button>

                        <div className="text-center mt-4">
                            <button
                                type="button"
                                onClick={() => { setIsResetting(false); setError(''); }}
                                className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors flex items-center justify-center gap-1 mx-auto"
                            >
                                <ArrowLeft size={14} /> Back to Login
                            </button>
                        </div>
                    </form>
                )}
            </div>

            <div className="text-center text-sm text-gray-300 space-y-1 mt-8 z-10 drop-shadow-md">
                <p>&copy; 2025. All rights reserved.</p>
                <p>Powered by <span className="font-semibold text-white">Manden Cars</span></p>
            </div>
        </div>
    )
}
