import { ServerController } from '../ServerController';
import { ImagePresets, processAndSaveImage } from '@/utils/imageProcessing';

jest.mock('@/utils/imageProcessing', () => ({
    processAndSaveImage: jest.fn(),
    ImagePresets: {
        serverIcon: jest.fn((isGif: boolean) => ({
            format: isGif ? 'gif' : 'png',
            animated: isGif,
        })),
    },
}));

describe('ServerController.uploadServerIcon GIF support', () => {
    const serverId = 'server123';
    const userId = 'user123';

    const mockServerRepo = {
        findById: jest.fn().mockResolvedValue({ id: serverId, icon: null }),
        update: jest
            .fn()
            .mockResolvedValue({
                id: serverId,
                icon: `/api/v1/servers/icon/${serverId}-123.gif`,
            }),
    };
    const mockPermissionService = {
        requirePermission: jest.fn().mockResolvedValue(undefined),
    };
    const mockWsServer = {
        broadcastToServer: jest.fn(),
    };
    const mockServerAuditLogService = {
        createAndBroadcast: jest.fn().mockResolvedValue(undefined),
    };
    const mockDiscoveryService = {
        refreshServer: jest.fn().mockResolvedValue(undefined),
    };

    let controller: ServerController;

    beforeEach(() => {
        jest.clearAllMocks();
        controller = new ServerController(
            mockServerRepo as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            mockPermissionService as never,
            mockWsServer as never,
            {} as never,
            {} as never,
            {} as never,
            mockServerAuditLogService,
            {} as never,
            mockDiscoveryService as never,
        );
        // @ts-expect-error override uploads directory for unit test
        controller.UPLOADS_DIR = '/mock/uploads';
    });

    it('processes uploaded gif icon with gif extension and animated image preset', async () => {
        const file = {
            mimetype: 'image/gif',
            buffer: Buffer.from('gif-data'),
            path: '',
        } as Express.Multer.File;

        const result = await controller.uploadServerIcon(
            serverId,
            userId,
            file,
        );

        expect(ImagePresets.serverIcon).toHaveBeenCalledWith(true);
        expect(processAndSaveImage).toHaveBeenCalledWith(
            file.buffer,
            expect.stringMatching(/\/mock\/uploads\/server123-\d+\.gif$/),
            expect.objectContaining({ format: 'gif', animated: true }),
        );
        expect(result.icon).toMatch(
            /\/api\/v1\/servers\/icon\/server123-\d+\.gif$/,
        );
    });

    it('processes non-gif icon with png extension and static preset', async () => {
        const file = {
            mimetype: 'image/png',
            buffer: Buffer.from('png-data'),
            path: '',
        } as Express.Multer.File;

        await controller.uploadServerIcon(serverId, userId, file);

        expect(ImagePresets.serverIcon).toHaveBeenCalledWith(false);
        expect(processAndSaveImage).toHaveBeenCalledWith(
            file.buffer,
            expect.stringMatching(/\/mock\/uploads\/server123-\d+\.png$/),
            expect.objectContaining({ format: 'png', animated: false }),
        );
    });
});
