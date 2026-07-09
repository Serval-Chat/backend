import { Badge } from './Badge';

const makeBadge = () =>
    new Badge({
        id: 'bug_hunter',
        name: 'Bug Hunter',
        description: 'Found a bug',
        icon: 'bug',
    });

describe('Badge model', () => {
    test('does not gain a snowflakeId field on validate', async () => {
        const badge = makeBadge();
        await badge.validate();

        expect(badge.get('snowflakeId')).toBeUndefined();
    });

    test('keeps the human-chosen id through toJSON serialization after validate', async () => {
        const badge = makeBadge();
        await badge.validate();

        expect(badge.toJSON().id).toBe('bug_hunter');
    });

    test('keeps the human-chosen id through toObject serialization after validate', async () => {
        const badge = makeBadge();
        await badge.validate();

        expect(badge.toObject().id).toBe('bug_hunter');
    });
});
