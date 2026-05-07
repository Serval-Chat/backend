import { applyDecorators, UseGuards } from '@nestjs/common';
import { IsHumanGuard } from './bot.guard';

export function NoBot() {
    return applyDecorators(UseGuards(IsHumanGuard));
}
