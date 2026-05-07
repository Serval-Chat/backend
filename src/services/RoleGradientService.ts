import { injectable } from 'inversify';
import type { IRole } from '@/di/interfaces/IRoleRepository';
import {
    getUserGradientColor,
    generateRoleGradientAssignments,
    RoleGradientColors,
    InterpolatedColorAssignment,
} from '@/utils/gradientUtils';

// Service for handling role color gradients
@injectable()
export class RoleGradientService {
    // Get the color for a specific user based on their role gradient
    //
    // Logic:
    // - if role has start/end colors, calculates interpolated color
    // - uses HSL interpolation for smoother transitions
    // - falls back to solid role color if no gradient defined
    public getUserRoleColor(
        role: IRole,
        userId: string,
        allMemberUserIds: string[],
    ): string {
        // If role has gradient colors, use gradient interpolation
        if (
            (role.colors !== undefined && role.colors.length >= 2) ||
            (role.startColor !== undefined &&
                role.startColor !== '' &&
                role.endColor !== undefined &&
                role.endColor !== '')
        ) {
            const roleColors: RoleGradientColors = {
                startColor: role.startColor ?? undefined,
                endColor: role.endColor ?? undefined,
                colors: role.colors,
                ...(role.gradientRepeat !== undefined &&
                    role.gradientRepeat !== 0 && {
                        gradientRepeat: role.gradientRepeat,
                    }),
            };

            return getUserGradientColor(
                roleColors,
                userId,
                allMemberUserIds,
                { interpolationMode: 'hsl' }, // Use HSL for smoother gradients
            );
        }

        // Fallback to solid color
        return role.color ?? '#99aab5';
    }

    // Generate color assignments for all members of a role
    public generateRoleColorAssignments(
        role: IRole,
        memberUserIds: string[],
    ): InterpolatedColorAssignment[] {
        // If role has gradient colors, generate gradient assignments
        if (
            (role.colors !== undefined && role.colors.length >= 2) ||
            (role.startColor !== undefined &&
                role.startColor !== '' &&
                role.endColor !== undefined &&
                role.endColor !== '')
        ) {
            const roleColors: RoleGradientColors = {
                startColor: role.startColor ?? undefined,
                endColor: role.endColor ?? undefined,
                colors: role.colors,
                ...(role.gradientRepeat !== undefined &&
                    role.gradientRepeat !== 0 && {
                        gradientRepeat: role.gradientRepeat,
                    }),
            };

            return generateRoleGradientAssignments(roleColors, memberUserIds, {
                interpolationMode: 'hsl',
            });
        }

        // Fallback to solid color for all members
        return memberUserIds.map((userId) => ({
            userId,
            color: role.color ?? '#99aab5',
        }));
    }

    // Check if a role uses gradient colors
    public isGradientRole(role: IRole): boolean {
        return (
            (role.colors !== undefined && role.colors.length >= 2) ||
            (role.startColor !== undefined &&
                role.startColor !== '' &&
                role.endColor !== undefined &&
                role.endColor !== '')
        );
    }

    // Get the effective colors for a role (gradient or solid)
    public getRoleColors(role: IRole): {
        startColor: string;
        endColor: string;
        colors?: string[];
        isGradient: boolean;
        gradientRepeat?: number;
    } {
        const isGradient = this.isGradientRole(role);

        return {
            startColor:
                role.colors?.[0] ?? role.startColor ?? role.color ?? '#99aab5',
            endColor:
                role.colors?.[role.colors.length - 1] ??
                role.endColor ??
                role.color ??
                '#99aab5',
            colors: role.colors,
            isGradient,
            ...(role.gradientRepeat !== undefined &&
                role.gradientRepeat !== 0 && {
                    gradientRepeat: role.gradientRepeat,
                }),
        };
    }
}
