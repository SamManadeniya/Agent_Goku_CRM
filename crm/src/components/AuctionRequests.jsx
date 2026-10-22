import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { 
    Car, CheckCircle, Clock, Search, Phone, Calendar, DollarSign, 
    Gauge, Droplet, Settings, FileText, User, Trash2, Edit2, Check, 
    X, MessageSquare, MapPin, Tag, RefreshCw, ArrowUpRight, CheckCheck, Compass
} from 'lucide-react'
import parsePhoneNumberFromString from 'libphonenumber-js'
import * as Flags from 'country-flag-icons/react/3x2'

const formatPhoneNumber = (phone) => {
    if (!phone) return { formatted: 'Web Visitor', country: null, Flag: null, isPhone: false, raw: '' }
    const phoneStr = String(phone).trim()
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phoneStr)) {
        return { formatted: `Web Lead (${phoneStr.slice(0, 8)})`, country: null, Flag: null, isPhone: false, raw: phoneStr }
    }
    if (phoneStr === 'user_phone' || phoneStr.startsWith('web_user_')) {
        return { formatted: 'Web Showroom Visitor', country: null, Flag: null, isPhone: false, raw: phoneStr }
    }
    try {
        const withPlus = phoneStr.startsWith('+') ? phoneStr : `+${phoneStr}`
        const phoneNumber = parsePhoneNumberFromString(withPlus)
        if (phoneNumber && phoneNumber.isValid()) {
            const country = phoneNumber.country
            const Flag = country ? Flags[country] : null
            return {
                formatted: phoneNumber.formatInternational(),
                country: country,
                Flag: Flag,
                isPhone: true,
                raw: phoneNumber.number.replace('+', '')
            }
        }
    } catch (e) {
        // ignore
    }
    const cleanDigits = phoneStr.replace(/\D/g, '')
    return { formatted: phoneStr, country: null, Flag: null, isPhone: cleanDigits.length >= 8, raw: cleanDigits }
}

const normalizeDigits = (str) => String(str || '').replace(/\D/g, '')

// Helper to categorize request type
const getRequestType = (req) => {
    const makeStr = String(req.make || '').toLowerCase()
    const conditionStr = String(req.condition || '').toLowerCase()
    const notesStr = String(req.other_requirements || '').toLowerCase()

    if (conditionStr.includes('test drive') || conditionStr.includes('drive-away') || notesStr.includes('test drive') || notesStr.includes('drive-away')) {
        return 'test_drive'
    }
    if (makeStr.includes('trade-in') || conditionStr.includes('trade-in') || notesStr.includes('trade-in')) {
        return 'trade_in'
    }
    return 'sourcing'
}

