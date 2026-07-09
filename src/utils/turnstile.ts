import { CF_TURNSTILE_SECRET } from '@/config/env';

export async function verifyTurnstile(
    token: string | undefined,
    ip: string,
): Promise<boolean> {
    if (!CF_TURNSTILE_SECRET) {
        return true;
    }
    if (token === undefined || token === '') return false;

    try {
        const formData = new URLSearchParams();
        formData.append('secret', CF_TURNSTILE_SECRET);
        formData.append('response', token);
        formData.append('remoteip', ip);

        const res = await fetch(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
                method: 'POST',
                body: formData,
            },
        );

        const data = (await res.json()) as { success: boolean };
        return data.success === true;
    } catch (err) {
        console.error('Turnstile verification failed', err);
        return false;
    }
}
