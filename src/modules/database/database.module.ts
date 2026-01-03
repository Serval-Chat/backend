import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, IUser } from '@/models/User';
import { Ban } from '@/models/Ban';
import { Server, Category, Channel, ServerMember, Role, Invite, ServerMessage, ServerBan } from '@/models/Server';
import { Message } from '@/models/Message';
import { Friendship } from '@/models/Friendship';
import { Emoji } from '@/models/Emoji';
import { Webhook } from '@/models/Webhook';
import { ServerChannelRead } from '@/models/ServerChannelRead';
import { Ping } from '@/models/Ping';
import { Reaction } from '@/models/Reaction';
import { Warning } from '@/models/Warning';
import { AuditLog } from '@/models/AuditLog';
import { DmUnread } from '@/models/DmUnread';

@Global()
@Module({
    imports: [
        MongooseModule.forFeature([
            { name: 'User', schema: (User as any).schema },
            { name: 'Ban', schema: (Ban as any).schema },
            { name: 'Server', schema: (Server as any).schema },
            { name: 'Message', schema: (Message as any).schema },
            { name: 'Friendship', schema: (Friendship as any).schema },
            { name: 'Emoji', schema: (Emoji as any).schema },
            { name: 'Webhook', schema: (Webhook as any).schema },
            { name: 'ServerMember', schema: (ServerMember as any).schema },
            { name: 'Role', schema: (Role as any).schema },
            { name: 'Category', schema: (Category as any).schema },
            { name: 'Channel', schema: (Channel as any).schema },
            { name: 'ServerMessage', schema: (ServerMessage as any).schema },
            { name: 'Invite', schema: (Invite as any).schema },
            { name: 'ServerBan', schema: (ServerBan as any).schema },
            { name: 'ServerChannelRead', schema: (ServerChannelRead as any).schema },
            { name: 'Ping', schema: (Ping as any).schema },
            { name: 'Reaction', schema: (Reaction as any).schema },
            { name: 'Warning', schema: (Warning as any).schema },
            { name: 'AuditLog', schema: (AuditLog as any).schema },
            { name: 'DmUnread', schema: (DmUnread as any).schema },
        ]),
    ],
    exports: [MongooseModule],
})
export class DatabaseModule { }