export default function AuctionRequests() {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('all') // 'all', 'test_drive', 'sourcing', 'trade_in', 'completed'
    const [searchQuery, setSearchQuery] = useState('')
    const [editingId, setEditingId] = useState(null)
    const [tempName, setTempName] = useState('')
    const isFetchingRef = useRef(false)

    useEffect(() => {
        fetchRequests()

        const subscription = supabase
            .channel('public:auction_requests_realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'auction_requests'
            }, () => {
                fetchRequests()
            })
            .subscribe()

        const userSubscription = supabase
            .channel('public:auction_requests_user_sync')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user'
            }, () => {
                fetchRequests()
            })
            .subscribe()

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') fetchRequests()
        }
        const handleWindowFocus = () => fetchRequests()

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('focus', handleWindowFocus)

        const interval = setInterval(fetchRequests, 15000)

        return () => {
            supabase.removeChannel(subscription)
            supabase.removeChannel(userSubscription)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('focus', handleWindowFocus)
            clearInterval(interval)
        }
    }, [])

    const fetchRequests = async () => {
        if (isFetchingRef.current) return
        isFetchingRef.current = true
        try {
            const { data, error } = await supabase
                .from('auction_requests')
                .select('*')
                .order('created_at', { ascending: false })

            if (error) throw error

            // Fetch customer names with exact and normalized matching
            const phoneNumbers = data.map(req => req.phone_number).filter(Boolean)
            if (phoneNumbers.length > 0) {
                const { data: userData, error: userError } = await supabase
                    .from('user')
                    .select('id, mobile, contact_name')

                if (!userError && userData) {
                    const userMap = {}
                    const normalizedUserMap = {}
                    userData.forEach(u => {
                        if (u.mobile) {
                            userMap[u.mobile] = u.contact_name
                            const norm = normalizeDigits(u.mobile)
                            if (norm) normalizedUserMap[norm] = u.contact_name
                        }
                    })
                    data.forEach(req => {
                        const raw = req.phone_number
                        const normReq = normalizeDigits(raw)
                        const resolvedName = userMap[raw] || (normReq ? normalizedUserMap[normReq] : null) || req.preferred_color
                        // If preferred_color contains customer name (as stored by agent kuruma), use it
                        req.contact_name = resolvedName && resolvedName !== 'Any' ? resolvedName : null
                    })
                }
            }

            setRequests(data)
        } catch (error) {
            console.error('Error fetching leads:', error)
        } finally {
            setLoading(false)
            isFetchingRef.current = false
        }
    }

    const saveContactName = async (reqId, phoneNumber, newName) => {
        const trimmed = (newName || '').trim()
        if (!trimmed) return setEditingId(null)

        try {
            const normPhone = normalizeDigits(phoneNumber)
            const { data: allUsers } = await supabase.from('user').select('id, mobile')

            let existing = null
            if (allUsers) {
                existing = allUsers.find(u => u.mobile === phoneNumber || (normPhone && normalizeDigits(u.mobile) === normPhone))
            }

            if (existing) {
                const { error: updateErr } = await supabase
                    .from('user')
                    .update({ contact_name: trimmed })
                    .eq('id', existing.id)
                if (updateErr) throw updateErr
            } else if (phoneNumber) {
                const { error: insertErr } = await supabase
                    .from('user')
                    .insert({ mobile: phoneNumber, contact_name: trimmed, agent_status: true })
                if (insertErr) throw insertErr
            }

            // Also update preferred_color on auction_requests as fallback name store
            await supabase
                .from('auction_requests')
                .update({ preferred_color: trimmed })
                .eq('id', reqId)

            setRequests(prev => prev.map(r => r.id === reqId ? { ...r, contact_name: trimmed } : r))
            setEditingId(null)
        } catch (err) {
            console.error('Error saving customer name:', err)
            alert('Failed to save customer name.')
        }
    }

    const handleUpdateStatus = async (id, newStatus) => {
        try {
            const { error } = await supabase
                .from('auction_requests')
                .update({ status: newStatus })
                .eq('id', id)

            if (error) throw error

            setRequests(prev => prev.map(req => req.id === id ? { ...req, status: newStatus } : req))
        } catch (error) {
            console.error('Error updating lead status:', error)
            alert('Failed to update status.')
        }
    }

    const handleDeleteRequest = async (id) => {
        if (!window.confirm('Are you sure you want to delete this lead?')) return;
        try {
            const { error } = await supabase
                .from('auction_requests')
                .delete()
                .eq('id', id)

            if (error) throw error
            setRequests(prev => prev.filter(req => req.id !== id))
        } catch (error) {
            console.error('Error deleting lead:', error)
            alert('Failed to delete lead.')
        }
    }

    // Counts by category
    const counts = {
        all: requests.filter(r => r.status !== 'Completed').length,
        test_drive: requests.filter(r => r.status !== 'Completed' && getRequestType(r) === 'test_drive').length,
        sourcing: requests.filter(r => r.status !== 'Completed' && getRequestType(r) === 'sourcing').length,
        trade_in: requests.filter(r => r.status !== 'Completed' && getRequestType(r) === 'trade_in').length,
        completed: requests.filter(r => r.status === 'Completed').length
    }

    const filteredRequests = requests.filter(req => {
        const type = getRequestType(req)
        const isCompleted = req.status === 'Completed'

        if (activeTab === 'completed' && !isCompleted) return false
        if (activeTab !== 'completed' && isCompleted) return false

        if (activeTab === 'test_drive' && type !== 'test_drive') return false
        if (activeTab === 'sourcing' && type !== 'sourcing') return false
        if (activeTab === 'trade_in' && type !== 'trade_in') return false

        if (!searchQuery.trim()) return true

        const q = searchQuery.toLowerCase()
        return (
            (req.make?.toLowerCase().includes(q)) ||
            (req.model?.toLowerCase().includes(q)) ||
            (req.phone_number?.includes(q)) ||
            (req.contact_name?.toLowerCase().includes(q)) ||
            (req.budget?.toLowerCase().includes(q)) ||
            (req.other_requirements?.toLowerCase().includes(q))
        )
    })

    return (
        <div className="flex flex-col h-full w-full bg-[#f8fafc] font-sans overflow-hidden">
            {/* Top Header Bar */}
            <div className="bg-white border-b border-gray-100 p-4 md:p-6 shadow-sm z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
                            <Car size={22} />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                                Bookings & Leads Hub
                                <span className="bg-blue-100 text-blue-700 text-xs px-2.5 py-0.5 rounded-full font-semibold">
                                    Aussie Motors
                                </span>
                            </h1>
                            <p className="text-xs md:text-sm text-gray-500">Live Drive-Away bookings, custom vehicle sourcing, and trade-in appraisals.</p>
                        </div>
                    </div>
                </div>

                {/* Search & Actions */}
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative w-full sm:w-72">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search car, customer, phone, stock..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 text-xs md:text-sm rounded-xl pl-9 pr-4 py-2 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                    <button
                        onClick={fetchRequests}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 rounded-xl transition-colors"
                        title="Refresh Leads"
                    >
                        <RefreshCw size={17} />
                    </button>
                </div>
            </div>

            {/* Filter Tabs Navigation */}
            <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                <button
                    onClick={() => setActiveTab('all')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all whitespace-nowrap ${
                        activeTab === 'all'
                            ? 'bg-gray-900 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                    <span>All Active</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
                        {counts.all}
                    </span>
                </button>

                <button
                    onClick={() => setActiveTab('test_drive')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all whitespace-nowrap ${
                        activeTab === 'test_drive'
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                    }`}
                >
                    <Calendar size={15} />
                    <span>🚘 Drive-Away & Test Drives</span>
                    {counts.test_drive > 0 && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'test_drive' ? 'bg-white/25 text-white' : 'bg-blue-100 text-blue-700'}`}>
                            {counts.test_drive}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('sourcing')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all whitespace-nowrap ${
                        activeTab === 'sourcing'
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-600'
                    }`}
                >
                    <Compass size={15} />
                    <span>📋 Custom Sourcing</span>
                    {counts.sourcing > 0 && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'sourcing' ? 'bg-white/25 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                            {counts.sourcing}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('trade_in')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all whitespace-nowrap ${
                        activeTab === 'trade_in'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'text-gray-600 hover:bg-amber-50 hover:text-amber-600'
                    }`}
                >
                    <RefreshCw size={14} />
                    <span>🔁 Trade-In Valuations</span>
                    {counts.trade_in > 0 && (
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'trade_in' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-700'}`}>
                            {counts.trade_in}
                        </span>
                    )}
                </button>

                <button
                    onClick={() => setActiveTab('completed')}
                    className={`flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-semibold rounded-xl transition-all whitespace-nowrap ml-auto ${
                        activeTab === 'completed'
                            ? 'bg-green-600 text-white shadow-sm'
                            : 'text-gray-500 hover:bg-green-50 hover:text-green-600'
                    }`}
                >
                    <CheckCheck size={15} />
                    <span>Completed</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${activeTab === 'completed' ? 'bg-white/25 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {counts.completed}
                    </span>
                </button>
            </div>

            {/* Leads Card Grid */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-400 gap-2">
                        <RefreshCw className="animate-spin" size={18} />
                        <span>Loading Aussie Motors leads...</span>
                    </div>
                ) : filteredRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                        <div className="w-16 h-16 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-sm">
                            <Car size={28} className="text-gray-300" />
                        </div>
                        <p className="text-base font-semibold text-gray-700">No {activeTab.replace('_', ' ')} leads found.</p>
                        <p className="text-xs text-gray-400">Incoming bookings from Agent Kuruma will appear here in real-time.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-5">
                        {filteredRequests.map((req) => {
                            const leadType = getRequestType(req)
                            const { formatted, Flag, raw } = formatPhoneNumber(req.phone_number)
                            const customerName = req.contact_name || req.preferred_color || 'Web Visitor'
                            const isEditing = editingId === req.id

                            // WhatsApp Direct URL
                            const cleanPhone = raw || normalizeDigits(req.phone_number)
                            const whatsappMsg = leadType === 'test_drive'
                                ? `Hi ${customerName}, this is Aussie Motors regarding your test drive appointment for the ${req.build_year || ''} ${req.make} ${req.model}! Looking forward to seeing you at our Sydney yard.`
                                : `Hi ${customerName}, this is Aussie Motors regarding your vehicle inquiry for ${req.make} ${req.model}! How can we assist you today?`
                            const whatsappUrl = cleanPhone ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMsg)}` : null

                            return (
                                <div
                                    key={req.id}
                                    className={`bg-white rounded-2xl shadow-sm border transition-all hover:shadow-md flex flex-col overflow-hidden ${
                                        leadType === 'test_drive'
                                            ? 'border-blue-200/80 hover:border-blue-400'
                                            : leadType === 'trade_in'
                                            ? 'border-amber-200/80 hover:border-amber-400'
                                            : 'border-gray-200 hover:border-gray-300'
                                    }`}
                                >
                                    {/* Top Card Header Banner */}
                                    <div className={`p-4 border-b flex items-start justify-between gap-3 ${
                                        leadType === 'test_drive'
                                            ? 'bg-gradient-to-r from-blue-50/80 via-white to-sky-50/50 border-blue-100'
                                            : leadType === 'trade_in'
                                            ? 'bg-gradient-to-r from-amber-50/80 via-white to-yellow-50/50 border-amber-100'
                                            : 'bg-gradient-to-r from-gray-50 via-white to-slate-50 border-gray-100'
                                    }`}>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                {leadType === 'test_drive' && (
                                                    <span className="inline-flex items-center gap-1 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                                        <Calendar size={11} /> Drive-Away Booking
                                                    </span>
                                                )}
                                                {leadType === 'trade_in' && (
                                                    <span className="inline-flex items-center gap-1 bg-amber-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                                        <RefreshCw size={11} /> Trade-In Appraisal
                                                    </span>
                                                )}
                                                {leadType === 'sourcing' && (
                                                    <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-xs">
                                                        <Compass size={11} /> Custom Sourcing
                                                    </span>
                                                )}

                                                <span className="text-[11px] text-gray-400 flex items-center gap-1 ml-auto">
                                                    <Clock size={11} />
                                                    {new Date(req.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                </span>
                                            </div>

                                            <h3 className="text-base font-bold text-gray-900 tracking-tight truncate">
                                                {req.build_year && !req.make?.includes(req.build_year) ? `${req.build_year} ` : ''}
                                                {req.make || 'Vehicle'} {req.model || ''}
                                            </h3>

                                            {/* Customer Name Row */}
                                            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-600">
                                                <User size={13} className="text-gray-400 flex-shrink-0" />
                                                {isEditing ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={tempName}
                                                            onChange={e => setTempName(e.target.value)}
                                                            className="border border-blue-400 bg-white rounded-md px-2 py-0.5 text-xs outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                                                            autoFocus
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') saveContactName(req.id, req.phone_number, tempName)
                                                                if (e.key === 'Escape') setEditingId(null)
                                                            }}
                                                        />
                                                        <button onClick={() => saveContactName(req.id, req.phone_number, tempName)} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                                                            <Check size={13} />
                                                        </button>
                                                        <button onClick={() => setEditingId(null)} className="p-0.5 text-gray-400 hover:bg-gray-100 rounded">
                                                            <X size={13} />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 font-medium truncate">
                                                        <span className="truncate">{customerName}</span>
                                                        <button
                                                            onClick={() => { setEditingId(req.id); setTempName(customerName !== 'Web Visitor' ? customerName : ''); }}
                                                            className="text-gray-400 hover:text-blue-600 p-0.5"
                                                            title="Edit name"
                                                        >
                                                            <Edit2 size={11} />
                                                        </button>
                                                    </div>
                                                )}
                                                {Flag && <Flag title={formatted} className="w-3.5 h-2.5 rounded-xs flex-shrink-0 ml-1" />}
                                                <span className="text-gray-400 text-[11px] truncate">{formatted}</span>
                                            </div>
                                        </div>

                                        {/* Status Badge */}
                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                                            req.status === 'Completed'
                                                ? 'bg-green-100 text-green-700'
                                                : req.status === 'Confirmed'
                                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                                : 'bg-blue-100 text-blue-700'
                                        }`}>
                                            {req.status || 'New Lead'}
                                        </div>
                                    </div>

                                    {/* Test Drive Highlight Banner */}
                                    {leadType === 'test_drive' && (
                                        <div className="bg-blue-600 text-white px-4 py-2 text-xs flex items-center justify-between font-medium shadow-inner">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar size={13} />
                                                <span>{req.max_mileage?.replace('Appointment: ', '') || 'Flexible Date'}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-blue-100 text-[11px]">
                                                <Tag size={12} />
                                                <span>{req.budget || 'Stock Unit'}</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Middle Key-Value Specifications */}
                                    <div className="p-4 flex-1 grid grid-cols-2 gap-y-3 gap-x-3 text-xs">
                                        {leadType === 'test_drive' ? (
                                            <>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><MapPin size={11} /> Showroom Yard</span>
                                                    <span className="text-gray-800 font-semibold">{req.fuel_type || 'Sydney Yard'}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><Tag size={11} /> Yard Stock ID</span>
                                                    <span className="text-gray-800 font-semibold">{req.budget || '-'}</span>
                                                </div>
                                            </>
                                        ) : leadType === 'trade_in' ? (
                                            <>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><Gauge size={11} /> Odometer km</span>
                                                    <span className="text-gray-800 font-semibold">{req.max_mileage || '-'}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><Settings size={11} /> Condition</span>
                                                    <span className="text-gray-800 font-semibold">{req.condition || 'Good'}</span>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><DollarSign size={11} /> Indicative Budget</span>
                                                    <span className="text-gray-800 font-semibold text-blue-600">{req.budget || 'Flexible'}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><Gauge size={11} /> Max Mileage</span>
                                                    <span className="text-gray-800 font-semibold">{req.max_mileage || 'Any'}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><Settings size={11} /> Transmission</span>
                                                    <span className="text-gray-800 font-semibold">{req.transmission || 'Auto'}</span>
                                                </div>
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1"><Droplet size={11} /> Fuel Type</span>
                                                    <span className="text-gray-800 font-semibold">{req.fuel_type || 'Hybrid/Petrol'}</span>
                                                </div>
                                            </>
                                        )}

                                        {/* Notes Section */}
                                        {req.other_requirements && (
                                            <div className="col-span-2 pt-2 mt-1 border-t border-gray-100 flex flex-col gap-1">
                                                <span className="text-gray-400 text-[11px] font-medium flex items-center gap-1">
                                                    <FileText size={11} /> Client Requirements & Notes
                                                </span>
                                                <p className="text-gray-700 text-xs bg-gray-50/80 p-2 rounded-lg border border-gray-100 line-clamp-3">
                                                    {req.other_requirements}
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Footer */}
                                    <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                                        {whatsappUrl ? (
                                            <a
                                                href={whatsappUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs"
                                                title="Open WhatsApp chat with client"
                                            >
                                                <MessageSquare size={13} />
                                                <span>WhatsApp</span>
                                                <ArrowUpRight size={12} className="opacity-75" />
                                            </a>
                                        ) : (
                                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                                <Phone size={11} /> No phone provided
                                            </span>
                                        )}

                                        <div className="flex items-center gap-1.5 ml-auto">
                                            {req.status !== 'Completed' ? (
                                                <button
                                                    onClick={() => handleUpdateStatus(req.id, 'Completed')}
                                                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
                                                    title="Mark lead as completed"
                                                >
                                                    <CheckCircle size={13} />
                                                    <span>Complete</span>
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => handleUpdateStatus(req.id, 'New Lead')}
                                                    className="px-2.5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-semibold rounded-xl transition-colors"
                                                    title="Re-open Lead"
                                                >
                                                    Reopen
                                                </button>
                                            )}

                                            <button
                                                onClick={() => handleDeleteRequest(req.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                                                title="Delete Lead"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
