// Color interpolation utilities for role gradients

export interface RoleGradientColors {
    startColor: string;
    endColor: string;
    gradientRepeat?: number; // Number of times to repeat the gradient (1 = no repeat)
}

export interface InterpolatedColorAssignment {
    userId: string;
    color: string | null; // Null indicates gradient mode
}

// Convert hex color to RGB
export function hexToRgb(
    hex: string,
): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result || !result[1] || !result[2] || !result[3]) {
        return null;
    }
    return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    };
}

// Convert RGB to hex
export function rgbToHex(r: number, g: number, b: number): string {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// Convert hex color to HSL
export function hexToHsl(
    hex: string,
): { h: number; s: number; l: number } | null {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;

    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
            case r:
                h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
                break;
            case g:
                h = ((b - r) / d + 2) / 6;
                break;
            case b:
                h = ((r - g) / d + 4) / 6;
                break;
        }
    }

    return {
        h: Math.round(h * 360),
        s: Math.round(s * 100),
        l: Math.round(l * 100),
    };
}

// Convert HSL to hex
export function hslToHex(h: number, s: number, l: number): string {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    let r, g, b;

    if (s === 0) {
        r = g = b = l; // Achromatic
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1 / 3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1 / 3);
    }

    return rgbToHex(
        Math.round(r * 255),
        Math.round(g * 255),
        Math.round(b * 255),
    );
}

// Interpolate between two colors in RGB space
export function interpolateRgb(
    color1: string,
    color2: string,
    factor: number,
): string {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);

    if (!rgb1 || !rgb2) return color1;

    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * factor);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * factor);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * factor);

    return rgbToHex(r, g, b);
}

// Interpolate between two colors in HSL space (generally smoother gradients)
export function interpolateHsl(
    color1: string,
    color2: string,
    factor: number,
): string {
    const hsl1 = hexToHsl(color1);
    const hsl2 = hexToHsl(color2);

    if (!hsl1 || !hsl2) return color1;

    // Handle hue interpolation (shortest path around the circle)
    const h = hsl1.h;
    let h2 = hsl2.h;

    const diff = h2 - h;
    if (diff > 180) {
        h2 -= 360;
    } else if (diff < -180) {
        h2 += 360;
    }

    const finalH = h + (h2 - h) * factor;
    const s = hsl1.s + (hsl2.s - hsl1.s) * factor;
    const l = hsl1.l + (hsl2.l - hsl1.l) * factor;

    return hslToHex(finalH, s, l);
}

// Generate color assignments for role members using gradient interpolation
//
// @param roleColors - Object containing startColor and endColor
// @param memberUserIds - Array of user IDs in the role
// @param options - Configuration options
// @returns Array of user-to-color assignments
export function generateRoleGradientAssignments(
    roleColors: RoleGradientColors,
    memberUserIds: string[],
    options: {
        interpolationMode?: 'rgb' | 'hsl';
        seed?: string; // For consistent assignments across calls
    } = {},
): InterpolatedColorAssignment[] {
    const { interpolationMode = 'hsl', seed } = options;

    // Handle undefined colors by defaulting to startColor
    const startColor = roleColors.startColor || '#99aab5';
    const endColor = roleColors.endColor || startColor;
    const gradientRepeat = roleColors.gradientRepeat || 1;

    if (startColor === endColor) {
        // Solid color - all members get the same color
        return memberUserIds.map((userId) => ({
            userId,
            color: startColor,
        }));
    }

    // Sort user IDs for consistent assignment (or use seed for different ordering)
    const sortedUserIds = [...memberUserIds].sort((a, b) => {
        if (seed) {
            // Use seeded comparison for consistent but different ordering
            return (a + seed).localeCompare(b + seed);
        }
        return a.localeCompare(b);
    });

    const interpolate =
        interpolationMode === 'rgb' ? interpolateRgb : interpolateHsl;

    return sortedUserIds.map((userId, index) => {
        // Calculate interpolation factor with repeating gradient support
        let factor: number;

        if (gradientRepeat <= 1) {
            // Single gradient - distribute colors evenly across the gradient
            if (sortedUserIds.length === 1) {
                factor = 0.5; // Single member gets middle color
            } else {
                factor = index / (sortedUserIds.length - 1);
            }
        } else {
            // Repeating gradient - cycle through the gradient multiple times
            const segmentSize = sortedUserIds.length / gradientRepeat;
            const indexInSegment = index % segmentSize;

            if (segmentSize === 1) {
                factor = 0.5; // Single member in segment gets middle color
            } else {
                factor = indexInSegment / (segmentSize - 1);
            }
        }

        const color = interpolate(startColor, endColor, factor);

        return {
            userId,
            color,
        };
    });
}

// Get a single user's color from a role gradient
//
// @param roleColors - Object containing startColor and endColor
// @param userId - The user ID to get color for
// @param allMemberUserIds - All user IDs in the role
// @param options - Configuration options
// @returns The color for the specific user
export function getUserGradientColor(
    roleColors: RoleGradientColors,
    userId: string,
    allMemberUserIds: string[],
    options: {
        interpolationMode?: 'rgb' | 'hsl';
        seed?: string;
    } = {},
): string {
    // Handle undefined colors by defaulting to startColor
    const startColor = roleColors.startColor || '#99aab5';
    const endColor = roleColors.endColor || startColor;

    const assignments = generateRoleGradientAssignments(
        {
            startColor,
            endColor,
            ...(roleColors.gradientRepeat && {
                gradientRepeat: roleColors.gradientRepeat,
            }),
        },
        allMemberUserIds,
        options,
    );
    const userAssignment = assignments.find((a) => a.userId === userId);
    return userAssignment?.color || startColor;
}
