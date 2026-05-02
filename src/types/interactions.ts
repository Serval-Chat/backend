export interface InteractionResolvedUser {
    _id: string;
    id: string;
    username: string;
    displayName?: string;
    profilePicture?: string;
    isBot?: boolean;
}

export interface InteractionResolvedChannel {
    _id: string;
    id: string;
    name: string;
    type: string;
}

export interface InteractionResolvedRole {
    _id: string;
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
