import { z } from 'zod';
import {
    nameSchema,
    objectIdSchema,
    messageContentSchema,
    reasonSchema,
    optionalReasonSchema,
    colorHexSchema,
} from '@/validation/schemas/common';

export const serverIdParamSchema = z.object({
    serverId: objectIdSchema,
});

export const createServerSchema = z.object({
    name: nameSchema,
});

export const updateServerSchema = z.object({
    name: nameSchema.optional(),
    banner: z
        .object({
            type: z.enum(['image', 'color']),
            value: z.string(),
        })
        .optional(),
    disableCustomFonts: z.boolean().optional(),
    disableUsernameGlowAndCustomColor: z.boolean().optional(),
});

export const channelIdParamSchema = z.object({
    channelId: objectIdSchema,
});

export const serverChannelIdParamSchema = z.object({
    serverId: objectIdSchema,
    channelId: objectIdSchema,
});

export const createChannelSchema = z.object({
    name: nameSchema,
    type: z.enum(['text', 'voice']).default('text'),
    position: z.number().int().min(0).optional(),
    categoryId: objectIdSchema.optional(),
    description: z
        .string()
        .max(200, 'Description must be 200 characters or less')
        .optional(),
});

export const updateChannelSchema = z.object({
    name: nameSchema.optional(),
    position: z.number().int().min(0).optional(),
});

export const roleIdParamSchema = z.object({
    roleId: objectIdSchema,
});

export const createRoleSchema = z.object({
    name: nameSchema,
    color: colorHexSchema.optional(),
    startColor: colorHexSchema.optional(),
    endColor: colorHexSchema.optional(),
    colors: z
        .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
        .min(2)
        .max(10)
        .optional(),
    gradientRepeat: z.number().int().min(1).max(10).optional(),
    position: z.number().int().min(0).optional(),
    separateFromOtherRoles: z.boolean().optional(),
    permissions: z
        .object({
            sendMessages: z.boolean().optional(),
            manageMessages: z.boolean().optional(),
            deleteMessagesOfOthers: z.boolean().optional(),
            manageChannels: z.boolean().optional(),
            manageRoles: z.boolean().optional(),
            banMembers: z.boolean().optional(),
            kickMembers: z.boolean().optional(),
            manageInvites: z.boolean().optional(),
            manageServer: z.boolean().optional(),
            administrator: z.boolean().optional(),
            pingRolesAndEveryone: z.boolean().optional(),
            addReactions: z.boolean().optional(),
            manageReactions: z.boolean().optional(),
            seeDeletedMessages: z.boolean().optional(),
        })
        .optional(),
});

export const updateRoleSchema = z.object({
    name: nameSchema.optional(),
    color: colorHexSchema.optional(),
    startColor: colorHexSchema.optional(),
    endColor: colorHexSchema.optional(),
    colors: z
        .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
        .min(2)
        .max(10)
        .optional(),
    gradientRepeat: z.number().int().min(1).max(10).optional(),
    position: z.number().int().min(0).optional(),
    separateFromOtherRoles: z.boolean().optional(),
    permissions: z
        .object({
            sendMessages: z.boolean().optional(),
            manageMessages: z.boolean().optional(),
            deleteMessagesOfOthers: z.boolean().optional(),
            manageChannels: z.boolean().optional(),
            manageRoles: z.boolean().optional(),
            banMembers: z.boolean().optional(),
            kickMembers: z.boolean().optional(),
            manageInvites: z.boolean().optional(),
            manageServer: z.boolean().optional(),
            administrator: z.boolean().optional(),
            pingRolesAndEveryone: z.boolean().optional(),
            addReactions: z.boolean().optional(),
            manageReactions: z.boolean().optional(),
            seeDeletedMessages: z.boolean().optional(),
        })
        .optional(),
});

export const createInviteSchema = z.object({
    customPath: z.string().min(1).max(50).optional(),
    maxUses: z.number().int().min(0).optional(),
    expiresIn: z.number().int().min(0).optional(), // Changed from expiresAt to expiresIn to match frontend
});

export const joinServerSchema = z.object({
    inviteCode: z.string().min(1, 'Invite code is required'),
});

export const inviteCodeParamSchema = z.object({
    inviteCode: z.string(),
});

export const codeOrPathParamSchema = z.object({
    codeOrPath: z.string(),
});

