import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rxbjexoxyfownnwxzbjn.supabase.co'
const supabaseKey = 'sb_publishable_ikWflHuunjprfe1wrWcG6w_McBNUBpu'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase
        .from('agent_goku')
        .select('session_id, created_at')
        .gte('created_at', sevenDaysAgo.toISOString());

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

    console.log(JSON.stringify({
        stats: {
            totalChats: uniqueSessions.size,
            totalMessages: data.length,
            activeToday: activeTodayCount,
            onlineNow: onlineNowCount
        },
        chartData: last7Days
    }, null, 2));
}

test()
