import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Req,
    Res,
    Body,
    UseGuards,
    UseInterceptors,
    UploadedFile,
    Inject,
    BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiTags,
    ApiResponse,
    ApiBearerAuth,
    ApiOperation,
    ApiConsumes,
    ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Request, Response } from 'express';
import path from 'path';
import fs, { promises as fsPromises } from 'fs';
import { ApiError } from '@/utils/ApiError';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { NoBot } from '@/modules/auth/bot.decorator';
import { WsServer } from '@/ws/server';
import { TYPES } from '@/di/types';
import { IUserRepository } from '@/di/interfaces/IUserRepository';
import { IServerMemberRepository } from '@/di/interfaces/IServerMemberRepository';
import { IFriendshipRepository } from '@/di/interfaces/IFriendshipRepository';
import { Decoration } from '@/models/Decoration';
import { processImage, ImageProcessingOptions } from '@/utils/imageProcessing';
import { diskStorage } from 'multer';
import crypto from 'crypto';
import { UploadDecorationRequestDTO } from './dto/decoration.request.dto';
import {
    DecorationResponseDTO,
    UploadDecorationResponseDTO,
    SimpleMessageResponseDTO,
    DecorationListResponseDTO,
} from './dto/decoration.response.dto';
import { User } from '@/models/User';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'decorations');

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
        const uniqueSuffix = crypto.randomBytes(16).toString('hex');
        const ext = path.extname(file.originalname);
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

@ApiTags('Decorations')
@Controller('api/v1/decorations')
export class DecorationController {
    public constructor(
        @Inject(TYPES.UserRepository)
        private userRepo: IUserRepository,
        @Inject(TYPES.WsServer)
        private wsServer: WsServer,
        @Inject(TYPES.ServerMemberRepository)
        private serverMemberRepo: IServerMemberRepository,
        @Inject(TYPES.FriendshipRepository)
        private friendshipRepo: IFriendshipRepository,
    ) {}

    private async broadcastUserUpdate(
        userId: string,
        decorationId: string | null,
    ) {
        const payload = { userId, decorationId };

        const serverIds =
            await this.serverMemberRepo.findServerIdsByUserId(userId);
        const friendships = await this.friendshipRepo.findAllByUserId(userId);

        serverIds.forEach((serverId) => {
            this.wsServer.broadcastToServer(serverId.toString(), {
                type: 'user_updated',
                payload,
            });
        });

        friendships.forEach((friendship) => {
            const friendId =
                friendship.userId.toString() === userId
                    ? friendship.friendId.toString()
                    : friendship.userId.toString();
            this.wsServer.broadcastToUser(friendId, {
                type: 'user_updated',
                payload,
            });
        });

        this.wsServer.broadcastToUser(userId, {
            type: 'user_updated',
            payload,
        });
    }

