import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Body, Controller, Delete, Get, Post } from '@nestjs/common';

class WcagIssueDTO {
    @IsString()
    @MaxLength(128)
    public ruleId!: string;

    @IsString()
    @MaxLength(1024)
    public help!: string;

    @IsString()
    @MaxLength(2048)
    public helpUrl!: string;

    @IsOptional()
    @IsIn(['critical', 'serious', 'moderate', 'minor', null])
    public impact?: string | null;

    @IsArray()
    @ArrayMaxSize(32)
    @IsString({ each: true })
    @MaxLength(512, { each: true })
    public target!: string[];

    @IsString()
    @MaxLength(8192)
    public html!: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    public failureSummary?: string;
}

class WcagReportDTO {
    @IsInt()
    @Min(1)
    public scanNumber!: number;

    @IsString()
    @MaxLength(512)
    public route!: string;

    @IsString()
    @MaxLength(128)
    public theme!: string;

    @IsInt()
    @Min(0)
    @Max(60000)
    public durationMs!: number;

    @IsArray()
    @ArrayMaxSize(500)
    @ValidateNested({ each: true })
    @Type(() => WcagIssueDTO)
    public issues!: WcagIssueDTO[];
}

interface StoredWcagIssue extends WcagIssueDTO {
    route: string;
    theme: string;
    firstSeenAt: string;
    lastSeenAt: string;
    observations: number;
}

const MAX_STORED_ISSUES = 5000;

@Controller('api/v1/_internal/wcag')
export class InternalWcagController {
    private readonly issues = new Map<string, StoredWcagIssue>();

    @Post()
    public recordReport(@Body() report: WcagReportDTO): {
        receivedCount: number;
        trackedCount: number;
    } {
        const now = new Date().toISOString();
        for (const issue of report.issues) {
            const signature = JSON.stringify([
                issue.ruleId,
                report.route,
                report.theme,
                issue.target,
            ]);
            const existing = this.issues.get(signature);
            if (existing) {
                this.issues.delete(signature);
                existing.lastSeenAt = now;
                existing.observations++;
                existing.html = issue.html;
                existing.failureSummary = issue.failureSummary;
                this.issues.set(signature, existing);
                continue;
            }

            if (this.issues.size >= MAX_STORED_ISSUES) {
                const oldestKey = this.issues.keys().next().value;
                if (oldestKey !== undefined) this.issues.delete(oldestKey);
            }
            this.issues.set(signature, {
                ...issue,
                route: report.route,
                theme: report.theme,
                firstSeenAt: now,
                lastSeenAt: now,
                observations: 1,
            });
        }

        return {
            receivedCount: report.issues.length,
            trackedCount: this.issues.size,
        };
    }

    @Get()
    public listIssues(): StoredWcagIssue[] {
        return [...this.issues.values()].sort((a, b) =>
            b.lastSeenAt.localeCompare(a.lastSeenAt),
        );
    }

    @Delete()
    public clearIssues(): { clearedCount: number } {
        const clearedCount = this.issues.size;
        this.issues.clear();
        return { clearedCount };
    }
}
