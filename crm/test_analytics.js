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

    console.log("Data length:", data ? data.length : 0);
    console.log("Error:", error);
}

test()
