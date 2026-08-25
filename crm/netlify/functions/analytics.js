import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Verify JWT
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';

    try {
        jwt.verify(token, jwtSecret);
    } catch (err) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    try {
        // Initialize Supabase client
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const { count: totalMessagesCount } = await supabase
            .from('agent_goku')
            .select('*', { count: 'exact', head: true });

        const { count: totalClientsCount } = await supabase
            .from('user')
            .select('*', { count: 'exact', head: true });

        const { data, error } = await supabase
            .from('agent_goku')
            .select('session_id, created_at')
            .gte('created_at', sevenDaysAgo.toISOString());

        if (error) throw error;

        const uniqueSessions = new Set();
        let activeTodayCount = 0;
        let onlineNowCount = 0;
        const today = new Date().toDateString();
        const now = new Date();
        const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60000);

        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            last7Days.push({
                date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                messages: 0
            });
        }

        const sessionLastActive = {};

        data.forEach(row => {
            const sessionId = String(row.session_id);
            uniqueSessions.add(sessionId);
            const date = new Date(row.created_at);
            if (date.toDateString() === today) activeTodayCount++;

            if (!sessionLastActive[sessionId] || date > sessionLastActive[sessionId]) {
                sessionLastActive[sessionId] = date;
            }

            const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const dayObj = last7Days.find(d => d.date === dateStr);
            if (dayObj) {
                dayObj.messages++;
            }
        });

        Object.values(sessionLastActive).forEach(lastActive => {
            if (lastActive > fifteenMinutesAgo) {
                onlineNowCount++;
            }
        });

        return {
            statusCode: 200,
            body: JSON.stringify({
                stats: {
                    totalChats: totalClientsCount || uniqueSessions.size,
                    totalMessages: totalMessagesCount || data.length,
                    activeToday: activeTodayCount,
                    onlineNow: onlineNowCount
                },
                chartData: last7Days
            })
        };
    } catch (err) {
        console.error('Analytics error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal error occurred' }) };
    }
};
