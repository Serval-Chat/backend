export interface NotificationSoundGainFields {
    volume?: number;
    normalizationGain?: number;
}

export function withSoundDefaults<T extends NotificationSoundGainFields>(
    sound: T,
): T & { volume: number; normalizationGain: number } {
    return {
        ...sound,
        volume: sound.volume ?? 1,
        normalizationGain: sound.normalizationGain ?? 1,
    };
}
