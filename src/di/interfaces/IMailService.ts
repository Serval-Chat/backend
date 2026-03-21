export interface IMailService {
    sendPasswordResetEmail(
        to: string,
        resetLink: string,
        requestId: string,
    ): Promise<void>;
    sendPasswordChangedNotification(to: string): Promise<void>;
    sendExportSuccessEmail(
        to: string,
        channelName: string,
        serverName: string,
        downloadUrl: string,
    ): Promise<void>;
    sendExportFailureEmail(
        to: string,
        channelName: string,
        serverName: string,
    ): Promise<void>;
    sendExportCancelledEmail(
        to: string,
        channelName: string,
        serverName: string,
    ): Promise<void>;
}
