import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rxbjexoxyfownnwxzbjn.supabase.co'
const supabaseKey = 'sb_publishable_ikWflHuunjprfe1wrWcG6w_McBNUBpu'
const supabase = createClient(supabaseUrl, supabaseKey)

async function test() {
  const { data, error } = await supabase
    .from('agent_goku')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (error) console.error(error)
  else console.log(JSON.stringify(data, null, 2))
}

test()
