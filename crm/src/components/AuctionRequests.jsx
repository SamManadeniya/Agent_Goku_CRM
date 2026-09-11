import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { Car, CheckCircle, Clock, Search, Filter, Phone, Calendar, DollarSign, Gauge, Droplet, Settings, Palette, FileText, User, Trash2, Edit2, Check, X } from 'lucide-react'
import parsePhoneNumberFromString from 'libphonenumber-js'
import * as Flags from 'country-flag-icons/react/3x2'

const formatPhoneNumber = (phone) => {
    if (!phone) return { formatted: 'Unknown Customer', country: null, Flag: null, isPhone: false }
    const phoneStr = String(phone).trim()
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(phoneStr)) {
        return { formatted: `Web Lead (${phoneStr.slice(0, 8)})`, country: null, Flag: null, isPhone: false }
    }
    if (phoneStr === 'user_phone') {
        return { formatted: 'Direct Lead', country: null, Flag: null, isPhone: false }
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
                isPhone: true
            }
        }
    } catch (e) {
        // ignore
    }
    return { formatted: phoneStr, country: null, Flag: null, isPhone: false }
}

const normalizeDigits = (str) => String(str || '').replace(/\D/g, '')

export default function AuctionRequests() {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState('New Lead') // 'New Lead' or 'Completed'
    const [searchQuery, setSearchQuery] = useState('')
    const [editingId, setEditingId] = useState(null)
    const [tempName, setTempName] = useState('')
    const isFetchingRef = useRef(false)

    useEffect(() => {
        fetchRequests()

        const subscription = supabase
            .channel('public:auction_requests')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'auction_requests'
            }, () => {
                fetchRequests()
            })
            .subscribe()

        const userSubscription = supabase
            .channel('public:auction_requests_user')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user'
            }, () => {
                fetchRequests()
            })
            .subscribe()

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchRequests()
            }
        }

        const handleWindowFocus = () => {
            fetchRequests()
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('focus', handleWindowFocus)

        // 15-second fallback heartbeat to guarantee fresh data even if connection drops
        const interval = setInterval(() => {
            fetchRequests()
        }, 15000)

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

            // Fetch user names with exact and normalized matching
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
                        req.contact_name = userMap[raw] || (normReq ? normalizedUserMap[normReq] : null) || null
                    })
                }
            }

            setRequests(data)
        } catch (error) {
            console.error('Error fetching auction requests:', error)
        } finally {
            setLoading(false)
            isFetchingRef.current = false
        }
    }

    const saveContactName = async (reqId, phoneNumber, newName) => {
        const trimmed = (newName || '').trim()
        if (!trimmed) return setEditingId(null)

        try {
            // Find if user already exists
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

            // Update local state immediately
            setRequests(prev => prev.map(r => r.id === reqId ? { ...r, contact_name: trimmed } : r))
            setEditingId(null)
        } catch (err) {
            console.error('Error saving customer name:', err)
            alert('Failed to save customer name.')
        }
    }

    const handleMarkCompleted = async (id) => {
        try {
            const { error } = await supabase
                .from('auction_requests')
                .update({ status: 'Completed' })
                .eq('id', id)

            if (error) throw error

            // Optimistically update local state
            setRequests(prev => prev.map(req => req.id === id ? { ...req, status: 'Completed' } : req))
        } catch (error) {
            console.error('Error updating status:', error)
            alert('Failed to update status.')
        }
    }

    const handleDeleteRequest = async (id) => {
        if (!window.confirm('Are you sure you want to delete this request?')) return;
        try {
            const { error } = await supabase
                .from('auction_requests')
                .delete()
                .eq('id', id)

            if (error) throw error

            // Optimistically update local state
            setRequests(prev => prev.filter(req => req.id !== id))
        } catch (error) {
            console.error('Error deleting request:', error)
            alert('Failed to delete request.')
        }
    }

    const filteredRequests = requests.filter(req => {
        const matchesTab = activeTab === 'All' || (req.status || 'New Lead') === activeTab
        const searchLower = searchQuery.toLowerCase()
        const matchesSearch =
            (req.make?.toLowerCase().includes(searchLower)) ||
            (req.model?.toLowerCase().includes(searchLower)) ||
            (req.phone_number?.includes(searchLower))

        return matchesTab && matchesSearch
    })

    return (
        <div className="flex flex-col h-full w-full bg-[#f8fafc] font-sans overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 md:p-6 shadow-sm z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
                        <Car className="text-blue-600" size={28} />
                        Auction Leads
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Manage and fulfill customer vehicle requests.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative w-full sm:w-64">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search make, model, phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200/50 w-full sm:w-auto">
                        <button
                            onClick={() => setActiveTab('New Lead')}
                            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'New Lead' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => setActiveTab('Completed')}
                            className={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'Completed' ? 'bg-white shadow-sm text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Completed
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-400">Loading requests...</div>
                ) : filteredRequests.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                            <Car size={32} className="text-gray-300" />
                        </div>
                        <p className="text-lg font-medium">No {activeTab.toLowerCase()} requests found.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
                        {filteredRequests.map((req) => (
                            <div key={req.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col transition-all hover:shadow-md">
                                <div className="p-5 border-b border-gray-50 flex justify-between items-start bg-gradient-to-br from-gray-50 to-white">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-800 tracking-tight">
                                            {req.make || 'Unknown Make'} {req.model || 'Unknown Model'}
                                        </h3>
                                        {(() => {
                                            const { formatted, Flag, isPhone } = formatPhoneNumber(req.phone_number)
                                            const hasName = Boolean(req.contact_name)

                                            if (editingId === req.id) {
                                                return (
                                                    <div className="flex items-center gap-1.5 mt-1.5">
                                                        <input
                                                            type="text"
                                                            value={tempName}
                                                            onChange={e => setTempName(e.target.value)}
                                                            placeholder="Customer name..."
                                                            className="border border-blue-400 bg-white rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-blue-500/20 w-full max-w-[150px] shadow-sm font-medium"
                                                            autoFocus
                                                            onKeyDown={e => {
                                                                if (e.key === 'Enter') saveContactName(req.id, req.phone_number, tempName)
                                                                if (e.key === 'Escape') setEditingId(null)
                                                            }}
                                                        />
                                                        <button
                                                            onClick={() => saveContactName(req.id, req.phone_number, tempName)}
                                                            className="text-green-600 hover:bg-green-50 p-1 rounded-md transition-colors shadow-sm bg-white border border-green-200"
                                                            title="Save Name"
                                                        >
                                                            <Check size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => setEditingId(null)}
                                                            className="text-red-600 hover:bg-red-50 p-1 rounded-md transition-colors shadow-sm bg-white border border-red-200"
                                                            title="Cancel"
                                                        >
                                                            <X size={14} />
                                                        </button>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <div className="flex flex-col gap-0.5 mt-1.5">
                                                    <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                                                        <User size={14} className="text-gray-400 flex-shrink-0" />
                                                        <span className="truncate max-w-[180px]">
                                                            {hasName ? req.contact_name : formatted}
                                                        </span>
                                                        <button
                                                            onClick={() => { setEditingId(req.id); setTempName(req.contact_name || ''); }}
                                                            className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded flex-shrink-0"
                                                            title={hasName ? "Edit Customer Name" : "Assign Customer Name"}
                                                        >
                                                            <Edit2 size={13} />
                                                        </button>
                                                    </div>
                                                    {hasName && req.phone_number && (
                                                        <div className="flex items-center gap-1 text-xs text-gray-500 pl-5">
                                                            {Flag && <Flag title={formatted} className="w-3.5 h-2.5 rounded-sm shadow-xs flex-shrink-0" />}
                                                            <span className="truncate">{formatted}</span>
                                                        </div>
                                                    )}
                                                    {!hasName && isPhone && Flag && (
                                                        <div className="flex items-center gap-1 text-[11px] text-gray-400 pl-5">
                                                            <Flag title={formatted} className="w-3.5 h-2.5 rounded-sm shadow-xs flex-shrink-0" />
                                                            <span>Verified Contact</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })()}
                                    </div>
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${req.status === 'Completed' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {req.status || 'New Lead'}
                                    </div>
                                </div>

                                <div className="p-5 flex-1 grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                                    <div className="flex flex-col gap-1">
                                        <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><Calendar size={12} /> Year</span>
                                        <span className="text-gray-800 font-medium">{req.build_year || '-'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><DollarSign size={12} /> Budget</span>
                                        <span className="text-gray-800 font-medium">{req.budget || '-'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><Gauge size={12} /> Mileage</span>
                                        <span className="text-gray-800 font-medium">{req.max_mileage || '-'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><Settings size={12} /> Condition</span>
                                        <span className="text-gray-800 font-medium">{req.condition || '-'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><Droplet size={12} /> Fuel</span>
                                        <span className="text-gray-800 font-medium">{req.fuel_type || '-'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><Settings size={12} /> Trans.</span>
                                        <span className="text-gray-800 font-medium">{req.transmission || '-'}</span>
                                    </div>
                                    <div className="flex flex-col gap-1 col-span-2">
                                        <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><Palette size={12} /> Color</span>
                                        <span className="text-gray-800 font-medium">{req.preferred_color || '-'}</span>
                                    </div>
                                    {req.other_requirements && (
                                        <div className="flex flex-col gap-1 col-span-2 mt-2 pt-3 border-t border-gray-50">
                                            <span className="text-gray-400 text-xs font-semibold uppercase flex items-center gap-1"><FileText size={12} /> Notes</span>
                                            <span className="text-gray-700 italic">{req.other_requirements}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 border-t border-gray-50 bg-gray-50/50 flex justify-between items-center">
                                    <span className="text-xs text-gray-400 flex items-center gap-1">
                                        <Clock size={12} />
                                        {new Date(req.created_at).toLocaleDateString()}
                                    </span>
                                    {req.status !== 'Completed' ? (
                                        <button
                                            onClick={() => handleMarkCompleted(req.id)}
                                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center gap-2"
                                        >
                                            <CheckCircle size={16} />
                                            Mark Completed
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => handleDeleteRequest(req.id)}
                                            className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold rounded-xl transition-colors shadow-sm flex items-center gap-2 border border-red-100"
                                        >
                                            <Trash2 size={16} />
                                            Delete
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}
