export const handler = async (event, context) => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            url: process.env.VITE_SUPABASE_URL,
            key: process.env.VITE_SUPABASE_ANON_KEY
        })
    }
}
