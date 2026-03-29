import { injectable } from 'inversify';
import { AccessToken } from 'livekit-server-sdk';
import { ApiError } from '@/utils/ApiError';

@injectable()
export class LiveKitService {
    public async generateToken(
        roomName: string,
        participantIdentity: string,
        participantName: string,
    ): Promise<{ token: string; url: string }> {
        const apiKey = process.env.LIVEKIT_API_KEY;
        const apiSecret = process.env.LIVEKIT_API_SECRET;
        const wsUrl = process.env.LIVEKIT_URL;

        if (!apiKey || !apiSecret || !wsUrl) {
            throw new ApiError(
                500,
                'LiveKit credentials are not properly configured.',
            );
        }

        const at = new AccessToken(apiKey, apiSecret, {
            identity: participantIdentity,
            name: participantName,
        });

        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
        });

        const token = await at.toJwt();

        return {
            token,
            url: wsUrl,
        };
    }
}
