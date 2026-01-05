import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User } from '@/models/User';
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
            { name: 'User', schema: User.schema },
            { name: 'Ban', schema: Ban.schema },
            { name: 'Server', schema: Server.schema },
            { name: 'Message', schema: Message.schema },
            { name: 'Friendship', schema: Friendship.schema },
            { name: 'Emoji', schema: Emoji.schema },
            { name: 'Webhook', schema: Webhook.schema },
            { name: 'ServerMember', schema: ServerMember.schema },
            { name: 'Role', schema: Role.schema },
            { name: 'Category', schema: Category.schema },
            { name: 'Channel', schema: Channel.schema },
            { name: 'ServerMessage', schema: ServerMessage.schema },
            { name: 'Invite', schema: Invite.schema },
            { name: 'ServerBan', schema: ServerBan.schema },
            { name: 'ServerChannelRead', schema: ServerChannelRead.schema },
            { name: 'Ping', schema: Ping.schema },
            { name: 'Reaction', schema: Reaction.schema },
            { name: 'Warning', schema: Warning.schema },
            { name: 'AuditLog', schema: AuditLog.schema },
            { name: 'DmUnread', schema: DmUnread.schema },
        ]),
    ],
    exports: [MongooseModule],
})
export class DatabaseModule { }
