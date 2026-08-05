import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { MessageSquare, Users, Activity } from 'lucide-react'

export default function Dashboard() {
    const [stats, setStats] = useState({ totalChats: 0, totalMessages: 0, activeToday: 0, onlineNow: 0 })
    const [chartData, setChartData] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function fetchStats() {
            try {
                const { data, error } = await supabase
                    .from('agent_goku')
                    .select('session_id, created_at')
                    .limit(10000)

                if (error) throw error

                const uniqueSessions = new Set()
                let activeTodayCount = 0
                let onlineNowCount = 0
                const today = new Date().toDateString()
                const now = new Date()
                const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60000)
                const messagesPerDay = {}
                const sessionLastActive = {}

                data.forEach(row => {
                    const sessionId = String(row.session_id)
                    uniqueSessions.add(sessionId)
                    const date = new Date(row.created_at)
                    if (date.toDateString() === today) activeTodayCount++

                    if (!sessionLastActive[sessionId] || date > sessionLastActive[sessionId]) {
                        sessionLastActive[sessionId] = date
                    }

                    const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                    messagesPerDay[dateStr] = (messagesPerDay[dateStr] || 0) + 1
                })

                Object.values(sessionLastActive).forEach(lastActive => {
                    if (lastActive > fifteenMinutesAgo) {
                        onlineNowCount++
                    }
                })

                setStats({
                    totalChats: uniqueSessions.size,
                    totalMessages: data.length,
                    activeToday: activeTodayCount,
                    onlineNow: onlineNowCount
                })

                const formattedChartData = Object.keys(messagesPerDay)
                    .map(date => ({ date, messages: messagesPerDay[date] }))
                    .slice(-7)

                setChartData(formattedChartData)
            } catch (error) {
                console.error('Error fetching stats:', error)
            } finally {
                setLoading(false)
            }
        }
        fetchStats()
    }, [])

    if (loading) return <div className="p-8 text-gray-500 flex items-center justify-center h-full">Loading dashboard data...</div>

    return (
        <div className="p-8 max-w-6xl mx-auto w-full overflow-y-auto h-full">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">Analytics Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Total Clients</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.totalChats}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center relative">
                        <div className="absolute top-2 right-2 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse border-2 border-emerald-100"></div>
                        <Activity size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Online Now</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.onlineNow}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center">
                        <MessageSquare size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Total Messages</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.totalMessages}</p>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                        <Activity size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Messages Today</p>
                        <p className="text-2xl font-bold text-gray-800">{stats.activeToday}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold text-gray-800 mb-6">Message Volume (Last 7 Days)</h2>
                <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                            <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Bar dataKey="messages" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    )
}
