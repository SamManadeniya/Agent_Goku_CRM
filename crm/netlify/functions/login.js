import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { username, password } = body;

        if (!username || !password) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Username and password are required' }) };
        }

        // Initialize Supabase client
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        // Use Service Role Key in production for backend operations, fallback to Anon Key for now
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Fetch user from Supabase
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('username', username.toLowerCase())
            .single();

        if (error || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid username or password' }) };
        }

        // Compare password hash securely on the server
        const isValid = await bcrypt.compare(password, user.password_hash);
        if (!isValid) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid username or password' }) };
        }

        // Generate JWT
        const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            jwtSecret,
            { expiresIn: '8h' }
        );

        return {
            statusCode: 200,
            body: JSON.stringify({
                token,
                user: { id: user.id, username: user.username, role: user.role }
            })
        };
    } catch (err) {
        console.error('Login error:', err);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal error occurred' }) };
    }
};
