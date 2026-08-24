import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rxbjexoxyfownnwxzbjn.supabase.co'
const supabaseKey = 'sb_publishable_ikWflHuunjprfe1wrWcG6w_McBNUBpu'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
    const { data, error } = await supabase.from('users').select('*')
    console.log("Users:", data)
    console.log("Error:", error)
}

test()
