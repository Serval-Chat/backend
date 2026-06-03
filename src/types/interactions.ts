export enum SlashCommandOptionType {
    SUB_COMMAND = 1,
    STRING = 3,
    INTEGER = 4,
    BOOLEAN = 5,
    USER = 6,
    CHANNEL = 7,
    ROLE = 8,
}

export interface InteractionResolvedUser {
    id: string;
    username: string;
    displayName?: string;
    profilePicture?: string;
    isBot?: boolean;
}

export interface InteractionResolvedChannel {
    id: string;
    name: string;
    type: string;
}

export interface InteractionResolvedRole {
    id: string;
    name: string;
    color?: string;
}

export type InteractionValue =
    | string
    | number
    | boolean
    | InteractionResolvedUser
    | InteractionResolvedChannel
    | InteractionResolvedRole;
