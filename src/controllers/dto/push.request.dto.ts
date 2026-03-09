import {
    IsString,
    IsObject,
    IsOptional,
    IsBoolean,
    IsUrl,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WebPushDto {
    @ApiProperty()
    @IsObject()
    subscription!: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
        expirationTime?: number | null;
    };
}

export class FcmDto {
    @ApiProperty()
    @IsString()
    token!: string;
}

export class UpdatePreferencesDto {
    @ApiProperty()
    @IsOptional()
    @IsBoolean()
    mention?: boolean;

    @ApiProperty()
    @IsOptional()
    @IsBoolean()
    friend_request?: boolean;

    @ApiProperty()
    @IsOptional()
    @IsBoolean()
    custom?: boolean;
}

export class MigrateVapidDto {
    @ApiProperty()
    @IsUrl()
    oldEndpoint!: string;

    @ApiProperty()
    @IsObject()
    newSubscription!: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
    };
}
