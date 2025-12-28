import { injectable } from 'inversify';
import type { IRole } from '@/di/interfaces/IRoleRepository';
import {
    getUserGradientColor,
    generateRoleGradientAssignments,
    RoleGradientColors,
    InterpolatedColorAssignment,
} from '@/utils/gradientUtils';

/**
 * Service for handling role color gradients
 */
@injectable()
export class RoleGradientService {
    /**
     * Get the color for a specific user based on their role gradient
     *
     * @param role - The role with gradient colors
     * @param userId - The user ID to get color for
     * @param allMemberUserIds - All user IDs in the role
     * @returns The color for the specific user
     */
    /**
     * Get the color for a specific user based on their role gradient.
     *
     * Logic:
     * - If role has start/end colors, calculates interpolated color
     * - Uses HSL interpolation for smoother transitions
     * - Falls back to solid role color if no gradient defined
     */
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

    /**
     * Generate color assignments for all members of a role
     *
     * @param role - The role with gradient colors
     * @param memberUserIds - Array of user IDs in the role
     * @returns Array of user-to-color assignments
     */
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

    /**
     * Check if a role uses gradient colors
     *
     * @param role - The role to check
     * @returns True if role has both startColor and endColor
     */
    isGradientRole(role: IRole): boolean {
        return !!(role.startColor && role.endColor);
    }

    /**
     * Get the effective colors for a role (gradient or solid)
     *
     * @param role - The role to get colors for
     * @returns Object with startColor, endColor, and isGradient flag
     */
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
