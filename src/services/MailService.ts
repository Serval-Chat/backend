import { injectable, inject } from 'inversify';
import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { TYPES } from '@/di/types';
import { ILogger } from '@/di/interfaces/ILogger';
import { IMailService } from '@/di/interfaces/IMailService';
import FormData from 'form-data';
import Mailgun from 'mailgun.js';
import fs from 'fs/promises';
import path from 'path';
import {
    MAILGUN_API_KEY,
    MAILGUN_DOMAIN,
    MAILGUN_BASE_URL,
} from '@/config/env';

@injectable()
@Injectable()
export class MailService implements IMailService, OnModuleInit {
    private client: ReturnType<Mailgun['client']> | null;

    public constructor(
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.MailConfig)
        @Inject(TYPES.MailConfig)
        private config?: { skipSending?: boolean },
    ) {
        const shouldSkip =
            this.config?.skipSending === true || process.env.NODE_ENV === 'test';

        if (MAILGUN_API_KEY !== '' && MAILGUN_DOMAIN !== '' && !shouldSkip) {
            const mailgun = new Mailgun(FormData);
            this.client = mailgun.client({
                username: 'api',
                key: MAILGUN_API_KEY,
                url: MAILGUN_BASE_URL,
            });
        } else {
            this.client = null;
            if (shouldSkip) {
                this.logger.info(
                    '[MailService] Email sending is disabled (skipSending)',
                );
            } else {
                this.logger.warn('[MailService] Mailgun not configured');
            }
        }
    }

    public async onModuleInit(): Promise<void> {
        await this.validateTemplates();
    }

    public async validateTemplates(): Promise<void> {
        const required = ['password-reset', 'password-changed'];
        for (const template of required) {
            try {
                await this.getTemplate(template);
            } catch {
                throw new Error(`Required template missing: ${template}`);
            }
        }
    }

    private escapeHtml(s: string): string {
        return s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    private maskEmail(email: string): string {
        const [user, domain] = email.split('@');
        if (user === undefined || domain === undefined) return '***';
        if (user.length <= 2) return `${user[0]}***@${domain}`;
        return `${user[0]}${'*'.repeat(user.length - 2)}${user.slice(-1)}@${domain}`;
    }

    private async getTemplate(
        templateName: string,
        placeholders: Record<string, string> = {},
    ): Promise<string> {
        if (!/^[a-zA-Z0-9_-]+$/.test(templateName)) {
            throw new Error(`Invalid template name: ${templateName}`);
        }

        try {
            const TEMPLATE_DIR =
                (process.env.TEMPLATE_DIR !== undefined && process.env.TEMPLATE_DIR !== '') ? process.env.TEMPLATE_DIR :
                path.join(process.cwd(), 'templates');
            
            const resolvedDir = path.resolve(TEMPLATE_DIR);
            const templatePath = path.join(
                TEMPLATE_DIR,
                `${templateName}.html`,
            );
            const resolvedPath = path.resolve(templatePath);

            if (!resolvedPath.startsWith(resolvedDir)) {
                throw new Error(`Template path traversal detected: ${templateName}`);
            }

            let template = await fs.readFile(templatePath, 'utf-8');

            for (const [key, value] of Object.entries(placeholders)) {
                template = template.replace(
                    new RegExp(`{{${key}}}`, 'g'),
                    this.escapeHtml(value),
                );
            }

            return template;
        } catch (error) {
            const errorMsg =
                error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
                `[MailService] Failed to load template ${templateName}: ${errorMsg}`,
                error,
            );

            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new Error(`Email template not found: ${templateName}`);
            }
            throw new Error(`Failed to read email template: ${templateName}`);
        }
    }

    public async sendPasswordResetEmail(
        to: string,
        resetLink: string,
        requestId: string,
    ): Promise<void> {
        const maskedTo = this.maskEmail(to);
        if (!this.client) {
            this.logger.error(
                `[MailService] Mailgun not configured. Cannot send email to ${maskedTo}`,
            );
            throw new Error('Email service not configured');
        }

        try {
            const html = await this.getTemplate('password-reset', {
                RESET_LINK: resetLink,
                REQUEST_ID: requestId,
            });

            await this.client.messages.create(MAILGUN_DOMAIN, {
                from: `Serchat <noreply@${MAILGUN_DOMAIN}>`,
                to: [to],
                subject: 'Password Reset Request',
                text: `You have requested a password reset. Please click the link below to reset your password:\n\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
                html,
            });
            this.logger.info(
                `[MailService] Password reset email sent to ${maskedTo}`,
            );
        } catch (error: unknown) {
            const mailgunError = error as unknown;
            this.logger.error(
                `[MailService] Failed to send password reset email to ${maskedTo}`,
                {
                    message: mailgunError,
                },
            );
            throw new Error('Failed to send password reset email');
        }
    }

    public async sendPasswordChangedNotification(to: string): Promise<void> {
        if (!this.client) return;

        const maskedTo = this.maskEmail(to);
        try {
            const html = await this.getTemplate('password-changed');

            await this.client.messages.create(MAILGUN_DOMAIN, {
                from: `Serchat <noreply@${MAILGUN_DOMAIN}>`,
                to: [to],
                subject: 'Password Successfully Changed',
                text: 'Your Serchat password has been successfully changed.',
                html,
            });
            this.logger.info(
                `[MailService] Password changed notification sent to ${maskedTo}`,
            );
        } catch (error: unknown) {
            this.logger.error(
                `[MailService] Failed to send password changed notification to ${maskedTo}`,
                error,
            );
        }
    }

    public async sendExportSuccessEmail(
        to: string,
        channelName: string,
        serverName: string,
        downloadUrl: string,
    ): Promise<void> {
        if (!this.client) return;
        try {
            await this.client.messages.create(MAILGUN_DOMAIN, {
                from: `Serchat <noreply@${MAILGUN_DOMAIN}>`,
                to: [to],
                subject: `Your message export for #${channelName} is ready`,
                text: `Your export for #${channelName} on ${serverName} is ready to download.\n\nDownload file: ${downloadUrl}\n\nThis link will expire in 48 hours.`,
            });
            this.logger.info(
                `[MailService] Export success email sent to ${to}`,
            );
        } catch (error) {
            this.logger.error(
                `[MailService] Failed to send export success email to ${to}`,
                error,
            );
        }
    }

    public async sendExportFailureEmail(
        to: string,
        channelName: string,
        serverName: string,
    ): Promise<void> {
        if (!this.client) return;
        try {
            await this.client.messages.create(MAILGUN_DOMAIN, {
                from: `Serchat <noreply@${MAILGUN_DOMAIN}>`,
                to: [to],
                subject: `Message export failed for #${channelName}`,
                text: `We've failed to export messages for channel ${channelName} on server ${serverName}.\nPlease try again from channel settings, or contact support if the issue persists.`,
            });
            this.logger.info(
                `[MailService] Export failure email sent to ${to}`,
            );
        } catch (error) {
            this.logger.error(
                `[MailService] Failed to send export failure email to ${to}`,
                error,
            );
        }
    }

    public async sendExportCancelledEmail(
        to: string,
        channelName: string,
        serverName: string,
    ): Promise<void> {
        if (!this.client) return;
        try {
            await this.client.messages.create(MAILGUN_DOMAIN, {
                from: `Serchat <noreply@${MAILGUN_DOMAIN}>`,
                to: [to],
                subject: `Message export cancelled for #${channelName}`,
                text: `Your message export for ${channelName} on ${serverName} was cancelled because the channel was deleted before the export could complete.`,
            });
            this.logger.info(
                `[MailService] Export cancelled email sent to ${to}`,
            );
        } catch (error) {
            this.logger.error(
                `[MailService] Failed to send export cancelled email to ${to}`,
                error,
            );
        }
    }
}
