import { InternalWcagController } from './InternalWcagController';

const report = (route = '/chat/@me', theme = 'dark') => ({
    scanNumber: 1,
    route,
    theme,
    durationMs: 20,
    issues: [
        {
            ruleId: 'color-contrast',
            help: 'Ensure contrast is sufficient.',
            helpUrl: 'https://example.test/color-contrast',
            impact: 'serious',
            target: ['#save'],
            html: '<button id="save">Save</button>',
            failureSummary: 'Fix foreground and background colors.',
        },
    ],
});

describe('InternalWcagController', (): void => {
    it('deduplicates repeated reports and tracks observations', (): void => {
        const controller = new InternalWcagController();

        expect(controller.recordReport(report())).toEqual({
            receivedCount: 1,
            trackedCount: 1,
        });
        controller.recordReport({ ...report(), scanNumber: 2 });

        const [issue] = controller.listIssues();
        expect(issue?.observations).toBe(2);
        expect(issue?.route).toBe('/chat/@me');
    });

    it('keeps findings separate by route and theme and clears the collection', (): void => {
        const controller = new InternalWcagController();
        controller.recordReport(report());
        controller.recordReport(report('/settings', 'light'));

        expect(controller.listIssues()).toHaveLength(2);
        expect(controller.clearIssues()).toEqual({ clearedCount: 2 });
        expect(controller.listIssues()).toEqual([]);
    });
});
