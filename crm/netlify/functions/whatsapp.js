import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';

export const handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    // Verify JWT
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';

    let user;
    try {
        user = jwt.verify(token, jwtSecret);
    } catch (err) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Forbidden' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { sessionId, message } = body;

        if (!sessionId || !message) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Session ID and message are required' }) };
        }

        const rawSessionId = String(sessionId).trim();
        const numericDigits = rawSessionId.replace(/\D/g, '');
        const isPhoneNumber = numericDigits.length >= 8 && numericDigits.length <= 15 && /^\+?\d+$/.test(rawSessionId);

        const payload = {
            type: 'ai',
            content: message,
            additional_kwargs: {
                is_staff: true,
                author: user.username,
                channel: isPhoneNumber ? 'whatsapp' : 'web_showroom'
            }
        };

        // Initialize Supabase client
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. Save to Supabase agent_goku (support both numeric and text session IDs)
        const formattedSessionId = /^\d+$/.test(rawSessionId) ? Number(rawSessionId) : rawSessionId;
        const { error: dbError } = await supabase.from('agent_goku').insert({
            session_id: formattedSessionId,
            message: payload
        });

        if (dbError) throw dbError;

        // 2. Send to WhatsApp API securely from backend ONLY if this is a WhatsApp phone session
        const whatsappToken = process.env.VITE_WHATSAPP_ACCESS_TOKEN;
        const phoneId = process.env.VITE_WHATSAPP_PHONE_NUMBER_ID;

        if (isPhoneNumber && whatsappToken && phoneId) {
            const cleanToNumber = numericDigits;
            const response = await fetch(`https://graph.facebook.com/v17.0/${phoneId}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${whatsappToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: cleanToNumber,
                    type: 'text',
                    text: { body: message }
                })
            });

            if (!response.ok) {
                const result = await response.json();
                console.error('WhatsApp API Error:', result);
                return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send WhatsApp message', details: result }) };
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                channel: isPhoneNumber ? 'whatsapp' : 'web_showroom'
            })
        };
    } catch (err) {
        console.error('Send message error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal error occurred: ' + err.message }) };
    }
};
