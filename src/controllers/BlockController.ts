import {
    Controller,
    Get,
    Post,
    Patch,
    Put,
    Delete,
    Body,
    Param,
    Req,
    UseGuards,
    Inject,
    HttpCode,
} from '@nestjs/common';
import { Types } from 'mongoose';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import type { Request } from 'express';
import { injectable } from 'inversify';
import { TYPES } from '@/di/types';
import { IBlockRepository } from '@/di/interfaces/IBlockRepository';
import {
    CreateBlockProfileRequestDTO,
    UpdateBlockProfileRequestDTO,
    UpsertBlockRelationshipRequestDTO,
} from './dto/block.request.dto';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import {
    BlockProfileResponseDTO,
    BlockRelationshipResponseDTO,
} from './dto/block.response.dto';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { ApiError } from '@/utils/ApiError';
import { JWTPayload } from '@/utils/jwt';

interface RequestWithUser extends Request {
    user: JWTPayload;
}

@ApiTags('Blocks')
@injectable()
@Controller('api/v1/blocks')
export class BlockController {
    constructor(
        @Inject(TYPES.BlockRepository)
        private blockRepo: IBlockRepository,
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
    ) {}

    @Get('profiles')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all block profiles for the current user' })
    @ApiResponse({ status: 200, type: [BlockProfileResponseDTO] })
    public async getProfiles(
        @Req() req: Request,
    ): Promise<BlockProfileResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const profiles = await this.blockRepo.findProfilesByOwner(
            new Types.ObjectId(userId),
        );
        return profiles.map((p) => ({
            id: p._id.toString(),
            name: p.name,
            flags: p.flags,
            createdAt: p.createdAt,
            updatedAt: p.updatedAt,
        }));
    }

    @Post('profiles')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Create a new block profile' })
    @ApiResponse({ status: 201, type: BlockProfileResponseDTO })
    @ApiResponse({ status: 403, description: 'Maximum profile limit reached' })
    public async createProfile(
        @Req() req: Request,
        @Body() body: CreateBlockProfileRequestDTO,
    ): Promise<BlockProfileResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const userOid = new Types.ObjectId(userId);

        const count = await this.blockRepo.countProfilesByOwner(userOid);
        if (count >= 4096) {
            throw new ApiError(409, 'Maximum of 4096 block profiles allowed');
        }

        const profile = await this.blockRepo.createProfile(
            userOid,
            body.name,
            body.flags,
        );
        return {
            id: profile._id.toString(),
            name: profile.name,
            flags: profile.flags,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }

    @Patch('profiles/:id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Update an existing block profile' })
    @ApiResponse({ status: 200, type: BlockProfileResponseDTO })
    @ApiResponse({ status: 404, description: 'Profile not found' })
    public async updateProfile(
        @Req() req: Request,
        @Param('id') id: string,
        @Body() body: UpdateBlockProfileRequestDTO,
    ): Promise<BlockProfileResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const profile = await this.blockRepo.updateProfile(
            new Types.ObjectId(id),
            new Types.ObjectId(userId),
            body,
        );

        if (!profile) {
            throw new ApiError(404, 'Block profile not found');
        }

        return {
            id: profile._id.toString(),
            name: profile.name,
            flags: profile.flags,
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt,
        };
    }

    @Delete('profiles/:id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Delete a block profile (cascade-deletes associated blocks)',
    })
    @ApiResponse({ status: 200, description: 'Profile deleted' })
    @ApiResponse({ status: 404, description: 'Profile not found' })
    public async deleteProfile(
        @Req() req: Request,
        @Param('id') id: string,
    ): Promise<{ message: string }> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const deleted = await this.blockRepo.deleteProfile(
            new Types.ObjectId(id),
            new Types.ObjectId(userId),
        );

        if (!deleted) {
            throw new ApiError(404, 'Block profile not found');
        }

        return { message: 'Profile deleted' };
    }

    @Get()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get all users blocked by the current user' })
    @ApiResponse({ status: 200, type: [BlockRelationshipResponseDTO] })
    public async getBlocks(
        @Req() req: Request,
    ): Promise<BlockRelationshipResponseDTO[]> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const blocks = await this.blockRepo.findBlocksByBlocker(
            new Types.ObjectId(userId),
        );
        return blocks.map((b) => ({
            targetUserId: b.targetId,
            targetUsername: b.targetUsername,
            profileId: b.profileId,
            flags: b.flags,
        }));
    }

    @Put(':targetUserId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Block a user or update their block profile' })
    @ApiResponse({ status: 200, type: BlockRelationshipResponseDTO })
    public async blockUser(
        @Req() req: Request,
        @Param('targetUserId') targetUserId: string,
        @Body() body: UpsertBlockRelationshipRequestDTO,
    ): Promise<BlockRelationshipResponseDTO> {
        const userId = (req as unknown as RequestWithUser).user.id;
        const blockerOid = new Types.ObjectId(userId);
        const targetOid = new Types.ObjectId(targetUserId);
        const profileOid = new Types.ObjectId(body.profileId);

        if (userId === targetUserId) {
            throw new ApiError(400, 'You cannot block yourself');
        }

        const profile = await this.blockRepo.findProfileById(profileOid);
        if (!profile || profile.ownerId.toString() !== userId) {
            throw new ApiError(400, 'Invalid block profile');
        }

        await this.blockRepo.upsertBlock(blockerOid, targetOid, profileOid);

        // automatically unfriend and clear requests when blocking.
        await Promise.all([
            this.friendshipRepo.remove(blockerOid, targetOid),
            this.friendshipRepo.removeRequestBetweenUsers(
                blockerOid,
                targetOid,
            ),
        ]);

        const targetUser = await this.userRepo.findById(targetOid);

        return {
            targetUserId,
            targetUsername: targetUser?.username || 'Unknown User',
            profileId: body.profileId,
            flags: profile.flags,
        };
    }

    @Delete(':targetUserId')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @HttpCode(204)
    @ApiOperation({ summary: 'Unblock a user' })
    @ApiResponse({ status: 204, description: 'User unblocked' })
    public async unblockUser(
        @Req() req: Request,
        @Param('targetUserId') targetUserId: string,
    ): Promise<void> {
        const userId = (req as unknown as RequestWithUser).user.id;
        await this.blockRepo.deleteBlock(
            new Types.ObjectId(userId),
            new Types.ObjectId(targetUserId),
        );
    }
}
