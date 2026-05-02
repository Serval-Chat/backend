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
    public subscription!: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
        expirationTime?: number | null;
    };
}

export class FcmDto {
    @ApiProperty()
    @IsString()
    public token!: string;
}

export class UpdatePreferencesDto {
    @ApiProperty()
    @IsOptional()
    @IsBoolean()
    public mention?: boolean;

    @ApiProperty()
    @IsOptional()
    @IsBoolean()
    public friend_request?: boolean;

    @ApiProperty()
    @IsOptional()
    @IsBoolean()
    public custom?: boolean;
}

export class MigrateVapidDto {
    @ApiProperty()
    @IsUrl()
    public oldEndpoint!: string;

    @ApiProperty()
    @IsObject()
    public newSubscription!: {
        endpoint: string;
        keys: { p256dh: string; auth: string };
    };
}
