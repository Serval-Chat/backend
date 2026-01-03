export interface LoginResponseDTO {
    token: string;
    username: string;
}

export interface RegisterResponseDTO {
    token: string;
}

export interface ChangeLoginResponseDTO {
    message: string;
    login: string;
    token: string;
}

export interface ChangePasswordResponseDTO {
    message: string;
    token: string;
}


export interface AuthErrorResponseDTO {
    error: string;
    ban?: any; // todo: make it IBan shape
}
