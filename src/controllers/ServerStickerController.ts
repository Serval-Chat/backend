import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Body,
    Req,
    Inject,
    NotFoundException,
    ForbiddenException,
    ConflictException,
    InternalServerErrorException,
    HttpCode,
    HttpException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiBearerAuth,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { TYPES } from '@/di/types';
import { WsServer } from '@/ws/server';
import { injectable } from 'inversify';
import type { IStickerRepository } from '@/di/interfaces/IStickerRepository';
import type { IServerRepository } from '@/di/interfaces/IServerRepository';
import type { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { PermissionService } from '@/permissions/PermissionService';
import type { ILogger } from '@/di/interfaces/ILogger';
import type { IServerAuditLogService } from '@/di/interfaces/IServerAuditLogService';

import type { Request as ExpressRequest } from 'express';
import { JWTPayload } from '@/utils/jwt';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { ErrorMessages } from '@/constants/errorMessages';
import { ApiError } from '@/utils/ApiError';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { storage } from '@/config/multer';
import { STICKER_MAX_SIZE_BYTES } from '@/constants/stickers';
import { StickerResponseDTO } from './dto/sticker.response.dto';
import { UploadStickerRequestDTO } from './dto/sticker.request.dto';
import { StickerValidationPipe } from '@/validation/StickerValidationPipe';
import { isAnimatedImage, processAndSaveImage } from '@/utils/imageProcessing';

@injectable()
@Controller('api/v1/servers/:serverId/stickers')
@ApiTags('Server Stickers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class ServerStickerController {
    private readonly UPLOADS_DIR = path.join(
        process.cwd(),
        'uploads',
        'stickers',
    );

    public constructor(
        @Inject(TYPES.StickerRepository)
        private stickerRepo: IStickerRepository,
        @Inject(TYPES.ServerRepository)
        private serverRepo: IServerRepository,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.PermissionService)
        private permissionService: PermissionService,
        @Inject(TYPES.Logger)
        private logger: ILogger,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.ServerAuditLogService)
        private serverAuditLogService: IServerAuditLogService,
    ) {
        // Ensure sticker upload directory exists at startup to avoid runtime write failures
        if (!fs.existsSync(this.UPLOADS_DIR)) {
            fs.mkdirSync(this.UPLOADS_DIR, { recursive: true });
        }
    }

    @Get()
    @ApiOperation({ summary: 'Get all server stickers' })
    @ApiResponse({
        status: 200,
        description: 'Server stickers retrieved',
        type: [StickerResponseDTO],
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.SERVER.NOT_FOUND })
    public async getServerStickers(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
    ): Promise<StickerResponseDTO[]> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const stickers =
            await this.stickerRepo.findByServerIdWithCreator(serverOid);
        return stickers.map((s) => ({
            id: s._id.toString(),
            name: s.name,
            imageUrl: s.imageUrl,
            isAnimated: s.isAnimated,
            serverId: s.serverId.toString(),
            createdBy: s.createdBy.toString(),
            createdAt: s.createdAt,
        }));
    }

    @Post()
    @UseInterceptors(
        FileInterceptor('sticker', {
            storage,
            limits: { fileSize: STICKER_MAX_SIZE_BYTES },
        }),
    )
    @ApiOperation({ summary: 'Upload a server sticker' })
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                sticker: { type: 'string', format: 'binary' },
                name: { type: 'string' },
            },
        },
    })
    @ApiResponse({
        status: 201,
        description: 'Sticker uploaded',
        type: StickerResponseDTO,
    })
    @ApiResponse({
        status: 400,
        description: 'File required or invalid name',
    })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @ApiResponse({ status: 409, description: 'Name exists' })
    @HttpCode(201)
    public async uploadSticker(
        @Param('serverId') serverId: string,
        @Req() req: ExpressRequest,
        @UploadedFile(StickerValidationPipe) sticker: Express.Multer.File,
        @Body() body: UploadStickerRequestDTO,
    ): Promise<StickerResponseDTO> {
        const { name } = body;
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);

        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const isOwner = server.ownerId.equals(userOid);
        if (
            !isOwner &&
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageStickers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
            );
        }

        const existingSticker = await this.stickerRepo.findByServerAndName(
            serverOid,
            name,
        );
        if (existingSticker !== null) {
            throw new ConflictException(ErrorMessages.STICKER.NAME_EXISTS);
        }

        const stickerId = new mongoose.Types.ObjectId();

        try {
            const isAnimated = await isAnimatedImage(
                sticker.path || sticker.buffer,
            );
            const fileName = `${stickerId}.${isAnimated ? 'gif' : 'webp'}`;
            const filePath = path.join(this.UPLOADS_DIR, fileName);

            await processAndSaveImage(
                sticker.path || sticker.buffer,
                filePath,
                {
                    width: 512,
                    height: 512,
                    fit: 'contain',
                    format: isAnimated ? 'gif' : 'webp',
                    animated: isAnimated,
                    quality: 90,
                },
            );

            const imageUrl = `/uploads/stickers/${fileName}`;

            const newSticker = await this.stickerRepo.create({
                name,
                imageUrl,
                isAnimated,
                serverId: serverOid,
                createdBy: userOid,
            });

            const populatedSticker = await this.stickerRepo.findByIdWithCreator(
                newSticker._id,
            );

            if (populatedSticker === null) {
                throw new InternalServerErrorException(
                    'Sticker not found after creation',
                );
            }

            this.wsServer.broadcastToServer(serverId, {
                type: 'sticker_updated',
                payload: { serverId, senderId: userId },
            });

            await this.serverAuditLogService.createAndBroadcast({
                serverId: serverOid,
                actorId: userOid,
                actionType: 'sticker_create',
                targetId: newSticker._id as Types.ObjectId,
                targetType: 'server',
                metadata: { stickerName: name },
            });

            return {
                id: populatedSticker._id.toString(),
                name: populatedSticker.name,
                imageUrl: populatedSticker.imageUrl,
                isAnimated: populatedSticker.isAnimated,
                serverId: populatedSticker.serverId.toString(),
                createdBy: populatedSticker.createdBy.toString(),
                createdAt: populatedSticker.createdAt,
            };
        } catch (error) {
            this.logger.error('Error adding sticker:', error);
            if (error instanceof ApiError || error instanceof HttpException)
                throw error;
            throw new InternalServerErrorException(
                ErrorMessages.SYSTEM.INTERNAL_ERROR,
            );
        }
    }

    @Get(':stickerId')
    @ApiOperation({ summary: 'Get a specific sticker' })
    @ApiResponse({
        status: 200,
        description: 'Sticker retrieved',
        type: StickerResponseDTO,
    })
    @ApiResponse({ status: 403, description: ErrorMessages.SERVER.NOT_MEMBER })
    @ApiResponse({ status: 404, description: ErrorMessages.STICKER.NOT_FOUND })
    public async getSticker(
        @Param('serverId') serverId: string,
        @Param('stickerId') stickerId: string,
        @Req() req: ExpressRequest,
    ): Promise<StickerResponseDTO> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const stickerOid = new Types.ObjectId(stickerId);
        const member = await this.serverMemberRepo.findByServerAndUser(
            serverOid,
            userOid,
        );
        if (member === null) {
            throw new ForbiddenException(ErrorMessages.SERVER.NOT_MEMBER);
        }

        const sticker = await this.stickerRepo.findById(stickerOid);
        if (sticker === null || !sticker.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.STICKER.NOT_FOUND);
        }

        return {
            id: sticker._id.toString(),
            name: sticker.name,
            imageUrl: sticker.imageUrl,
            isAnimated: sticker.isAnimated,
            serverId: sticker.serverId.toString(),
            createdBy: sticker.createdBy.toString(),
            createdAt: sticker.createdAt,
        };
    }

    @Delete(':stickerId')
    @ApiOperation({ summary: 'Delete a server sticker' })
    @ApiResponse({ status: 204, description: 'Sticker deleted' })
    @ApiResponse({
        status: 403,
        description: ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
    })
    @ApiResponse({ status: 404, description: ErrorMessages.STICKER.NOT_FOUND })
    @HttpCode(204)
    public async deleteSticker(
        @Param('serverId') serverId: string,
        @Param('stickerId') stickerId: string,
        @Req() req: ExpressRequest,
    ): Promise<void> {
        const userId = (req as ExpressRequest & { user: JWTPayload }).user.id;
        const serverOid = new Types.ObjectId(serverId);
        const userOid = new Types.ObjectId(userId);
        const stickerOid = new Types.ObjectId(stickerId);

        const server = await this.serverRepo.findById(serverOid);
        if (server === null) {
            throw new NotFoundException(ErrorMessages.SERVER.NOT_FOUND);
        }

        const isOwner = server.ownerId.equals(userOid);
        if (
            !isOwner &&
            !(await this.permissionService.hasPermission(
                serverOid,
                userOid,
                'manageStickers',
            ))
        ) {
            throw new ForbiddenException(
                ErrorMessages.SERVER.INSUFFICIENT_PERMISSIONS,
            );
        }

        const sticker = await this.stickerRepo.findById(stickerOid);
        if (sticker === null || !sticker.serverId.equals(serverOid)) {
            throw new NotFoundException(ErrorMessages.STICKER.NOT_FOUND);
        }

        const filePath = path.join(process.cwd(), sticker.imageUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        await this.stickerRepo.delete(stickerOid);

        this.wsServer.broadcastToServer(serverId, {
            type: 'sticker_updated',
            payload: { serverId, senderId: userId },
        });

        await this.serverAuditLogService.createAndBroadcast({
            serverId: serverOid,
            actorId: userOid,
            actionType: 'sticker_delete',
            targetId: stickerOid,
            targetType: 'server',
            metadata: { stickerName: sticker.name },
        });
    }
}
