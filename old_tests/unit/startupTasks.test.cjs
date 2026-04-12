require('ts-node/register');
require('tsconfig-paths/register');

const test = require('node:test');
const assert = require('node:assert/strict');
const { Types } = require('mongoose');
const { cleanupOrphanedPings, repairEveryoneRoles } = require('../../src/utils/startup-tasks');

function makePingModel({ distinctIds = [], deletedCount = 0 } = {}) {
    return {
        distinct: async (_field, _query) => distinctIds,
        deleteMany: async (_query) => ({ deletedCount }),
    };
}

function makeChannelModel(existingIds = []) {
    return {
        find: (_query, _projection) => ({
            lean: async () => existingIds.map((id) => ({ _id: id })),
        }),
    };
}

test('cleanupOrphanedPings - no pings at all', async () => {
    let deleteCalled = false;
    const ping = {
        distinct: async () => [],
        deleteMany: async () => { deleteCalled = true; return { deletedCount: 0 }; },
    };
    const channel = makeChannelModel([]);

    await cleanupOrphanedPings(ping, channel);

    assert.equal(deleteCalled, false);
});

test('cleanupOrphanedPings - all referenced channels still exist', async () => {
    const id1 = new Types.ObjectId();
    const id2 = new Types.ObjectId();

    let deletedWith = null;
    const ping = {
        distinct: async () => [id1, id2],
        deleteMany: async (q) => { deletedWith = q; return { deletedCount: 0 }; },
    };
    const channel = makeChannelModel([id1, id2]);

    await cleanupOrphanedPings(ping, channel);

    assert.equal(deletedWith, null);
});

test('cleanupOrphanedPings - some channels deleted (orphans removed)', async () => {
    const liveId = new Types.ObjectId();
    const deadId = new Types.ObjectId();

    let deletedWith = null;
    const ping = {
        distinct: async () => [liveId, deadId],
        deleteMany: async (q) => { deletedWith = q; return { deletedCount: 3 }; },
    };
    const channel = makeChannelModel([liveId]);

    await cleanupOrphanedPings(ping, channel);

    assert.ok(deletedWith, 'deleteMany should have been called');
    assert.equal(deletedWith.channelId.$in.length, 1);
    assert.equal(deletedWith.channelId.$in[0].toString(), deadId.toString());
});

test('cleanupOrphanedPings - all channels deleted (all pings orphaned)', async () => {
    const dead1 = new Types.ObjectId();
    const dead2 = new Types.ObjectId();

    let deletedWith = null;
    const ping = {
        distinct: async () => [dead1, dead2],
        deleteMany: async (q) => { deletedWith = q; return { deletedCount: 7 }; },
    };
    const channel = makeChannelModel([]);

    await cleanupOrphanedPings(ping, channel);

    assert.ok(deletedWith);
    assert.equal(deletedWith.channelId.$in.length, 2);
});

test('cleanupOrphanedPings - error is caught and does not throw', async () => {
    const ping = {
        distinct: async () => { throw new Error('DB is down'); },
        deleteMany: async () => ({ deletedCount: 0 }),
    };
    const channel = makeChannelModel([]);

    await assert.doesNotReject(() => cleanupOrphanedPings(ping, channel));
});

// ─── Helpers for repairEveryoneRoles ────────────────────────────────────────

function makeRoleModel(everyoneRoles = []) {
    return {
        find: (_query, _projection) => ({
            lean: async () => everyoneRoles,
        }),
    };
}

function makeMemberModel(modifiedCount = 0) {
    const calls = [];
    return {
        calls,
        updateMany: async (filter, update) => {
            calls.push({ filter, update });
            return { modifiedCount };
        },
    };
}

// ─── Tests for repairEveryoneRoles ──────────────────────────────────────────

test('repairEveryoneRoles - no @everyone roles found anywhere', async () => {
    const role = makeRoleModel([]);
    const member = makeMemberModel(0);

    await repairEveryoneRoles(role, member);

    assert.equal(member.calls.length, 0, 'should not call updateMany if no roles exist');
});

test('repairEveryoneRoles - all members already have the role', async () => {
    const r1 = { _id: new Types.ObjectId(), serverId: new Types.ObjectId() };
    const r2 = { _id: new Types.ObjectId(), serverId: new Types.ObjectId() };

    const role = makeRoleModel([r1, r2]);
    const member = makeMemberModel(0); // 0 modified

    await repairEveryoneRoles(role, member);

    assert.equal(member.calls.length, 2, 'should query each server once');

    // Verify query format
    assert.deepEqual(member.calls[0].filter, {
        serverId: r1.serverId,
        roles: { $ne: r1._id }
    });
    assert.deepEqual(member.calls[0].update, {
        $addToSet: { roles: r1._id }
    });
});

test('repairEveryoneRoles - fixes members across multiple servers', async () => {
    const r1 = { _id: new Types.ObjectId(), serverId: new Types.ObjectId() };
    const r2 = { _id: new Types.ObjectId(), serverId: new Types.ObjectId() };

    const role = makeRoleModel([r1, r2]);

    let callIndex = 0;
    const member = {
        calls: [],
        updateMany: async (filter, update) => {
            member.calls.push({ filter, update });
            // Simulate 5 fixed in server 1, 3 fixed in server 2
            const modifiedCount = callIndex === 0 ? 5 : 3;
            callIndex++;
            return { modifiedCount };
        }
    };

    await repairEveryoneRoles(role, member);

    assert.equal(member.calls.length, 2);
});

test('repairEveryoneRoles - catches and logs errors without throwing', async () => {
    const brokenRole = {
        find: () => ({ lean: async () => { throw new Error('DB is down'); } })
    };
    const member = makeMemberModel(0);

    // Must not throw
    await assert.doesNotReject(() => repairEveryoneRoles(brokenRole, member));
});