export const kickMemberSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
    reason: optionalReasonSchema,
});

export const banMemberSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
    reason: reasonSchema,
    duration: z.number().int().min(0).optional(), // Duration in seconds, 0 or undefined = permanent
});

export const unbanMemberSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
});

export const memberIdParamSchema = z.object({
    memberId: z.string(),
});

export const updateMemberRolesSchema = z.object({
    roles: z.array(objectIdSchema),
});

export const serverMessageSchema = z.object({
    content: messageContentSchema,
    channelId: objectIdSchema,
});

export const serverMessageIdParamSchema = z.object({
    messageId: objectIdSchema,
});

export const editServerMessageSchema = z.object({
    content: messageContentSchema,
});

export const serverMessagesQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .transform((val) =>
            val !== undefined && val !== '' ? parseInt(val, 10) : 50,
        ),
    before: objectIdSchema.optional(),
    after: objectIdSchema.optional(),
    around: objectIdSchema.optional(),
});

export const serverMembersSearchQuerySchema = z.object({
    q: z.string().min(1, 'Search query is required'),
    limit: z
        .string()
        .optional()
        .transform((val) =>
            val !== undefined && val !== '' ? parseInt(val, 10) : 10,
        ),
});

export const transferOwnershipSchema = z.object({
    newOwnerId: objectIdSchema,
});

export const reorderRolesSchema = z.object({
    rolePositions: z.array(
        z.object({
            roleId: objectIdSchema,
            position: z.number().int().min(0),
        }),
    ),
});

export const userIdParamSchema = z.object({
    userId: objectIdSchema,
});

export const inviteIdParamSchema = z.object({
    inviteId: objectIdSchema,
});

export const serverInviteIdParamSchema = z.object({
    serverId: objectIdSchema,
    inviteId: objectIdSchema,
});

export const serverRoleIdParamSchema = z.object({
    serverId: objectIdSchema,
    roleId: objectIdSchema,
});

export const serverUserIdRoleIdParamSchema = z.object({
    serverId: objectIdSchema,
    userId: objectIdSchema,
    roleId: objectIdSchema,
});

export const messageIdParamSchema = z.object({
    messageId: objectIdSchema,
});

export const serverChannelMessageIdParamSchema = z.object({
    serverId: objectIdSchema,
    channelId: objectIdSchema,
    messageId: objectIdSchema,
});

export const categoryIdParamSchema = z.object({
    categoryId: objectIdSchema,
});

export const serverCategoryIdParamSchema = z.object({
    serverId: objectIdSchema,
    categoryId: objectIdSchema,
});

export const createCategorySchema = z.object({
    name: nameSchema,
    position: z.number().int().min(0).optional(),
});

export const updateCategorySchema = z.object({
    name: nameSchema.optional(),
    position: z.number().int().min(0).optional(),
});

export const reorderCategoriesSchema = z.object({
    categoryPositions: z.array(
        z.object({
            categoryId: objectIdSchema,
            position: z.number().int().min(0),
        }),
    ),
});

export const updateChannelCategorySchema = z.object({
    name: nameSchema.optional(),
    position: z.number().int().min(0).optional(),
    categoryId: objectIdSchema.optional().nullable(),
    icon: z.string().optional().nullable(),
    description: z
        .string()
        .max(200, 'Description must be 200 characters or less')
        .optional()
        .nullable(),
});

export type CreateServerRequest = z.infer<typeof createServerSchema>;
export type UpdateServerRequest = z.infer<typeof updateServerSchema>;
export type CreateChannelRequest = z.infer<typeof createChannelSchema>;
export type UpdateChannelRequest = z.infer<typeof updateChannelSchema>;
export type CreateCategoryRequest = z.infer<typeof createCategorySchema>;
export type UpdateCategoryRequest = z.infer<typeof updateCategorySchema>;
export type UpdateChannelCategoryRequest = z.infer<
    typeof updateChannelCategorySchema
>;
export type CreateRoleRequest = z.infer<typeof createRoleSchema>;
export type UpdateRoleRequest = z.infer<typeof updateRoleSchema>;
export type JoinServerRequest = z.infer<typeof joinServerSchema>;
export type KickMemberRequest = z.infer<typeof kickMemberSchema>;
export type BanMemberRequest = z.infer<typeof banMemberSchema>;
export type ServerMessageRequest = z.infer<typeof serverMessageSchema>;
