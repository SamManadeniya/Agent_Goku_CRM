import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { MessageSquare, User, Clock, Search, Bot, Send, ShieldAlert, ShieldCheck, Edit2, Star, Check, X, Users, Plus, Tag, Settings, ChevronLeft } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import parsePhoneNumberFromString from 'libphonenumber-js'
import * as Flags from 'country-flag-icons/react/3x2'

export default function Inbox({ user }) {
    const [sessions, setSessions] = useState([])
    const [selectedSession, setSelectedSession] = useState(null)
    const [messages, setMessages] = useState([])
    const [loading, setLoading] = useState(true)
    const [inputText, setInputText] = useState('')
    const [isHumanMode, setIsHumanMode] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [unreadSessions, setUnreadSessions] = useState(new Set())
    const [editingName, setEditingName] = useState(false)
    const [tempName, setTempName] = useState('')
    const [groups, setGroups] = useState([])
    const [activeTab, setActiveTab] = useState('chats') // 'chats' or 'groups'
    const [selectedGroup, setSelectedGroup] = useState(null)
    const [isCreatingGroup, setIsCreatingGroup] = useState(false)
    const [newGroupName, setNewGroupName] = useState('')
    const [selectedMembers, setSelectedMembers] = useState(new Set())

    // Labels state
    const [labels, setLabels] = useState([])
    const [chatLabels, setChatLabels] = useState([])
    const [isManagingLabels, setIsManagingLabels] = useState(false)
    const [newLabelName, setNewLabelName] = useState('')
    const [newLabelColor, setNewLabelColor] = useState('#3B82F6')
    const [selectedLabelFilter, setSelectedLabelFilter] = useState(null)
    const [selectedCountryFilter, setSelectedCountryFilter] = useState(null)
    const [isAssigningLabel, setIsAssigningLabel] = useState(false)
    const [isChatOpenOnMobile, setIsChatOpenOnMobile] = useState(false)

    const messagesEndRef = useRef(null)
    const selectedSessionRef = useRef(selectedSession)

    useEffect(() => {
        selectedSessionRef.current = selectedSession
        if (selectedSession) {
            setUnreadSessions(prev => {
                const next = new Set(prev)
                next.delete(selectedSession)
                return next
            })
        }
    }, [selectedSession])

    useEffect(() => {
        fetchSessions()
        fetchGroups()
        fetchLabels()
        fetchChatLabels()

        const sidebarSubscription = supabase
            .channel('sidebar:agent_goku')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'agent_goku'
            }, payload => {
                const newMsg = payload.new;
                const sId = String(newMsg.session_id);
                setSessions(currentSessions => {
                    const exists = currentSessions.find(s => String(s.id) === sId);
                    if (exists) {
                        const filtered = currentSessions.filter(s => String(s.id) !== sId);
                        return [{ id: sId, lastActive: newMsg.created_at, contact_name: exists.contact_name, is_favourite: exists.is_favourite }, ...filtered];
                    } else {
                        return [{ id: sId, lastActive: newMsg.created_at }, ...currentSessions];
                    }
                });

                if (String(selectedSessionRef.current) !== sId) {
                    setUnreadSessions(prev => new Set(prev).add(sId));
                }
            })
            .subscribe()

        const globalUserSubscription = supabase
            .channel('global:user')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'user'
            }, payload => {
                setSessions(currentSessions => {
                    const updated = currentSessions.map(s => {
                        if (String(s.id) === String(payload.new.mobile)) {
                            return { ...s, contact_name: payload.new.contact_name, is_favourite: payload.new.is_favourite }
                        }
                        return s
                    })
                    updated.sort((a, b) => {
                        if (a.is_favourite && !b.is_favourite) return -1;
                        if (!a.is_favourite && b.is_favourite) return 1;
                        return new Date(b.lastActive) - new Date(a.lastActive);
                    });
                    return updated
                })
            })
            .subscribe()

        return () => {
            supabase.removeChannel(sidebarSubscription)
            supabase.removeChannel(globalUserSubscription)
        }
    }, [])

    useEffect(() => {
        if (selectedSession) {
            fetchMessages(selectedSession)
            fetchAgentStatus(selectedSession)

            const msgSubscription = supabase
                .channel('public:agent_goku')
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'agent_goku',
                    filter: `session_id=eq.${selectedSession}`
                }, payload => {
                    setMessages(current => [...current, payload.new])
                })
                .subscribe()

            const userSubscription = supabase
                .channel('public:user')
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'user',
                    filter: `mobile=eq.${selectedSession}`
                }, payload => {
                    // agent_status TRUE = AI, FALSE = Human
                    setIsHumanMode(payload.new.agent_status === false)
                })
                .subscribe()

            return () => {
                supabase.removeChannel(msgSubscription)
                supabase.removeChannel(userSubscription)
            }
        }
    }, [selectedSession])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    useEffect(() => {
        if (!selectedSession || messages.length === 0) return;

        const sessionData = sessions.find(s => s.id === selectedSession);
        if (sessionData && !sessionData.contact_name) {
            for (const msg of messages) {
                const parsed = parseMessageData(msg.message);
                if (parsed?.type === 'ai' && parsed?.content) {
                    const content = parsed.content;
                    const match = content.match(/(?:Hi|Hello|Hey)\s+([a-zA-Z]+(?: [a-zA-Z]+)?)/i);
                    if (match && match[1]) {
                        const extractedName = match[1];
                        supabase.from('user').select('id').eq('mobile', selectedSession).single()
                            .then(({ data }) => {
                                if (data) {
                                    supabase.from('user').update({ contact_name: extractedName }).eq('mobile', selectedSession).then();
                                } else {
                                    supabase.from('user').insert({ mobile: selectedSession, contact_name: extractedName, agent_status: true }).then();
                                }
                            });
                        break;
                    }
                }
            }
        }
    }, [messages, selectedSession, sessions]);

    async function fetchSessions() {
        try {
            const { data, error } = await supabase
                .from('agent_goku')
                .select('session_id, created_at')
                .order('created_at', { ascending: false })
                .limit(10000)

            if (error) throw error

            const uniqueSessions = []
            const seen = new Set()

            data.forEach(row => {
                const sId = String(row.session_id)
                if (!seen.has(sId)) {
                    seen.add(sId)
                    uniqueSessions.push({
                        id: sId,
                        lastActive: row.created_at
                    })
                }
            })

            const sessionIds = uniqueSessions.map(s => s.id)
            if (sessionIds.length > 0) {
                const { data: userData, error: userError } = await supabase
                    .from('user')
                    .select('mobile, contact_name, is_favourite')
                    .in('mobile', sessionIds)

                if (!userError && userData) {
                    const userMap = {}
                    userData.forEach(u => {
                        userMap[u.mobile] = u
                    })
                    uniqueSessions.forEach(s => {
                        s.contact_name = userMap[s.id]?.contact_name || null
                        s.is_favourite = userMap[s.id]?.is_favourite || false
                    })
                }
            }

            uniqueSessions.sort((a, b) => {
                if (a.is_favourite && !b.is_favourite) return -1;
                if (!a.is_favourite && b.is_favourite) return 1;
                return new Date(b.lastActive) - new Date(a.lastActive);
            });

            setSessions(uniqueSessions)
        } catch (error) {
            console.error('Error fetching sessions:', error)
        } finally {
            setLoading(false)
        }
    }

    const fetchGroups = async () => {
        try {
            const { data, error } = await supabase
                .from('groups')
                .select(`
                    id, name, created_at,
                    group_members ( session_id )
                `)
                .order('created_at', { ascending: false })
            if (error) throw error
            setGroups(data)
        } catch (err) {
            console.error('Error fetching groups:', err)
        }
    }

    const fetchLabels = async () => {
        try {
            const { data, error } = await supabase.from('labels').select('*').order('created_at', { ascending: true })
            if (error) throw error
            setLabels(data)
        } catch (err) {
            console.error('Error fetching labels:', err)
        }
    }

    const fetchChatLabels = async () => {
        try {
            const { data, error } = await supabase.from('chat_labels').select('*')
            if (error) throw error
            setChatLabels(data)
        } catch (err) {
            console.error('Error fetching chat labels:', err)
        }
    }

    async function fetchMessages(sessionId) {
        try {
            const { data, error } = await supabase
                .from('agent_goku')
                .select('*')
                .eq('session_id', sessionId)
                .order('created_at', { ascending: true })

            if (error) throw error
            setMessages(data)
        } catch (error) {
            console.error('Error fetching messages:', error)
        }
    }

    async function fetchAgentStatus(mobile) {
        try {
            const { data, error } = await supabase
                .from('user')
                .select('agent_status')
                .eq('mobile', mobile)
                .single()

            if (error) {
                if (error.code !== 'PGRST116') {
                    console.error('Error fetching agent status:', error)
                }
                setIsHumanMode(false) // Default to AI if user doesn't exist yet
            } else if (data) {
                setIsHumanMode(data.agent_status === false)
            }
        } catch (err) {
            console.error('Error in fetchAgentStatus:', err)
        }
    }

    const parseMessageData = (msgData) => {
        try {
            let parsed = msgData
            if (typeof msgData === 'string') parsed = JSON.parse(msgData)
            if (typeof parsed === 'string') parsed = JSON.parse(parsed)
            return parsed
        } catch (e) {
            return null
        }
    }

    const saveContactName = async () => {
        try {
            const { error } = await supabase
                .from('user')
                .update({ contact_name: tempName })
                .eq('mobile', selectedSession)
            if (error) throw error
            setEditingName(false)
        } catch (err) {
            console.error('Error saving contact name:', err)
        }
    }

    const toggleFavourite = async (mobile, currentStatus) => {
        try {
            const { error } = await supabase
                .from('user')
                .update({ is_favourite: !currentStatus })
                .eq('mobile', mobile)
            if (error) throw error
        } catch (err) {
            console.error('Error toggling favourite:', err)
        }
    }

    const handleCreateLabel = async () => {
        if (!newLabelName.trim()) return;
        try {
            const { error } = await supabase.from('labels').insert({ name: newLabelName, color: newLabelColor })
            if (error) throw error
            setNewLabelName('')
            fetchLabels()
        } catch (err) {
            console.error('Error creating label:', err)
        }
    }

    const handleDeleteLabel = async (id) => {
        try {
            const { error } = await supabase.from('labels').delete().eq('id', id)
            if (error) throw error
            fetchLabels()
            fetchChatLabels()
        } catch (err) {
            console.error('Error deleting label:', err)
        }
    }

    const toggleChatLabel = async (labelId) => {
        if (!selectedSession) return;
        const exists = chatLabels.find(cl => cl.label_id === labelId && cl.session_id === selectedSession)
        try {
            if (exists) {
                await supabase.from('chat_labels').delete().match({ label_id: labelId, session_id: selectedSession })
            } else {
                await supabase.from('chat_labels').insert({ label_id: labelId, session_id: selectedSession })
            }
            fetchChatLabels()
        } catch (err) {
            console.error('Error toggling chat label:', err)
        }
    }

    const formatPhoneNumber = (phoneStr) => {
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

    const handleTakeover = async () => {
        if (!selectedSession) return;
        const newAgentStatus = isHumanMode ? true : false; // Toggle status

        try {
            const { error } = await supabase
                .from('user')
                .update({ agent_status: newAgentStatus })
                .eq('mobile', selectedSession);

            if (error) throw error;

            // Optimistically update UI
            setIsHumanMode(!newAgentStatus);
        } catch (err) {
            console.error('Error toggling mode:', err);
            alert('Failed to update agent status.');
        }
    }

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || !selectedSession) return;

        // Move custom flags into additional_kwargs
        const payload = {
            type: 'ai',
            content: inputText,
            additional_kwargs: { is_staff: true, author: user.username }
        };
        const textToSend = inputText;

        try {
            // 1. Save to Supabase
            await supabase.from('agent_goku').insert({
                session_id: Number(selectedSession),
                message: payload
            });

            setInputText('');

            // 2. Send directly to WhatsApp API
            const token = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
            const phoneId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;

            if (token && phoneId) {
                const response = await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messaging_product: 'whatsapp',
                        recipient_type: 'individual',
                        to: selectedSession,
                        type: 'text',
                        text: { body: textToSend }
                    })
                });

                const result = await response.json();
                if (!response.ok) {
                    console.error('WhatsApp API Error:', result);
                    alert('Failed to send to WhatsApp. Check console for details.');
                }
            }
        } catch (err) {
            console.error('Error sending message:', err);
        }
    }

    const handleCreateGroup = async () => {
        if (!newGroupName.trim() || selectedMembers.size === 0) return;
        try {
            const { data: groupData, error: groupError } = await supabase
                .from('groups')
                .insert({ name: newGroupName })
                .select()
                .single()
            if (groupError) throw groupError

            const membersToInsert = Array.from(selectedMembers).map(sessionId => ({
                group_id: groupData.id,
                session_id: sessionId
            }))

            const { error: membersError } = await supabase
                .from('group_members')
                .insert(membersToInsert)

            if (membersError) throw membersError

            setNewGroupName('')
            setSelectedMembers(new Set())
            setIsCreatingGroup(false)
            fetchGroups()
        } catch (err) {
            console.error('Error creating group:', err)
            alert('Failed to create group.')
        }
    }

    const handleSendBroadcast = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || !selectedGroup) return;

        const textToSend = inputText;
        setInputText('');

        const members = selectedGroup.group_members.map(m => m.session_id);

        for (const memberId of members) {
            const payload = {
                type: 'ai',
                content: textToSend,
                additional_kwargs: { is_staff: true, author: user.username, is_broadcast: true }
            };

            try {
                await supabase.from('agent_goku').insert({
                    session_id: Number(memberId),
                    message: payload
                });

                const token = import.meta.env.VITE_WHATSAPP_ACCESS_TOKEN;
                const phoneId = import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID;

                if (token && phoneId) {
                    await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            messaging_product: 'whatsapp',
                            recipient_type: 'individual',
                            to: memberId,
                            type: 'text',
                            text: { body: textToSend }
                        })
                    });
                }
            } catch (err) {
                console.error(`Error broadcasting to ${memberId}:`, err);
            }
        }
        alert('Broadcast sent successfully!');
    }

    const formatMessage = (msgData, allMessages = []) => {
        const parsed = parseMessageData(msgData)

        if (!parsed) {
            return <div className="bg-gray-200 p-3 rounded-lg text-gray-800">{String(msgData)}</div>
        }

        const isSystem = parsed.type === 'system' || parsed?.additional_kwargs?.is_system;
        const isStaff = parsed.type === 'human_staff' || parsed?.additional_kwargs?.is_staff;
        const isAI = (parsed.type === 'ai' || parsed.type === 'tool') && !isSystem && !isStaff;

        if (isSystem) {
            return (
                <div className="flex justify-center my-4 w-full">
                    <div className="bg-gray-200 text-gray-600 text-xs px-4 py-1 rounded-full font-medium">
                        {parsed.content.replace('[SYSTEM] ', '')}
                    </div>
                </div>
            )
        }

        if (parsed.type === 'tool') {
            let images = [];
            let stockIdToFind = null;

            try {
                if (parsed.name === 'get_vehicle_photo') {
                    // Try to find the stock_id from the AI message that called this tool
                    // The AI message is usually the one right before this tool message
                    const aiMsg = allMessages.find(m => {
                        const p = parseMessageData(m.message);
                        return p?.type === 'ai' && p?.tool_calls?.some(tc => tc.name === 'get_vehicle_photo' && tc.id === parsed.tool_call_id);
                    });

                    if (aiMsg) {
                        const p = parseMessageData(aiMsg.message);
                        const tc = p.tool_calls.find(tc => tc.id === parsed.tool_call_id);
                        if (tc && tc.args && tc.args.input) {
                            const inputObj = JSON.parse(tc.args.input);
                            stockIdToFind = inputObj.stock_id;
                        }
                    }
                }

                if (stockIdToFind) {
                    // Look through all previous messages for a search_inventory tool response that has this stock_id
                    for (const m of allMessages) {
                        const p = parseMessageData(m.message);
                        if (p?.type === 'tool' && p?.name === 'search_inventory' && p?.content) {
                            const toolContent = JSON.parse(p.content);
                            if (Array.isArray(toolContent) && toolContent.length > 0 && toolContent[0].results) {
                                const car = toolContent[0].results.find(c => String(c['STOCK ID']) === String(stockIdToFind));
                                if (car && car.IMAGES) {
                                    images = car.IMAGES.split(',').map(url => url.trim()).filter(url => url);
                                    break;
                                }
                            }
                        }
                    }
                } else if (parsed.content) {
                    const toolContent = JSON.parse(parsed.content);
                    if (Array.isArray(toolContent) && toolContent.length > 0 && toolContent[0].results) {
                        toolContent[0].results.forEach(car => {
                            if (car.IMAGES) {
                                const carImages = car.IMAGES.split(',').map(url => url.trim()).filter(url => url);
                                images = [...images, ...carImages];
                            }
                        });
                    }
                }
            } catch (e) {
                // Ignore parse errors
            }

            return (
                <div className="bg-gray-100 p-3 rounded-lg text-sm text-gray-600 border border-gray-200 max-w-md">
                    <div className="flex items-center gap-2 font-semibold mb-1 text-blue-600">
                        <Search size={16} />
                        {parsed.name === 'get_vehicle_photo' ? 'Agent sent vehicle photos' : 'Agent searched inventory'}
                    </div>
                    <div className="truncate opacity-70 italic mb-2">
                        {parsed.name === 'get_vehicle_photo' && stockIdToFind ? `Stock ID: ${stockIdToFind}` : `Looking for: ${parsed.name}`}
                    </div>
                    {images.length > 0 && (
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {images.slice(0, 4).map((imgUrl, idx) => (
                                <img key={idx} src={imgUrl} alt="Car" className="w-full h-24 object-cover rounded-md border border-gray-200" />
                            ))}
                            {images.length > 4 && (
                                <div className="text-xs text-center text-gray-500 mt-1 col-span-2 font-medium">
                                    + {images.length - 4} more images found
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )
        }


        let displayContent = parsed.content || ''
        if (typeof displayContent === 'string') {
            let cleanContent = displayContent.trim()
            if (cleanContent.startsWith('```json')) {
                cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '')
            } else if (cleanContent.startsWith('```')) {
                cleanContent = cleanContent.replace(/^```\n?/, '').replace(/\n?```$/, '')
            }
            try {
                const contentObj = JSON.parse(cleanContent)
                if (contentObj.message) displayContent = contentObj.message
                else if (contentObj.response) displayContent = contentObj.response
                else if (contentObj.text) displayContent = contentObj.text
            } catch (e) { }
        }

        if (isAI) {
            return (
                <div className="bg-white border border-gray-200/60 text-gray-800 p-4 rounded-2xl rounded-tl-sm shadow-sm w-full transition-all hover:shadow-md">
                    <div className="flex items-center gap-2 mb-2 text-blue-600 font-bold text-xs tracking-wide uppercase">
                        <Bot size={14} /> Agent Goku
                    </div>
                    <div className="text-[15px] leading-relaxed prose prose-sm prose-blue max-w-none prose-p:my-1 prose-headings:my-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                    </div>
                </div>
            )
        } else if (isStaff) {
            return (
                <div className="bg-gradient-to-br from-blue-700 to-blue-800 text-white p-4 rounded-2xl rounded-tr-sm shadow-md w-full">
                    <div className="flex items-center gap-2 mb-1.5 text-blue-200 font-bold text-xs justify-end tracking-wide uppercase">
                        <User size={14} /> Staff ({parsed.author || 'Admin'})
                    </div>
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{displayContent}</div>
                </div>
            )
        } else {
            return (
                <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-2xl rounded-tr-sm shadow-md w-full">
                    <div className="text-[15px] leading-relaxed whitespace-pre-wrap">{displayContent}</div>
                </div>
            )
        }
    }

    const filteredSessions = sessions.filter(session => {
        const matchesSearch = String(session.id).toLowerCase().includes(searchQuery.toLowerCase()) ||
            (session.contact_name && session.contact_name.toLowerCase().includes(searchQuery.toLowerCase()))

        if (!matchesSearch) return false;

        if (selectedLabelFilter) {
            const hasLabel = chatLabels.some(cl => cl.session_id === session.id && cl.label_id === selectedLabelFilter)
            if (!hasLabel) return false;
        }

        if (selectedCountryFilter) {
            const { country } = formatPhoneNumber(session.id)
            if (country !== selectedCountryFilter) return false;
        }

        return true;
    })

    const uniqueCountries = Array.from(new Set(sessions.map(s => {
        const { country } = formatPhoneNumber(s.id)
        return country
    }).filter(Boolean))).sort()

    return (
        <div className="flex h-full w-full bg-[#f8fafc] font-sans">
            {/* Sidebar */}
            <div className={`bg-white border-r border-gray-100 flex-col shadow-[2px_0_8px_-4px_rgba(0,0,0,0.05)] z-10 ${isChatOpenOnMobile ? 'hidden md:flex md:w-80' : 'flex w-full md:w-80'}`}>
                <div className="p-5 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-20">
                    <div className="flex items-center justify-between mb-5">
                        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
                            Inbox
                        </h1>
                        <div className="flex bg-gray-100/80 p-1 rounded-lg border border-gray-200/50">
                            <button onClick={() => { setActiveTab('chats'); setSelectedGroup(null); }} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${activeTab === 'chats' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Chats</button>
                            <button onClick={() => { setActiveTab('groups'); setSelectedSession(null); }} className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${activeTab === 'groups' ? 'bg-white shadow-sm text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>Groups</button>
                        </div>
                    </div>
                    {activeTab === 'chats' && (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1 group">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    <input
                                        type="text"
                                        placeholder="Search clients..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full bg-gray-50/50 text-sm rounded-xl pl-9 pr-4 py-2.5 outline-none border border-gray-200/60 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all placeholder:text-gray-400"
                                    />
                                </div>
                                <select
                                    value={selectedCountryFilter || ''}
                                    onChange={e => setSelectedCountryFilter(e.target.value || null)}
                                    className="bg-gray-50/50 text-sm rounded-xl px-2 py-2.5 outline-none border border-gray-200/60 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-gray-600 cursor-pointer"
                                    title="Filter by Country"
                                >
                                    <option value="">All 🌍</option>
                                    {uniqueCountries.map(country => (
                                        <option key={country} value={country}>{country}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-1 px-1">
                                <button
                                    onClick={() => setSelectedLabelFilter(null)}
                                    className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${selectedLabelFilter === null ? 'bg-gray-800 text-white shadow-md shadow-gray-800/20' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/60'}`}
                                >
                                    All
                                </button>
                                {labels.map(label => (
                                    <button
                                        key={label.id}
                                        onClick={() => setSelectedLabelFilter(label.id)}
                                        className={`whitespace-nowrap px-3.5 py-1.5 text-xs font-semibold rounded-full transition-all duration-200 ${selectedLabelFilter === label.id ? 'shadow-md' : 'bg-gray-50 hover:bg-gray-100'}`}
                                        style={{
                                            backgroundColor: selectedLabelFilter === label.id ? label.color : undefined,
                                            color: selectedLabelFilter === label.id ? '#fff' : label.color,
                                            border: `1px solid ${selectedLabelFilter === label.id ? label.color : label.color + '40'}`,
                                            boxShadow: selectedLabelFilter === label.id ? `0 4px 12px -4px ${label.color}` : undefined
                                        }}
                                    >
                                        {label.name}
                                    </button>
                                ))}
                                <button
                                    onClick={() => setIsManagingLabels(true)}
                                    className="whitespace-nowrap p-1.5 text-xs font-medium rounded-full bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600 border border-gray-200/60 transition-colors"
                                >
                                    <Settings size={16} />
                                </button>
                            </div>
                        </div>
                    )}
                    {activeTab === 'groups' && (
                        <button onClick={() => setIsCreatingGroup(true)} className="w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-600 hover:bg-blue-100 py-2.5 rounded-xl text-sm font-semibold transition-colors border border-blue-100">
                            <Plus size={16} /> Create Group
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto">
                    {activeTab === 'chats' ? (
                        loading ? (
                            <div className="p-8 text-center text-gray-400">Loading sessions...</div>
                        ) : filteredSessions.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">No chats found.</div>
                        ) : (
                            filteredSessions.map((session) => (
                                <div
                                    key={session.id}
                                    onClick={() => { setSelectedSession(String(session.id)); setIsChatOpenOnMobile(true); }}
                                    className={`p-4 border-b border-gray-50 cursor-pointer transition-all duration-200 ${String(selectedSession) === String(session.id) ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                                        }`}
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className="relative">
                                            <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${String(selectedSession) === String(session.id) ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-gray-100 text-gray-500'}`}>
                                                <User size={20} />
                                            </div>
                                            {unreadSessions.has(session.id) && (
                                                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full shadow-sm"></div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            {(() => {
                                                const { formatted, Flag } = formatPhoneNumber(session.id)
                                                return (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h3 className={`font-semibold truncate text-[15px] flex items-center gap-2 ${unreadSessions.has(session.id) ? 'text-gray-900' : 'text-gray-800'}`}>
                                                            {Flag && <Flag title={formatted} className="w-4 h-3 rounded-sm shadow-sm" />}
                                                            {session.contact_name || formatted}
                                                        </h3>
                                                        {session.is_favourite && <Star size={14} className="text-yellow-400 flex-shrink-0 drop-shadow-sm" fill="currentColor" />}
                                                    </div>
                                                )
                                            })()}
                                            <p className={`text-xs flex items-center gap-1 mt-0.5 ${unreadSessions.has(session.id) ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
                                                <Clock size={12} />
                                                {new Date(session.lastActive).toLocaleDateString()}
                                            </p>
                                            <div className="flex gap-1.5 mt-2 flex-wrap">
                                                {chatLabels.filter(cl => cl.session_id === session.id).map(cl => {
                                                    const label = labels.find(l => l.id === cl.label_id)
                                                    if (!label) return null
                                                    return (
                                                        <span key={label.id} className="text-[10px] px-2 py-0.5 rounded-full font-semibold tracking-wide uppercase" style={{ backgroundColor: `${label.color}15`, color: label.color, border: `1px solid ${label.color}30` }}>
                                                            {label.name}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )
                    ) : (
                        loading ? (
                            <div className="p-8 text-center text-gray-400">Loading groups...</div>
                        ) : groups.length === 0 ? (
                            <div className="p-8 text-center text-gray-400">No groups found.</div>
                        ) : (
                            groups.map((group) => (
                                <div
                                    key={group.id}
                                    onClick={() => { setSelectedGroup(group); setIsChatOpenOnMobile(true); }}
                                    className={`p-4 border-b border-gray-50 cursor-pointer transition-all duration-200 ${selectedGroup?.id === group.id ? 'bg-blue-50/50 border-l-4 border-l-blue-600' : 'hover:bg-gray-50 border-l-4 border-l-transparent'
                                        }`}
                                >
                                    <div className="flex items-center gap-3.5">
                                        <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${selectedGroup?.id === group.id ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20' : 'bg-gray-100 text-gray-500'}`}>
                                            <Users size={20} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-800 truncate text-[15px]">
                                                {group.name}
                                            </h3>
                                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                {group.group_members.length} members
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`flex-1 flex-col bg-[#f0f2f5] relative overflow-hidden ${!isChatOpenOnMobile ? 'hidden md:flex' : 'flex'}`}>
                {activeTab === 'chats' && selectedSession ? (
                    <>
                        <div className="px-6 py-4 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm flex items-center justify-between z-20 absolute top-0 left-0 right-0">
                            <div className="flex items-center gap-4">
                                <button onClick={() => { setIsChatOpenOnMobile(false); setSelectedSession(null); }} className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                    <ChevronLeft size={24} />
                                </button>
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
                                    <User size={24} />
                                </div>
                                <div>
                                    {(() => {
                                        const sessionData = sessions.find(s => s.id === selectedSession)
                                        const { formatted, Flag } = formatPhoneNumber(selectedSession)

                                        if (editingName) {
                                            return (
                                                <div className="flex items-center gap-2 mb-1">
                                                    <input
                                                        type="text"
                                                        value={tempName}
                                                        onChange={e => setTempName(e.target.value)}
                                                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                                                        autoFocus
                                                    />
                                                    <button onClick={saveContactName} className="text-green-600 hover:bg-green-50 p-1.5 rounded-md transition-colors"><Check size={16} /></button>
                                                    <button onClick={() => setEditingName(false)} className="text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors"><X size={16} /></button>
                                                </div>
                                            )
                                        }

                                        return (
                                            <div className="flex items-center gap-2 mb-0.5">
                                                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2 tracking-tight">
                                                    {Flag && <Flag title={formatted} className="w-6 h-4 rounded-sm shadow-sm" />}
                                                    {sessionData?.contact_name || formatted}
                                                </h2>
                                                <button onClick={() => { setTempName(sessionData?.contact_name || ''); setEditingName(true); }} className="text-gray-400 hover:text-blue-600 transition-colors">
                                                    <Edit2 size={14} />
                                                </button>
                                                <button onClick={() => toggleFavourite(selectedSession, sessionData?.is_favourite)} className={`transition-colors ${sessionData?.is_favourite ? 'text-yellow-400 drop-shadow-sm' : 'text-gray-300 hover:text-yellow-400'}`}>
                                                    <Star size={18} fill={sessionData?.is_favourite ? "currentColor" : "none"} />
                                                </button>
                                                <div className="relative">
                                                    <button onClick={() => setIsAssigningLabel(!isAssigningLabel)} className="text-gray-400 hover:text-blue-600 transition-colors ml-1">
                                                        <Tag size={16} />
                                                    </button>
                                                    {isAssigningLabel && (
                                                        <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 z-50">
                                                            <div className="px-4 pb-2 mb-2 border-b border-gray-50 text-xs font-bold text-gray-400 uppercase tracking-wider">Assign Labels</div>
                                                            {labels.length === 0 ? (
                                                                <div className="px-4 py-3 text-sm text-gray-400 text-center">No labels created yet.</div>
                                                            ) : labels.map(label => {
                                                                const isAssigned = chatLabels.some(cl => cl.session_id === selectedSession && cl.label_id === label.id)
                                                                return (
                                                                    <button
                                                                        key={label.id}
                                                                        onClick={() => toggleChatLabel(label.id)}
                                                                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-3 transition-colors"
                                                                    >
                                                                        <div className="w-3.5 h-3.5 rounded-full shadow-sm" style={{ backgroundColor: label.color }}></div>
                                                                        <span className="flex-1 font-medium text-gray-700 truncate">{label.name}</span>
                                                                        {isAssigned && <Check size={16} className="text-blue-600" />}
                                                                    </button>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })()}
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                        <p className="text-xs text-green-600 font-semibold">Online</p>
                                    </div>
                                </div>
                            </div>

                            {/* Takeover Button */}
                            <button
                                onClick={handleTakeover}
                                className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 shadow-sm ${isHumanMode ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 hover:shadow-amber-200/50' : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-blue-600/30'}`}
                            >
                                {isHumanMode ? (
                                    <><ShieldCheck size={18} /> Resume AI</>
                                ) : (
                                    <><ShieldAlert size={18} /> Take Over Chat</>
                                )}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32 pt-28 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
                            {messages.map((msg) => {
                                const parsed = parseMessageData(msg.message)
                                const isSystem = parsed?.type === 'system'
                                const isAI = parsed?.type === 'ai' || parsed?.type === 'tool'

                                if (isSystem) {
                                    return <div key={msg.id}>{formatMessage(msg.message, messages)}</div>
                                }

                                return (
                                    <div key={msg.id} className={`flex flex-col ${isAI ? 'items-start' : 'items-end'}`}>
                                        <div className="max-w-[85%]">
                                            {formatMessage(msg.message, messages)}
                                            <div className={`text-[10px] text-gray-400 mt-1 ${isAI ? 'text-left ml-1' : 'text-right mr-1'}`}>
                                                {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Chat Input Area */}
                        {isHumanMode && (
                            <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-20">
                                <form onSubmit={handleSendMessage} className="flex items-center gap-3 max-w-4xl mx-auto">
                                    <input
                                        type="text"
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        placeholder="Type a message to the client..."
                                        className="flex-1 bg-gray-100 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl px-6 py-3.5 outline-none transition-all shadow-inner"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!inputText.trim()}
                                        className="w-14 h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-0.5 active:translate-y-0"
                                    >
                                        <Send size={22} className="ml-1" />
                                    </button>
                                </form>
                            </div>
                        )}
                    </>
                ) : activeTab === 'groups' && selectedGroup ? (
                    <>
                        <div className="px-6 py-4 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm flex items-center justify-between z-20 absolute top-0 left-0 right-0">
                            <div className="flex items-center gap-4">
                                <button onClick={() => { setIsChatOpenOnMobile(false); setSelectedGroup(null); }} className="md:hidden p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors">
                                    <ChevronLeft size={24} />
                                </button>
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-blue-600 shadow-sm">
                                    <Users size={24} />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-800 tracking-tight">
                                        {selectedGroup.name}
                                    </h2>
                                    <p className="text-sm text-gray-500 font-medium">{selectedGroup.group_members.length} members</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32 pt-28 flex flex-col items-center justify-center text-center bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] bg-fixed">
                            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-6 text-blue-500 shadow-inner">
                                <Send size={40} />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-800 tracking-tight">Broadcast Message</h3>
                            <p className="text-gray-500 max-w-md mt-3 text-lg leading-relaxed">
                                Send a message to all <span className="font-bold text-gray-700">{selectedGroup.group_members.length}</span> members of the "{selectedGroup.name}" group at once.
                            </p>
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200 p-4 shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] z-20">
                            <form onSubmit={handleSendBroadcast} className="flex items-center gap-3 max-w-4xl mx-auto">
                                <input
                                    type="text"
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    placeholder="Type a broadcast message..."
                                    className="flex-1 bg-gray-100 border border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-2xl px-6 py-3.5 outline-none transition-all shadow-inner"
                                />
                                <button
                                    type="submit"
                                    disabled={!inputText.trim()}
                                    className="w-14 h-14 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-0.5 active:translate-y-0"
                                >
                                    <Send size={22} className="ml-1" />
                                </button>
                            </form>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-6 bg-gray-50/50">
                        <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mb-2 shadow-sm border border-gray-100">
                            {activeTab === 'chats' ? <MessageSquare size={48} className="text-blue-200" /> : <Users size={48} className="text-blue-200" />}
                        </div>
                        <p className="text-xl font-medium text-gray-500 tracking-tight">
                            {activeTab === 'chats' ? 'Select a client to view their chat' : 'Select a group to broadcast a message'}
                        </p>
                    </div>
                )}
            </div>

            {/* Create Group Modal */}
            {isCreatingGroup && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-800">Create New Group</h2>
                            <button onClick={() => setIsCreatingGroup(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-5 flex-1 overflow-y-auto">
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Group Name</label>
                                <input
                                    type="text"
                                    value={newGroupName}
                                    onChange={e => setNewGroupName(e.target.value)}
                                    placeholder="e.g. VIP Clients"
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Select Members ({selectedMembers.size})</label>
                                <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-100 rounded-lg p-2">
                                    {sessions.map(session => (
                                        <label key={session.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedMembers.has(session.id)}
                                                onChange={(e) => {
                                                    const next = new Set(selectedMembers)
                                                    if (e.target.checked) next.add(session.id)
                                                    else next.delete(session.id)
                                                    setSelectedMembers(next)
                                                }}
                                                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">{session.contact_name || formatPhoneNumber(session.id).formatted}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-xl">
                            <button onClick={() => setIsCreatingGroup(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                            <button onClick={handleCreateGroup} disabled={!newGroupName.trim() || selectedMembers.size === 0} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors">Create Group</button>
                        </div>
                    </div>
                </div>
            )}
            {/* Manage Labels Modal */}
            {isManagingLabels && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-800">Manage Labels</h2>
                            <button onClick={() => setIsManagingLabels(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                        </div>
                        <div className="p-5 flex-1 overflow-y-auto">
                            <div className="mb-6 flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">New Label Name</label>
                                    <input
                                        type="text"
                                        value={newLabelName}
                                        onChange={e => setNewLabelName(e.target.value)}
                                        placeholder="e.g. VIP"
                                        className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                                    <input
                                        type="color"
                                        value={newLabelColor}
                                        onChange={e => setNewLabelColor(e.target.value)}
                                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                                    />
                                </div>
                                <button onClick={handleCreateLabel} disabled={!newLabelName.trim()} className="h-10 px-4 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition-colors">Add</button>
                            </div>

                            <div>
                                <h3 className="text-sm font-medium text-gray-700 mb-3">Existing Labels</h3>
                                <div className="space-y-2">
                                    {labels.length === 0 ? (
                                        <p className="text-sm text-gray-400">No labels created yet.</p>
                                    ) : labels.map(label => (
                                        <div key={label.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: label.color }}></div>
                                                <span className="font-medium text-gray-800">{label.name}</span>
                                            </div>
                                            <button onClick={() => handleDeleteLabel(label.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
