import { z } from 'zod';
import {
    nameSchema,
    objectIdSchema,
    messageContentSchema,
    reasonSchema,
    optionalReasonSchema,
    colorHexSchema,
} from '@/validation/schemas/common';

// Server ID parameter validation
export const serverIdParamSchema = z.object({
    serverId: objectIdSchema,
});

// Create server validation
export const createServerSchema = z.object({
    name: nameSchema,
});

// Update server validation
export const updateServerSchema = z.object({
    name: nameSchema.optional(),
    banner: z
        .object({
            type: z.enum(['image', 'color']),
            value: z.string(),
        })
        .optional(),
    disableCustomFonts: z.boolean().optional(),
});

// Channel ID parameter validation
export const channelIdParamSchema = z.object({
    channelId: objectIdSchema,
});

// Server and channel ID parameter validation
export const serverChannelIdParamSchema = z.object({
    serverId: objectIdSchema,
    channelId: objectIdSchema,
});

// Create channel validation
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

// Update channel validation
export const updateChannelSchema = z.object({
    name: nameSchema.optional(),
    position: z.number().int().min(0).optional(),
});

// Role ID parameter validation
export const roleIdParamSchema = z.object({
    roleId: objectIdSchema,
});

// Create role validation
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
        })
        .optional(),
});

// Update role validation
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
        })
        .optional(),
});

// Create invite validation
export const createInviteSchema = z.object({
    customPath: z.string().min(1).max(50).optional(),
    maxUses: z.number().int().min(0).optional(),
    expiresIn: z.number().int().min(0).optional(), // Changed from expiresAt to expiresIn to match frontend
});

// Join server validation
export const joinServerSchema = z.object({
    inviteCode: z.string().min(1, 'Invite code is required'),
});

// Invite code parameter validation
export const inviteCodeParamSchema = z.object({
    inviteCode: z.string(),
});

// Code or path parameter validation (for join routes)
export const codeOrPathParamSchema = z.object({
    codeOrPath: z.string(),
});

// Kick member validation
export const kickMemberSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
    reason: optionalReasonSchema,
});

// Ban member validation
export const banMemberSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
    reason: reasonSchema,
    duration: z.number().int().min(0).optional(), // Duration in seconds, 0 or undefined = permanent
});

// Unban member validation
export const unbanMemberSchema = z.object({
    userId: z.string().min(1, 'User ID is required'),
});

// Member ID parameter validation
export const memberIdParamSchema = z.object({
    memberId: z.string(),
});

// Update member roles validation
export const updateMemberRolesSchema = z.object({
    roles: z.array(objectIdSchema),
});

// Server message validation
export const serverMessageSchema = z.object({
    content: messageContentSchema,
    channelId: objectIdSchema,
});

// Server message ID parameter validation
export const serverMessageIdParamSchema = z.object({
    messageId: objectIdSchema,
});

// Edit server message validation
export const editServerMessageSchema = z.object({
    content: messageContentSchema,
});

// Query parameters for server messages
export const serverMessagesQuerySchema = z.object({
    limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 50)),
    before: objectIdSchema.optional(),
    after: objectIdSchema.optional(),
    around: objectIdSchema.optional(),
});

// Query parameters for server member search
export const serverMembersSearchQuerySchema = z.object({
    q: z.string().min(1, 'Search query is required'),
    limit: z
        .string()
        .optional()
        .transform((val) => (val ? parseInt(val, 10) : 10)),
});

// Transfer ownership validation
export const transferOwnershipSchema = z.object({
    newOwnerId: objectIdSchema,
});

// Reorder roles validation
export const reorderRolesSchema = z.object({
    rolePositions: z.array(
        z.object({
            roleId: objectIdSchema,
            position: z.number().int().min(0),
        }),
    ),
});

// User ID parameter validation
export const userIdParamSchema = z.object({
    userId: objectIdSchema,
});

// Invite ID parameter validation
export const inviteIdParamSchema = z.object({
    inviteId: objectIdSchema,
});

// Server ID and invite ID parameter validation
export const serverInviteIdParamSchema = z.object({
    serverId: objectIdSchema,
    inviteId: objectIdSchema,
});

// Server and role ID parameter validation
export const serverRoleIdParamSchema = z.object({
    serverId: objectIdSchema,
    roleId: objectIdSchema,
});

// Server ID, user ID, and role ID parameter validation
export const serverUserIdRoleIdParamSchema = z.object({
    serverId: objectIdSchema,
    userId: objectIdSchema,
    roleId: objectIdSchema,
});

// Message ID parameter validation
export const messageIdParamSchema = z.object({
    messageId: objectIdSchema,
});

// Server, channel, and message ID parameter validation
export const serverChannelMessageIdParamSchema = z.object({
    serverId: objectIdSchema,
    channelId: objectIdSchema,
    messageId: objectIdSchema,
});

// Category ID parameter validation
export const categoryIdParamSchema = z.object({
    categoryId: objectIdSchema,
});

// Server and category ID parameter validation
export const serverCategoryIdParamSchema = z.object({
    serverId: objectIdSchema,
    categoryId: objectIdSchema,
});

// Create category validation
export const createCategorySchema = z.object({
    name: nameSchema,
    position: z.number().int().min(0).optional(),
});

// Update category validation
export const updateCategorySchema = z.object({
    name: nameSchema.optional(),
    position: z.number().int().min(0).optional(),
});

// Reorder categories validation
export const reorderCategoriesSchema = z.object({
    categoryPositions: z.array(
        z.object({
            categoryId: objectIdSchema,
            position: z.number().int().min(0),
        }),
    ),
});

// Update channel with category validation
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
