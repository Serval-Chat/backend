import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param as Path,
    UseGuards,
    Inject,
    NotFoundException,
    ConflictException,
    HttpCode,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import type { IUserRepository } from '@/di/interfaces/IUserRepository';
import { Badge } from '@/models/Badge';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Permissions } from '@/modules/auth/permissions.decorator';
import { NoBot } from '@/modules/auth/bot.decorator';
import {
    CreateBadgeRequestDTO,
    UpdateBadgeRequestDTO,
    BadgeResponseDTO,
} from './dto/admin-badges.dto';
import mongoose from 'mongoose';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@NoBot()
@Controller('api/v1/admin')
export class AdminBadgeController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
    ) {}

    @Get('badges')
    @Permissions('manageBadges')
    @ApiOperation({ summary: 'Retrieve all available badges' })
    @ApiResponse({ status: 200, type: [BadgeResponseDTO] })
    public async getBadges(): Promise<BadgeResponseDTO[]> {
        const badges = await Badge.find().sort({ createdAt: 1 }).lean();
        return badges as BadgeResponseDTO[];
    }

    @Post('badges')
    @Permissions('manageBadges')
    @ApiOperation({ summary: 'Create a new badge' })
    @ApiResponse({ status: 201, type: BadgeResponseDTO })
    @ApiResponse({ status: 409, description: 'Badge ID already exists' })
    public async createBadge(
        @Body() data: CreateBadgeRequestDTO,
    ): Promise<BadgeResponseDTO> {
        const existingBadge = await Badge.findOne({ id: data.id });
        if (existingBadge) {
            throw new ConflictException('Badge ID already exists');
        }

        const badge = new Badge({
            ...data,
            color: data.color ?? '#3b82f6',
        });

        await badge.save();
        return badge.toObject() as BadgeResponseDTO;
    }

    @Put('badges/:badgeId')
    @Permissions('manageBadges')
    @ApiOperation({ summary: 'Update a badge' })
    @ApiResponse({ status: 200, type: BadgeResponseDTO })
    @ApiResponse({ status: 404, description: 'Badge not found' })
    public async updateBadge(
        @Path('badgeId') badgeId: string,
        @Body() data: UpdateBadgeRequestDTO,
    ): Promise<BadgeResponseDTO> {
        const badge = await Badge.findOne({ id: badgeId });
        if (!badge) {
            throw new NotFoundException('Badge not found');
        }

        if (data.name !== undefined) badge.name = data.name;
        if (data.description !== undefined)
            badge.description = data.description;
        if (data.icon !== undefined) badge.icon = data.icon;
        if (data.color !== undefined) badge.color = data.color;

        await badge.save();
        return badge.toObject() as BadgeResponseDTO;
    }

    @Delete('badges/:badgeId')
    @Permissions('manageBadges')
    @HttpCode(200)
    @ApiOperation({ summary: 'Delete a badge' })
    @ApiResponse({ status: 200, description: 'Badge deleted successfully' })
    @ApiResponse({ status: 404, description: 'Badge not found' })
    public async deleteBadge(
        @Path('badgeId') badgeId: string,
    ): Promise<{ message: string }> {
        const badge = await Badge.findOne({ id: badgeId });
        if (!badge) {
            throw new NotFoundException('Badge not found');
        }

        await Badge.deleteOne({ id: badgeId });
        await this.userRepo.removeBadgeFromAllUsers(badgeId);

        return { message: 'Badge deleted successfully' };
    }

    @Get('users/:userId/badges')
    @Permissions('manageBadges')
    @ApiOperation({ summary: "Get user's badges" })
    @ApiResponse({ status: 200, type: [BadgeResponseDTO] })
    @ApiResponse({ status: 404, description: 'User not found' })
    public async getUserBadges(
        @Path('userId') userId: string,
    ): Promise<BadgeResponseDTO[]> {
        const user = await this.userRepo.findById(
            new mongoose.Types.ObjectId(userId),
        );
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const badgeIds = user.badges || [];
        const badges = await Badge.find({ id: { $in: badgeIds } }).lean();
        return badges as BadgeResponseDTO[];
    }

    @Post('users/:userId/badges')
    @Permissions('manageBadges')
    @ApiOperation({ summary: 'Add badge to user' })
    @ApiResponse({ status: 200, description: 'Badge added successfully' })
    @ApiResponse({ status: 404, description: 'User or Badge not found' })
    @ApiResponse({ status: 409, description: 'User already has this badge' })
    public async addBadgeToUser(
        @Path('userId') userId: string,
        @Body('badgeId') badgeId: string,
    ): Promise<{ message: string; badges: string[] }> {
        const user = await this.userRepo.findById(
            new mongoose.Types.ObjectId(userId),
        );
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const badge = await Badge.findOne({ id: badgeId });
        if (!badge) {
            throw new NotFoundException('Badge not found');
        }

        const badges = user.badges || [];
        if (badges.includes(badgeId)) {
            throw new ConflictException('User already has this badge');
        }

        badges.push(badgeId);
        await this.userRepo.update(user._id, { badges });

        return { message: 'Badge added successfully', badges };
    }

    @Delete('users/:userId/badges/:badgeId')
    @Permissions('manageBadges')
    @ApiOperation({ summary: 'Remove badge from user' })
    @ApiResponse({ status: 200, description: 'Badge removed successfully' })
    @ApiResponse({
        status: 404,
        description: 'User not found or badge not assigned',
    })
    public async removeBadgeFromUser(
        @Path('userId') userId: string,
        @Path('badgeId') badgeId: string,
    ): Promise<{ message: string; badges: string[] }> {
        const user = await this.userRepo.findById(
            new mongoose.Types.ObjectId(userId),
        );
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const badges = user.badges || [];
        const index = badges.indexOf(badgeId);
        if (index === -1) {
            throw new NotFoundException('User does not have this badge');
        }

        badges.splice(index, 1);
        await this.userRepo.update(user._id, { badges });

        return { message: 'Badge removed successfully', badges };
    }
}
