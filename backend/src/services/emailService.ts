import { env } from '../config/env';

export interface SendEmailOptions {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY || env.RESEND_API_KEY;
    const fromAddress = process.env.EMAIL_FROM || env.EMAIL_FROM || 'onboarding@resend.dev';

    if (!apiKey) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('Email sending is not configured in production environment.');
        }
        console.log(`[email] would send to <redacted> — subject: ${subject}`);
        return;
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: fromAddress,
                to,
                subject,
                html,
                text
            })
        });

        if (!res.ok) {
            throw new Error(`Email provider error: ${res.status}`);
        }
    } catch (error: any) {
        // Guard against any accidental API key leak in thrown messages
        const msg = error?.message || 'Unknown email error';
        const sanitizedMsg = apiKey ? msg.replace(apiKey, '[REDACTED]') : msg;
        throw new Error(`Failed to send email: ${sanitizedMsg}`);
    }
}
