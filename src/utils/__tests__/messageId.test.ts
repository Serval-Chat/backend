import { Types } from 'mongoose';
import { resolveMessageIdFilter } from '../messageId';

describe('resolveMessageIdFilter', () => {
    it('matches by snowflakeId only for a snowflake id', () => {
        const snowflake = '0246233124965449728';

        expect(resolveMessageIdFilter(snowflake)).toEqual({
            snowflakeId: snowflake,
        });
    });

    it('matches by snowflakeId OR _id for a raw ObjectId', () => {
        const oid = '6a3962aee1af8e04fc4f4e14';

        const filter = resolveMessageIdFilter(oid) as {
            $or: { snowflakeId?: string; _id?: Types.ObjectId }[];
        };

        expect(filter.$or).toHaveLength(2);
        expect(filter.$or[0]).toEqual({ snowflakeId: oid });
        expect(filter.$or[1]?._id).toBeInstanceOf(Types.ObjectId);
        expect(filter.$or[1]?._id?.toString()).toBe(oid);
    });

    it('does not treat a snowflake as an ObjectId', () => {
        // regression: an ObjectId `around` value was compared only against the
        // decimal snowflakeId field and matched nothing, yielding an empty
        // jump-to-message window.
        const filter = resolveMessageIdFilter('0246233124965449728');

        expect(filter).not.toHaveProperty('$or');
    });
});
