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
    getUserRoleColor(
        role: IRole,
        userId: string,
        allMemberUserIds: string[],
    ): string {
        // If role has gradient colors, use gradient interpolation
        if (role.startColor && role.endColor) {
            const roleColors: RoleGradientColors = {
                startColor: role.startColor,
                endColor: role.endColor,
                ...(role.gradientRepeat && {
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
        return role.color || '#99aab5';
    }

    // Generate color assignments for all members of a role
    generateRoleColorAssignments(
        role: IRole,
        memberUserIds: string[],
    ): InterpolatedColorAssignment[] {
        // If role has gradient colors, generate gradient assignments
        if (role.startColor && role.endColor) {
            const roleColors: RoleGradientColors = {
                startColor: role.startColor,
                endColor: role.endColor,
                ...(role.gradientRepeat && {
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
            color: role.color || '#99aab5',
        }));
    }

    // Check if a role uses gradient colors
    isGradientRole(role: IRole): boolean {
        return !!(role.startColor && role.endColor);
    }

    // Get the effective colors for a role (gradient or solid)
    getRoleColors(role: IRole): {
        startColor: string;
        endColor: string;
        isGradient: boolean;
        gradientRepeat?: number;
    } {
        const isGradient = this.isGradientRole(role);

        return {
            startColor: role.startColor || role.color || '#99aab5',
            endColor: role.endColor || role.color || '#99aab5',
            isGradient,
            ...(role.gradientRepeat && { gradientRepeat: role.gradientRepeat }),
        };
    }
}
