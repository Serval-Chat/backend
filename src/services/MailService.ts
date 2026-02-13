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

    constructor(
        @inject(TYPES.Logger) @Inject(TYPES.Logger) private logger: ILogger,
        @inject(TYPES.MailConfig)
        @Inject(TYPES.MailConfig)
        private config?: { skipSending?: boolean },
    ) {
        const shouldSkip =
            this.config?.skipSending || process.env.NODE_ENV === 'test';

        if (MAILGUN_API_KEY && MAILGUN_DOMAIN && !shouldSkip) {
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

    async onModuleInit(): Promise<void> {
        await this.validateTemplates();
    }

    async validateTemplates(): Promise<void> {
        const required = ['password-reset', 'password-changed'];
        for (const template of required) {
            try {
                await this.getTemplate(template);
            } catch {
                throw new Error(`Required template missing: ${template}`);
            }
        }
    }

    private async getTemplate(
        templateName: string,
        placeholders: Record<string, string> = {},
    ): Promise<string> {
        try {
            const TEMPLATE_DIR =
                process.env.TEMPLATE_DIR ||
                path.join(process.cwd(), 'templates');
            const templatePath = path.join(
                TEMPLATE_DIR,
                `${templateName}.html`,
            );
            let template = await fs.readFile(templatePath, 'utf-8');

            for (const [key, value] of Object.entries(placeholders)) {
                template = template.replace(
                    new RegExp(`{{${key}}}`, 'g'),
                    value,
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

    async sendPasswordResetEmail(
        to: string,
        resetLink: string,
        requestId: string,
    ): Promise<void> {
        if (!this.client) {
            this.logger.error(
                `[MailService] Mailgun not configured. Cannot send email to ${to}`,
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
                `[MailService] Password reset email sent to ${to}`,
            );
        } catch (error: unknown) {
            const mailgunError = error as unknown;
            this.logger.error(
                `[MailService] Failed to send password reset email to ${to}`,
                {
                    message: mailgunError,
                },
            );
            throw new Error('Failed to send password reset email');
        }
    }

    async sendPasswordChangedNotification(to: string): Promise<void> {
        if (!this.client) return;

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
                `[MailService] Password change notification sent to ${to}`,
            );
        } catch (error) {
            const mailgunError = error as Error;
            this.logger.error(
                `[MailService] Failed to send password change notification to ${to}`,
                {
                    error: mailgunError.message,
                    stack: mailgunError.stack,
                },
            );
        }
    }
}
