import { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import Inbox from './components/Inbox'
import AuctionRequests from './components/AuctionRequests'
import Customers from './components/Customers'
import { LayoutDashboard, MessageSquare, LogOut, Bot, Car, Users } from 'lucide-react'

export default function App() {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('agent_goku_user')
    return savedUser ? JSON.parse(savedUser) : null
  })
  const [currentView, setCurrentView] = useState('inbox') // 'dashboard' or 'inbox'
  const [newLeadsCount, setNewLeadsCount] = useState(0)

  useEffect(() => {
    if (!user) return;

    const fetchLeadsCount = async () => {
      try {
        const { count, error } = await supabase
          .from('auction_requests')
          .select('*', { count: 'exact', head: true })
          .or('status.eq.New Lead,status.is.null')

        if (!error && count !== null) {
          setNewLeadsCount(count)
        }
      } catch (err) {
        console.error('Error fetching leads count:', err)
      }
    }

    fetchLeadsCount()

    const subscription = supabase
      .channel('public:auction_requests_count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auction_requests'
      }, () => {
        fetchLeadsCount()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [user])

  const handleSetUser = (newUser) => {
    setUser(newUser)
    if (newUser) {
      localStorage.setItem('agent_goku_user', JSON.stringify(newUser))
    } else {
      localStorage.removeItem('agent_goku_user')
    }
  }

  if (!user) {
    return <Login onLogin={handleSetUser} />
  }

  return (
    <div className="flex flex-col md:flex-row h-screen h-[100dvh] bg-gray-100 font-sans overflow-hidden">
      {/* Main Sidebar Navigation */}
      <div className="w-full md:w-20 h-14 md:h-auto bg-gray-900 flex flex-row md:flex-col items-center justify-around md:justify-start py-1 md:py-6 shadow-xl z-20 order-last md:order-first">
        <div className="hidden md:flex w-12 h-12 bg-blue-600 rounded-xl items-center justify-center mb-8 shadow-lg">
          <Bot size={28} className="text-white" />
        </div>

        <div className="flex flex-row md:flex-col gap-2 md:gap-4 flex-1 md:flex-none w-auto md:w-full px-3 justify-center">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`w-12 md:w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${currentView === 'dashboard' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <LayoutDashboard size={24} />
            <span className="text-[10px] font-medium hidden md:block">Stats</span>
          </button>

          <button
            onClick={() => setCurrentView('inbox')}
            className={`w-12 md:w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${currentView === 'inbox' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <MessageSquare size={24} />
            <span className="text-[10px] font-medium hidden md:block">Inbox</span>
          </button>

          <button
            onClick={() => setCurrentView('auction')}
            className={`relative w-12 md:w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${currentView === 'auction' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <div className="relative">
              <Car size={24} />
              {newLeadsCount > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-gray-900 min-w-[18px] flex items-center justify-center">
                  {newLeadsCount > 99 ? '99+' : newLeadsCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium hidden md:block">Leads</span>
          </button>

          <button
            onClick={() => setCurrentView('customers')}
            className={`w-12 md:w-full aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${currentView === 'customers' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
          >
            <Users size={24} />
            <span className="text-[10px] font-medium hidden md:block">Customers</span>
          </button>
        </div>

        <div className="mt-0 md:mt-auto flex flex-row md:flex-col items-center gap-2 md:gap-4 w-auto md:w-full px-3 md:px-0">
          <div className="hidden md:flex w-10 h-10 bg-gray-800 rounded-full items-center justify-center text-gray-300 font-bold text-sm border border-gray-700" title={user.role}>
            {user.username.substring(0, 2).toUpperCase()}
          </div>
          <button
            onClick={() => handleSetUser(null)}
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-gray-400 hover:bg-gray-800 hover:text-white transition-all"
            title="Logout"
          >
            <LogOut size={20} className="md:w-6 md:h-6" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {currentView === 'dashboard' && <Dashboard />}
        {currentView === 'inbox' && <Inbox user={user} />}
        {currentView === 'auction' && <AuctionRequests />}
        {currentView === 'customers' && <Customers />}
      </div>
    </div>
  )
}
