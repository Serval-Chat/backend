const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const { setup, teardown, getApp } = require('./setup.cjs');
const { clearDatabase, createTestUser, generateAuthToken } = require('./helpers.cjs');
const { User } = require('../../src/models/User');
const { TotpUsedCode } = require('../../src/models/TotpUsedCode');
const {
    decryptSecret,
    hashRecoveryCode,
} = require('../../src/utils/totp');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
    const normalized = input.toUpperCase().replace(/=+$/g, '');
    let bits = 0;
    let value = 0;
    const output = [];
    for (const char of normalized) {
        const idx = BASE32_ALPHABET.indexOf(char);
        if (idx === -1) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            output.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}

function generateTotp(secretBase32, windowOffset = 0) {
    const stepSeconds = 30;
    const counter = Math.floor(Date.now() / 1000 / stepSeconds) + windowOffset;
    const secret = base32Decode(secretBase32);

    const counterBuf = Buffer.alloc(8);
    const high = Math.floor(counter / 0x100000000);
    const low = counter >>> 0;
    counterBuf.writeUInt32BE(high, 0);
    counterBuf.writeUInt32BE(low, 4);

    const hmac = crypto.createHmac('sha1', secret).update(counterBuf).digest();
    const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
    const binary =
        (((hmac[offset] ?? 0) & 0x7f) << 24) |
        (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
        (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
        ((hmac[offset + 3] ?? 0) & 0xff);

    return String(binary % 1_000_000).padStart(6, '0');
}

async function createAuthUser(overrides = {}) {
    return createTestUser({
        password: 'password123',
        ...overrides,
    });
}

async function setupEnrollment(app, user) {
    const token = generateAuthToken(user);
    const setupRes = await request(app)
        .post('/api/v1/auth/2fa/setup')
        .set('Authorization', `Bearer ${token}`)
        .send({});

    assert.equal(setupRes.status, 201);
    const dbUser = await User.findById(user._id).lean();
    const secret = decryptSecret(dbUser.totpSecret);
    const code = generateTotp(secret, 0);

    const confirmRes = await request(app)
        .post('/api/v1/auth/2fa/setup/confirm')
        .set('Authorization', `Bearer ${token}`)
        .send({ code });

    assert.equal(confirmRes.status, 201);
    return {
        token,
        secret,
        backupCodes: confirmRes.body.backupCodes,
    };
}

describe('TOTP 2FA Integration Tests', () => {
    let app;

    before(async () => {
        await setup();
        app = getApp();
    });

    after(async () => {
        await teardown();
    });

    beforeEach(async () => {
        await clearDatabase();
    });

    describe('Enrollment', () => {
        test('generates a valid otpauth URI with issuer and account name', async () => {
            const user = await createAuthUser();
            const token = generateAuthToken(user);

            const res = await request(app)
                .post('/api/v1/auth/2fa/setup')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            assert.equal(res.status, 201);
            assert.match(res.body.otpauthUri, /^otpauth:\/\/totp\//);

            const uri = new URL(res.body.otpauthUri);
            assert.equal(uri.protocol, 'otpauth:');
            assert.equal(uri.host, 'totp');
            assert.equal(uri.searchParams.get('issuer'), 'Serchat');
            assert.match(decodeURIComponent(uri.pathname), /Serchat:/);
            assert.match(decodeURIComponent(uri.pathname), new RegExp(user.username));
        });

        test('valid first code enables 2FA, invalid code does not', async () => {
            const user = await createAuthUser();
            const token = generateAuthToken(user);

            await request(app)
                .post('/api/v1/auth/2fa/setup')
                .set('Authorization', `Bearer ${token}`)
                .send({});

            const dbUser = await User.findById(user._id).lean();
            const secret = decryptSecret(dbUser.totpSecret);

            const invalidRes = await request(app)
                .post('/api/v1/auth/2fa/setup/confirm')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: '000000' });
            assert.equal(invalidRes.status, 400);

            const afterInvalid = await User.findById(user._id).lean();
            assert.equal(afterInvalid.totpEnabled, false);

            const validRes = await request(app)
                .post('/api/v1/auth/2fa/setup/confirm')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: generateTotp(secret, 0) });

            assert.equal(validRes.status, 201);
            const afterValid = await User.findById(user._id).lean();
            assert.equal(afterValid.totpEnabled, true);
            assert.ok(afterValid.totpVerifiedAt);
        });

        test('enrolling twice overwrites old secret and backup codes are hashed', async () => {
            const user = await createAuthUser();
            const token = generateAuthToken(user);

            const first = await request(app)
                .post('/api/v1/auth/2fa/setup')
                .set('Authorization', `Bearer ${token}`)
                .send({});
            assert.equal(first.status, 201);
            const firstSecretPayload = (await User.findById(user._id).lean()).totpSecret;

            const second = await request(app)
                .post('/api/v1/auth/2fa/setup')
                .set('Authorization', `Bearer ${token}`)
                .send({});
            assert.equal(second.status, 201);
            const secondUser = await User.findById(user._id).lean();
            assert.notEqual(secondUser.totpSecret, firstSecretPayload);

            const secondSecret = decryptSecret(secondUser.totpSecret);
            const confirm = await request(app)
                .post('/api/v1/auth/2fa/setup/confirm')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: generateTotp(secondSecret, 0) });

            assert.equal(confirm.status, 201);
            assert.equal(confirm.body.backupCodes.length, 10);

            const storedUser = await User.findById(user._id).lean();
            assert.equal(storedUser.backupCodes.length, 10);
            for (const plain of confirm.body.backupCodes) {
                assert.ok(!storedUser.backupCodes.includes(plain));
            }
        });

        test('backup codes are returned once after enrollment and not on profile', async () => {
            const user = await createAuthUser();
            const { token, backupCodes } = await setupEnrollment(app, user);
            assert.equal(backupCodes.length, 10);

            const meRes = await request(app)
                .get('/api/v1/profile/me')
                .set('Authorization', `Bearer ${token}`);

            assert.equal(meRes.status, 200);
            assert.equal(typeof meRes.body.backupCodes, 'undefined');
        });
    });

    describe('Login Flow', () => {
        test('totp disabled login returns full token directly', async () => {
            const user = await createAuthUser();
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });

            assert.equal(res.status, 200);
            assert.ok(res.body.token);
            assert.equal(typeof res.body.temp_token, 'undefined');
            assert.equal(res.body.two_factor_required, undefined);
        });

        test('totp enabled login returns temp_token and no full token', async () => {
            const user = await createAuthUser();
            await setupEnrollment(app, user);

            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });

            assert.equal(res.status, 200);
            assert.ok(res.body.temp_token);
            assert.equal(res.body.two_factor_required, true);
            assert.equal(typeof res.body.token, 'undefined');
        });

        test('temp_token expires in 5 minutes and is rejected on non-verify endpoints', async () => {
            const user = await createAuthUser();
            await setupEnrollment(app, user);

            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });

            const decoded = jwt.decode(loginRes.body.temp_token);
            assert.equal(decoded.exp - decoded.iat, 300);

            const meRes = await request(app)
                .get('/api/v1/profile/me')
                .set('Authorization', `Bearer ${loginRes.body.temp_token}`);
            assert.equal(meRes.status, 401);
        });

        test('valid temp_token + TOTP returns full token; expired/no temp_token is rejected', async () => {
            const user = await createAuthUser();
            const { secret } = await setupEnrollment(app, user);

            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });
            const tempToken = loginRes.body.temp_token;

            const okRes = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken,
                code: generateTotp(secret, 0),
            });
            assert.equal(okRes.status, 200);
            assert.ok(okRes.body.token);
            assert.equal(typeof okRes.body.temp_token, 'undefined');

            const expiredTemp = jwt.sign(
                {
                    id: user._id.toString(),
                    login: user.login,
                    username: user.username,
                    tokenVersion: 0,
                    type: '2fa_temp',
                    scope: 'auth:2fa:verify',
                    exp: Math.floor(Date.now() / 1000) - 10,
                },
                process.env.JWT_SECRET || 'test-jwt-secret',
            );

            const expiredRes = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: expiredTemp,
                code: generateTotp(secret, 0),
            });
            assert.equal(expiredRes.status, 401);

            const noTempRes = await request(app).post('/api/v1/auth/2fa/verify').send({
                code: generateTotp(secret, 0),
            });
            assert.equal(noTempRes.status, 400);
        });
    });

    describe('Code Validation and Replay', () => {
        test('accepts current, -1, +1 windows; rejects -2 and replay', async () => {
            const user = await createAuthUser();
            const { secret } = await setupEnrollment(app, user);

            const attempt = async (code) => {
                const loginRes = await request(app)
                    .post('/api/v1/auth/login')
                    .send({ login: user.login, password: 'password123' });
                return request(app).post('/api/v1/auth/2fa/verify').send({
                    tempToken: loginRes.body.temp_token,
                    code,
                });
            };

            assert.equal((await attempt(generateTotp(secret, 0))).status, 200);
            assert.equal((await attempt(generateTotp(secret, -1))).status, 200);
            assert.equal((await attempt(generateTotp(secret, 1))).status, 200);
            assert.equal((await attempt(generateTotp(secret, -2))).status, 400);

            const replayUser = await createAuthUser();
            const { secret: replaySecret } = await setupEnrollment(app, replayUser);
            const replayLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: replayUser.login, password: 'password123' });
            const replayCode = generateTotp(replaySecret, 0);
            const first = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: replayLogin.body.temp_token,
                code: replayCode,
            });
            assert.equal(first.status, 200);

            const second = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: replayLogin.body.temp_token,
                code: replayCode,
            });
            assert.equal(second.status, 400);
        });
    });

    describe('Backup Codes', () => {
        test('valid backup accepted once; invalid rejected; regenerate invalidates old', async () => {
            const user = await createAuthUser();
            const { token, backupCodes, secret } = await setupEnrollment(app, user);

            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });
            const backup = backupCodes[0];

            const first = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: loginRes.body.temp_token,
                backupCode: backup,
            });
            assert.equal(first.status, 200);

            const secondLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });
            const second = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: secondLogin.body.temp_token,
                backupCode: backup,
            });
            assert.equal(second.status, 400);

            const invalid = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: secondLogin.body.temp_token,
                backupCode: 'ZZZZ-ZZZZ',
            });
            assert.equal(invalid.status, 400);

            const regen = await request(app)
                .post('/api/v1/auth/2fa/backup-codes/regenerate')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: generateTotp(secret, 0) });
            assert.equal(regen.status, 201);
            assert.equal(regen.body.backupCodes.length, 10);

            const thirdLogin = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });
            const oldAfterRegen = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: thirdLogin.body.temp_token,
                backupCode: backupCodes[1],
            });
            assert.equal(oldAfterRegen.status, 400);
        });

        test('regenerating backup codes requires valid TOTP code', async () => {
            const user = await createAuthUser();
            const { token } = await setupEnrollment(app, user);

            const regen = await request(app)
                .post('/api/v1/auth/2fa/backup-codes/regenerate')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: '000000' });
            assert.equal(regen.status, 400);
        });
    });

    describe('Rate Limiting and Lockout', () => {
        test('5 failed attempts lock endpoint for user, lockout is per-user, unlock allows attempts', async () => {
            const userA = await createAuthUser();
            const userB = await createAuthUser();
            const { secret: secretA } = await setupEnrollment(app, userA);
            const { secret: secretB } = await setupEnrollment(app, userB);

            const loginA = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: userA.login, password: 'password123' });
            const tempA = loginA.body.temp_token;

            for (let i = 0; i < 5; i++) {
                const bad = await request(app).post('/api/v1/auth/2fa/verify').send({
                    tempToken: tempA,
                    code: '000000',
                });
                assert.equal(bad.status, 400);
            }

            const lockedValid = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: tempA,
                code: generateTotp(secretA, 0),
            });
            assert.equal(lockedValid.status, 429);

            const loginB = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: userB.login, password: 'password123' });
            const userBValid = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: loginB.body.temp_token,
                code: generateTotp(secretB, 0),
            });
            assert.equal(userBValid.status, 200);

            await User.updateOne(
                { _id: userA._id },
                { $set: { totpLockedUntil: new Date(Date.now() - 1_000) } },
            );

            const afterUnlock = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: tempA,
                code: generateTotp(secretA, 0),
            });
            assert.equal(afterUnlock.status, 200);
        });
    });

    describe('Disabling 2FA', () => {
        test('disable works with valid TOTP and backup code; invalid code rejected', async () => {
            const user = await createAuthUser();
            const { token, secret, backupCodes } = await setupEnrollment(app, user);

            const invalid = await request(app)
                .post('/api/v1/auth/2fa/disable')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: '000000' });
            assert.equal(invalid.status, 400);

            const okTotp = await request(app)
                .post('/api/v1/auth/2fa/disable')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: generateTotp(secret, 0) });
            assert.equal(okTotp.status, 201);

            let dbUser = await User.findById(user._id).lean();
            assert.equal(dbUser.totpEnabled, false);
            assert.equal(dbUser.totpSecret, null);
            assert.deepEqual(dbUser.backupCodes, []);

            const user2 = await createAuthUser({
                username: 'other_user',
                login: 'other@example.com',
            });
            const token2 = generateAuthToken(user2);
            const enrollment2 = await setupEnrollment(app, user2);

            const okBackup = await request(app)
                .post('/api/v1/auth/2fa/disable')
                .set('Authorization', `Bearer ${token2}`)
                .send({ backupCode: enrollment2.backupCodes[0] });
            assert.equal(okBackup.status, 201);
        });

        test('after disabling, login no longer requires 2FA step', async () => {
            const user = await createAuthUser();
            const { token, secret } = await setupEnrollment(app, user);

            await request(app)
                .post('/api/v1/auth/2fa/disable')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: generateTotp(secret, 0) });

            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });
            assert.equal(loginRes.status, 200);
            assert.ok(loginRes.body.token);
            assert.equal(typeof loginRes.body.temp_token, 'undefined');
        });
    });

    describe('Security', () => {
        test('totp_secret is encrypted at rest and backup codes never returned after initial enrollment', async () => {
            const user = await createAuthUser();
            const { token, backupCodes } = await setupEnrollment(app, user);

            const dbUser = await User.findById(user._id).lean();
            assert.ok(dbUser.totpSecret);
            assert.ok(!dbUser.totpSecret.includes('otpauth://'));
            assert.ok(!dbUser.totpSecret.includes(user.username));
            assert.ok(dbUser.totpSecret.includes('.'));

            const regen = await request(app)
                .post('/api/v1/auth/2fa/backup-codes/regenerate')
                .set('Authorization', `Bearer ${token}`)
                .send({ code: '000000' });
            assert.equal(regen.status, 400);

            const me = await request(app)
                .get('/api/v1/profile/me')
                .set('Authorization', `Bearer ${token}`);
            assert.equal(me.status, 200);
            assert.equal(typeof me.body.backupCodes, 'undefined');

            const stored = await User.findById(user._id).lean();
            assert.notDeepEqual(stored.backupCodes, backupCodes);
            assert.match(stored.backupCodes[0], /^[a-f0-9]{64}$/i);
        });

        test('temp token from one user cannot verify another users TOTP', async () => {
            const userA = await createAuthUser();
            const userB = await createAuthUser();
            const { secret: secretA } = await setupEnrollment(app, userA);
            const { secret: secretB } = await setupEnrollment(app, userB);

            const loginA = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: userA.login, password: 'password123' });

            const misuse = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: loginA.body.temp_token,
                code: generateTotp(secretB, 0),
            });
            assert.equal(misuse.status, 400);

            const legit = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: loginA.body.temp_token,
                code: generateTotp(secretA, 0),
            });
            assert.equal(legit.status, 200);
        });

        test('totp and backup codes are not echoed in auth error responses', async () => {
            const user = await createAuthUser();
            const { backupCodes } = await setupEnrollment(app, user);
            const loginRes = await request(app)
                .post('/api/v1/auth/login')
                .send({ login: user.login, password: 'password123' });

            const sentCode = '123456';
            const sentBackup = backupCodes[0];

            const badCodeRes = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: loginRes.body.temp_token,
                code: sentCode,
            });
            assert.equal(badCodeRes.status >= 400, true);
            assert.equal(JSON.stringify(badCodeRes.body).includes(sentCode), false);

            const badBackupRes = await request(app).post('/api/v1/auth/2fa/verify').send({
                tempToken: loginRes.body.temp_token,
                backupCode: `${sentBackup.slice(0, 4)}-XXXX`,
            });
            assert.equal(badBackupRes.status >= 400, true);
            assert.equal(JSON.stringify(badBackupRes.body).includes(sentBackup), false);
        });
    });

    test('replay protection records used code entries', async () => {
        const user = await createAuthUser();
        const { secret } = await setupEnrollment(app, user);
        const loginRes = await request(app)
            .post('/api/v1/auth/login')
            .send({ login: user.login, password: 'password123' });
        const code = generateTotp(secret, 0);

        const ok = await request(app).post('/api/v1/auth/2fa/verify').send({
            tempToken: loginRes.body.temp_token,
            code,
        });
        assert.equal(ok.status, 200);

        const usedEntries = await TotpUsedCode.find({ userId: user._id }).lean();
        assert.ok(usedEntries.length >= 1);
        const expectedHash = hashRecoveryCode(
            `totp:${Math.floor(Date.now() / 1000 / 30)}`,
        );
        assert.ok(
            usedEntries.some((x) => typeof x.code === 'string' && x.code.length === 64) ||
                usedEntries.some((x) => x.code === expectedHash),
        );
    });
});

