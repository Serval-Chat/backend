export interface LoginRequestDTO {
    login: string;
    password: string;
}

export interface RegisterRequestDTO {
    login: string;
    username: string;
    password: string;
    invite: string;
}

export interface ChangeLoginRequestDTO {
    newLogin: string;
    password?: string;
}

export interface ChangePasswordRequestDTO {
    currentPassword: string;
    newPassword: string;
}
