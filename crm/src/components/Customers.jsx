import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Users, Search, Phone, User, ShieldCheck, ShieldAlert, Star } from 'lucide-react'
import parsePhoneNumberFromString from 'libphonenumber-js'
import * as Flags from 'country-flag-icons/react/3x2'

export default function Customers() {
    const [customers, setCustomers] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [selectedCountryFilter, setSelectedCountryFilter] = useState('')

    useEffect(() => {
        fetchCustomers()

        const subscription = supabase
            .channel('public:user_customers')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'user'
            }, () => {
                fetchCustomers()
            })
            .subscribe()

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                fetchCustomers()
            }
        }

        const handleWindowFocus = () => {
            fetchCustomers()
        }

        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('focus', handleWindowFocus)

        // 15-second fallback heartbeat
        const interval = setInterval(() => {
            fetchCustomers()
        }, 15000)

        return () => {
            supabase.removeChannel(subscription)
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('focus', handleWindowFocus)
            clearInterval(interval)
        }
    }, [])

    const fetchCustomers = async () => {
        try {
            const { data, error } = await supabase
                .from('user')
                .select('*')
                .order('contact_name', { ascending: true })

            if (error) throw error

            // Process phone numbers to get country info
            const processedData = data.map(customer => {
                const phoneInfo = formatPhoneNumber(customer.mobile)
                return {
                    ...customer,
                    country: phoneInfo.country,
                    formattedPhone: phoneInfo.formatted,
                    Flag: phoneInfo.Flag
                }
            })

            // Sort by name, putting those without names at the end
            processedData.sort((a, b) => {
                if (a.contact_name && !b.contact_name) return -1;
                if (!a.contact_name && b.contact_name) return 1;
                if (a.contact_name && b.contact_name) {
                    return a.contact_name.localeCompare(b.contact_name);
                }
                return 0;
            });

            setCustomers(processedData)
        } catch (error) {
            console.error('Error fetching customers:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatPhoneNumber = (phoneStr) => {
        if (!phoneStr) return { formatted: '', country: null, Flag: null }
        try {
            const withPlus = phoneStr.startsWith('+') ? phoneStr : `+${phoneStr}`
            const phoneNumber = parsePhoneNumberFromString(withPlus)
            if (phoneNumber) {
                const country = phoneNumber.country
                const Flag = country ? Flags[country] : null
                return {
                    formatted: phoneNumber.formatInternational(),
                    country,
                    Flag
                }
            }
        } catch (e) {
            // ignore
        }
        return { formatted: phoneStr, country: null, Flag: null }
    }

    const uniqueCountries = Array.from(new Set(customers.map(c => c.country).filter(Boolean))).sort()

    const filteredCustomers = customers.filter(customer => {
        const searchLower = searchQuery.toLowerCase()
        const matchesSearch =
            (customer.contact_name?.toLowerCase().includes(searchLower)) ||
            (customer.mobile?.includes(searchLower)) ||
            (customer.formattedPhone?.includes(searchLower))

        const matchesCountry = selectedCountryFilter === '' || customer.country === selectedCountryFilter

        return matchesSearch && matchesCountry
    })

    return (
        <div className="flex flex-col h-full w-full bg-[#f8fafc] font-sans overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 p-4 md:p-6 shadow-sm z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
                        <Users className="text-blue-600" size={28} />
                        Customers
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">View and manage customer details.</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="relative w-full sm:w-64">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search name, phone..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 text-sm rounded-xl pl-10 pr-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                        />
                    </div>
                    <select
                        value={selectedCountryFilter}
                        onChange={e => setSelectedCountryFilter(e.target.value)}
                        className="w-full sm:w-auto bg-gray-50 border border-gray-200 text-sm rounded-xl px-4 py-2.5 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-gray-600 cursor-pointer"
                        title="Filter by Country"
                    >
                        <option value="">All Countries 🌍</option>
                        {uniqueCountries.map(country => (
                            <option key={country} value={country}>{country}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6">
                {loading ? (
                    <div className="flex items-center justify-center h-full text-gray-400">Loading customers...</div>
                ) : filteredCustomers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center">
                            <Users size={32} className="text-gray-300" />
                        </div>
                        <p className="text-lg font-medium">No customers found.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
                        {filteredCustomers.map((customer) => (
                            <div key={customer.mobile} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col transition-all hover:shadow-md">
                                <div className="p-5 flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm flex-shrink-0">
                                        <User size={24} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <h3 className="text-lg font-bold text-gray-800 tracking-tight truncate">
                                                {customer.contact_name || 'Unknown Customer'}
                                            </h3>
                                            {customer.is_favourite && <Star size={16} className="text-yellow-400 flex-shrink-0 drop-shadow-sm" fill="currentColor" />}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 text-sm text-gray-600 font-medium">
                                            {customer.Flag && <customer.Flag title={customer.country} className="w-5 h-3.5 rounded-sm shadow-sm" />}
                                            <span className="truncate">{customer.formattedPhone}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-5 py-3 border-t border-gray-50 bg-gray-50/50 flex justify-between items-center">
                                    <div className="flex items-center gap-1.5">
                                        {customer.agent_status ? (
                                            <><ShieldCheck size={14} className="text-green-500" /><span className="text-xs font-semibold text-green-600">AI Active</span></>
                                        ) : (
                                            <><ShieldAlert size={14} className="text-amber-500" /><span className="text-xs font-semibold text-amber-600">AI Paused</span></>
                                        )}
                                    </div>
                                    {customer.country && (
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider bg-white px-2 py-1 rounded-md border border-gray-100 shadow-sm">
                                            {customer.country}
                                        </span>
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
