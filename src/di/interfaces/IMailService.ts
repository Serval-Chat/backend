export interface IMailService {
    sendPasswordResetEmail(
        to: string,
        resetLink: string,
        requestId: string,
    ): Promise<void>;
    sendPasswordChangedNotification(to: string): Promise<void>;
}
