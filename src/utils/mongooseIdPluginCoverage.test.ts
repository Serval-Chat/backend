import mongoose from 'mongoose';
import { mongooseIdPlugin } from '@/utils/mongooseId';

import '@/models/AdminNote';
import '@/models/AuditLog';
import '@/models/Badge';
import '@/models/Ban';
import '@/models/BlockProfile';
import '@/models/Bot';
import '@/models/Decoration';
import '@/models/DmUnread';
import '@/models/Emoji';
import '@/models/ExportJob';
import '@/models/FavoriteGif';
import '@/models/Friendship';
import '@/models/GifTag';
import '@/models/KlipyCache';
import '@/models/Message';
import '@/models/Mute';
import '@/models/PasswordReset';
import '@/models/Ping';
import '@/models/PushSubscription';
import '@/models/Reaction';
import '@/models/Server';
import '@/models/ServerChannelRead';
import '@/models/SlashCommand';
import '@/models/Sticker';
import '@/models/TotpUsedCode';
import '@/models/User';
import '@/models/UserBlock';
import '@/models/UserConnection';
import '@/models/Warning';
import '@/models/Webhook';

describe('every registered Mongoose model carries mongooseIdPlugin', () => {
    const modelNames = mongoose.modelNames();

    it('found more than a handful of models, so the imports above are wired up', () => {
        expect(modelNames.length).toBeGreaterThan(20);
    });

    it.each(modelNames)('%s', (name) => {
        const plugins: Array<{ fn: unknown }> =
            mongoose.model(name).schema.plugins;
        expect(plugins.some((p) => p.fn === mongooseIdPlugin)).toBe(true);
    });
});