    @Post('upload')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @UseInterceptors(
        FileInterceptor('file', {
            storage,
            limits: {
                fileSize: 800 * 1024,
            },
            fileFilter: (req, file, cb) => {
                if (
                    file.mimetype === 'image/webp' ||
                    file.mimetype === 'image/gif'
                ) {
                    cb(null, true);
                } else {
                    cb(
                        new BadRequestException(
                            'Only webp and gif files are allowed',
                        ),
                        false,
                    );
                }
            },
        }),
    )
    @ApiConsumes('multipart/form-data')
    @ApiBody({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                file: {
                    type: 'string',
                    format: 'binary',
                },
            },
        },
    })
    @ApiOperation({ summary: 'Upload a decoration' })
    @ApiResponse({ status: 201, type: UploadDecorationResponseDTO })
    public async uploadDecoration(
        @UploadedFile() file: Express.Multer.File | undefined,
        @Body() body: UploadDecorationRequestDTO,
        @CurrentUser('id') userId: string,
    ): Promise<UploadDecorationResponseDTO> {
        if (!file) {
            throw new BadRequestException('No file uploaded');
        }

        const isAnimated = file.mimetype === 'image/gif';
        const format = isAnimated ? 'gif' : 'webp';

        const originalPath = file.path;
        const basename = path.basename(
            file.filename,
            path.extname(file.filename),
        );

        try {
            const sizes = [64, 128, 256, 512];
            for (const size of sizes) {
                const options: ImageProcessingOptions = {
                    width: size,
                    height: size,
                    fit: 'contain',
                    format: format,
                    animated: isAnimated,
                    stripMetadata: true,
                    background: { r: 0, g: 0, b: 0, alpha: 0 },
                };

                const { buffer } = await processImage(originalPath, options);
                await fsPromises.writeFile(
                    path.join(UPLOADS_DIR, `${basename}_${size}.${format}`),
                    buffer,
                );
            }

            const decoration = new Decoration({
                name: body.name,
                filename: file.filename,
                createdBy: userId,
            });

            await decoration.save();

            return {
                message: 'Decoration uploaded successfully',
                decoration: {
                    id: decoration.snowflakeId,
                    name: decoration.name,
                    filename: decoration.filename,
                    createdBy: decoration.createdBy,
                    createdAt: decoration.createdAt,
                },
            };
        } catch {
            await fsPromises.unlink(originalPath).catch(() => {});
            throw new ApiError(500, 'Failed to process decoration');
        }
    }

    @Post(':id/apply')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Apply a decoration' })
    @ApiResponse({ status: 200, type: SimpleMessageResponseDTO })
    public async applyDecoration(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ): Promise<SimpleMessageResponseDTO> {
        const decoration = await Decoration.findOne({ snowflakeId: id }).exec();
        if (!decoration) {
            throw new ApiError(404, 'Decoration not found');
        }

        await this.userRepo.updateDecoration(userId, id);
        await this.broadcastUserUpdate(userId, id);

        return { message: 'Decoration applied successfully' };
    }

    @Delete('active')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Remove active decoration' })
    @ApiResponse({ status: 200, type: SimpleMessageResponseDTO })
    public async removeActiveDecoration(
        @CurrentUser('id') userId: string,
    ): Promise<SimpleMessageResponseDTO> {
        await this.userRepo.updateDecoration(userId, null);
        await this.broadcastUserUpdate(userId, null);

        return { message: 'Decoration removed successfully' };
    }

    @Get('my')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
        summary: 'Get all decorations created by the current user',
    })
    @ApiResponse({ status: 200, type: DecorationListResponseDTO })
    public async getMyDecorations(
        @CurrentUser('id') userId: string,
    ): Promise<DecorationListResponseDTO> {
        const decorations = await Decoration.find({ createdBy: userId })
            .sort({ createdAt: -1 })
            .exec();

        return {
            decorations: decorations.map((d) => ({
                id: d.snowflakeId,
                name: d.name,
                filename: d.filename,
                createdBy: d.createdBy,
                createdAt: d.createdAt,
            })),
        };
    }

    @Delete(':id')
    @NoBot()
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Delete a decoration permanently' })
    @ApiResponse({ status: 200, type: SimpleMessageResponseDTO })
    public async deleteDecoration(
        @Param('id') id: string,
        @CurrentUser('id') userId: string,
    ): Promise<SimpleMessageResponseDTO> {
        const decoration = await Decoration.findOne({ snowflakeId: id }).exec();
        if (!decoration) {
            throw new ApiError(404, 'Decoration not found');
        }

        if (decoration.createdBy !== userId) {
            throw new ApiError(
                403,
                'You do not have permission to delete this decoration',
            );
        }

        await Decoration.deleteOne({ _id: decoration._id });

        const sizes = [64, 128, 256, 512];
        const isAnimated = decoration.filename.endsWith('.gif');
        const format = isAnimated ? 'gif' : 'webp';
        const basename = path.basename(
            decoration.filename,
            path.extname(decoration.filename),
        );

        for (const size of sizes) {
            const filePath = path.join(
                UPLOADS_DIR,
                `${basename}_${size}.${format}`,
            );
            await fsPromises.unlink(filePath).catch(() => {});
        }

        const usersWithDeco = await User.find({ decorationId: id })
            .select('snowflakeId')
            .exec();
        if (usersWithDeco.length > 0) {
            await User.updateMany(
                { decorationId: id },
                { $unset: { decorationId: '' } },
            );

            for (const u of usersWithDeco) {
                await this.broadcastUserUpdate(u.snowflakeId, null);
            }
        }

        return { message: 'Decoration deleted successfully' };
    }

    @Get(':id')
    @ApiBearerAuth()
    @UseGuards(JwtAuthGuard)
    @ApiOperation({ summary: 'Get decoration metadata' })
    @ApiResponse({ status: 200, type: DecorationResponseDTO })
    public async getDecoration(
        @Param('id') id: string,
    ): Promise<DecorationResponseDTO> {
        const decoration = await Decoration.findOne({ snowflakeId: id }).exec();
        if (!decoration) {
            throw new ApiError(404, 'Decoration not found');
        }

        return {
            id: decoration.snowflakeId,
            name: decoration.name,
            filename: decoration.filename,
            createdBy: decoration.createdBy,
            createdAt: decoration.createdAt,
        };
    }

    @Get('file/:id')
    @ApiOperation({ summary: 'Download decoration file' })
    public async getDecorationFile(
        @Param('id') id: string,
        @Req() req: Request,
        @Res() res: Response,
    ): Promise<void> {
        const decoration = await Decoration.findOne({ snowflakeId: id }).exec();
        if (!decoration) {
            throw new ApiError(404, 'Decoration not found');
        }

        const size = parseInt(req.query.size as string, 10);
        let validSize = 512;
        if (!isNaN(size)) {
            if (size <= 64) validSize = 64;
            else if (size <= 128) validSize = 128;
            else if (size <= 256) validSize = 256;
            else validSize = 512;
        }

        const isAnimated = decoration.filename.endsWith('.gif');
        const format = isAnimated ? 'gif' : 'webp';
        const basename = path.basename(
            decoration.filename,
            path.extname(decoration.filename),
        );

        const filePath = path.join(
            UPLOADS_DIR,
            `${basename}_${validSize}.${format}`,
        );

        try {
            await fsPromises.access(filePath, fs.constants.F_OK);

            res.setHeader(
                'Content-Type',
                isAnimated ? 'image/gif' : 'image/webp',
            );
            res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
        } catch {
            throw new ApiError(404, 'Decoration file not found');
        }
    }
}
