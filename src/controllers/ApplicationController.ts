import {
    Controller,
    Get,
    Put,
    Body,
    UseGuards,
    Req,
    Inject,
    HttpCode,
    HttpStatus,
    ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { injectable } from 'inversify';

import { TYPES } from '@/di/types';
import type { ISlashCommandRepository } from '@/di/interfaces/ISlashCommandRepository';
import { JwtAuthGuard } from '@/modules/auth/auth.module';
import { Bot } from '@/models/Bot';
import type { AuthenticatedRequest } from '@/middleware/auth';
import { SetCommandsRequestDTO } from './dto/application.request.dto';

@ApiTags('Applications')
@ApiBearerAuth()
@injectable()
@Controller('api/v1/applications')
export class ApplicationController {
    public constructor(
        @Inject(TYPES.SlashCommandRepository) private slashCommandRepo: ISlashCommandRepository,
    ) {}

    @UseGuards(JwtAuthGuard)
    @Get('@me/commands')
    @ApiOperation({ summary: 'Get slash commands registered by this bot' })
    public async getMyCommands(@Req() req: AuthenticatedRequest) {
        if (req.user.isBot !== true) throw new ForbiddenException('Forbidden');

        const bot = await Bot.findOne({ userId: req.user.id }).lean();
        if (bot === null) throw new ForbiddenException('Forbidden');

        return this.slashCommandRepo.findByBotId(bot._id);
    }

    @UseGuards(JwtAuthGuard)
    @Put('@me/commands')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Bulk-overwrite slash commands for this bot (token auth)' })
    public async setMyCommands(
        @Req() req: AuthenticatedRequest,
        @Body() body: SetCommandsRequestDTO,
    ) {
        if (req.user.isBot !== true) throw new ForbiddenException('Forbidden');

        const bot = await Bot.findOne({ userId: req.user.id }).lean();
        if (bot === null) throw new ForbiddenException('Forbidden');

        await this.slashCommandRepo.deleteByBotId(bot._id);

        const created = [];
        for (const cmd of body.commands) {
            created.push(await this.slashCommandRepo.create({
                botId: bot._id,
                name: cmd.name.toLowerCase(),
                description: cmd.description,
                options: cmd.options ?? [],
                shouldReply: cmd.shouldReply ?? false,
            }));
        }

        return created;
    }
}
