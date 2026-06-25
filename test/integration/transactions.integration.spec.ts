/**
 * Integration tests — requieren PostgreSQL corriendo.
 *
 * En local (fuera de Docker):
 *   docker compose up postgres -d
 *   npm run test:integration
 *
 * Dentro de Docker (CI):
 *   TEST_BASE_URL=http://localhost:3000 npm run test:integration
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { Response } from 'supertest';
import { AppModule } from '../../src/app.module';
import { HttpExceptionFilter } from '../../src/common/exceptions/http-exception.filter';

// Timeout generoso para que NestJS conecte a la DB
const TIMEOUT = 30000;

describe('Wallet Transaction Service — Integration Tests', () => {
  let app: INestApplication;
  let jwtToken: string;

  beforeAll(async () => {
    if (process.env.TEST_BASE_URL) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, TIMEOUT);

  afterAll(async () => {
    if (app) await app.close();
  }, TIMEOUT);

  const req = () => app ? request(app.getHttpServer()) : request(process.env.TEST_BASE_URL ?? "http://localhost:3000");

  // ── Auth ───────────────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns JWT token with valid credentials', async () => {
      const res = await req()
        .post('/auth/login')
        .send({ username: 'senior.backend', password: 'Password123' })
        .expect(200);

      expect(res.body.token).toBeDefined();
      expect(res.body.expiresIn).toBe(3600);
      jwtToken = res.body.token as string;
    }, TIMEOUT);

    it('returns 401 with invalid credentials', async () => {
      await req()
        .post('/auth/login')
        .send({ username: 'hacker', password: 'wrongpassword' })
        .expect(401);
    }, TIMEOUT);

    it('does not expose stack trace on error', async () => {
      const res = await req()
        .post('/auth/login')
        .send({ username: 'hacker', password: 'wrongpassword' })
        .expect(401);

      expect(res.body.stack).toBeUndefined();
    }, TIMEOUT);
  });

  // ── Health ─────────────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('returns ok', async () => {
      const res = await req().get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    }, TIMEOUT);
  });

  // ── Balance ────────────────────────────────────────────────────────────────

  describe('GET /wallets/:walletId/balance', () => {
    beforeAll(async () => {
      if (!jwtToken) {
        const res = await req()
          .post('/auth/login')
          .send({ username: 'senior.backend', password: 'Password123' });
        jwtToken = res.body.token as string;
      }
    }, TIMEOUT);

    it('returns balance for existing wallet', async () => {
      const res = await req()
        .get('/wallets/wal_001/balance')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.walletId).toBe('wal_001');
      expect(res.body.currency).toBe('PEN');
      expect(parseFloat(res.body.availableBalance as string)).toBeGreaterThan(0);
    }, TIMEOUT);

    it('returns 404 for non-existent wallet', async () => {
      await req()
        .get('/wallets/wal_999/balance')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    }, TIMEOUT);

    it('returns 401 without token', async () => {
      await req().get('/wallets/wal_001/balance').expect(401);
    }, TIMEOUT);
  });

  // ── Movements ──────────────────────────────────────────────────────────────

  describe('GET /wallets/:walletId/movements', () => {
    it('returns paginated movements', async () => {
      const res = await req()
        .get('/wallets/wal_001/movements?type=ALL&status=COMPLETED&page=1&pageSize=20')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(res.body.walletId).toBe('wal_001');
      expect(Array.isArray(res.body.movements)).toBe(true);
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('totalPages');
    }, TIMEOUT);
  });

  // ── Transactions — Happy Path ──────────────────────────────────────────────

  describe('POST /transactions — happy path', () => {
    const idempKey = () => `test-${Date.now()}-${Math.random()}`;

    it('CREDIT: increases balance', async () => {
      const balanceBefore = await req()
        .get('/wallets/wal_002/balance')
        .set('Authorization', `Bearer ${jwtToken}`)
        .then((r: Response) => parseFloat(r.body.availableBalance as string));

      await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({
          walletId: 'wal_002',
          type: 'CREDIT',
          amount: '50.00',
          currency: 'PEN',
          description: 'Recarga de saldo',
          externalReference: 'rec_123456',
        })
        .expect(201);

      const balanceAfter = await req()
        .get('/wallets/wal_002/balance')
        .set('Authorization', `Bearer ${jwtToken}`)
        .then((r: Response) => parseFloat(r.body.availableBalance as string));

      expect(balanceAfter).toBeCloseTo(balanceBefore + 50, 2);
    }, TIMEOUT);

    it('DEBIT: decreases balance', async () => {
      const balanceBefore = await req()
        .get('/wallets/wal_001/balance')
        .set('Authorization', `Bearer ${jwtToken}`)
        .then((r: Response) => parseFloat(r.body.availableBalance as string));

      const res = await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({
          walletId: 'wal_001',
          type: 'DEBIT',
          amount: '25.00',
          currency: 'PEN',
          description: 'Pago QR comercio',
          externalReference: 'qr_789456',
        })
        .expect(201);

      expect(res.body.transactionId).toBeDefined();
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.externalReference).toBe('qr_789456');

      const balanceAfter = await req()
        .get('/wallets/wal_001/balance')
        .set('Authorization', `Bearer ${jwtToken}`)
        .then((r: Response) => parseFloat(r.body.availableBalance as string));

      expect(balanceAfter).toBeCloseTo(balanceBefore - 25, 2);
    }, TIMEOUT);

    it('Returns same response on duplicate idempotency key', async () => {
      const key = idempKey();
      const body = {
        walletId: 'wal_001',
        type: 'CREDIT',
        amount: '10.00',
        currency: 'PEN',
        externalReference: 'idem_test_001',
      };

      const res1 = await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      const res2 = await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);

      expect(res1.body.transactionId).toBe(res2.body.transactionId);
    }, TIMEOUT);

    it('Returns 409 when same key is reused with different body', async () => {
      const key = idempKey();

      await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', key)
        .send({ walletId: 'wal_001', type: 'CREDIT', amount: '10.00', currency: 'PEN' })
        .expect(201);

      await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', key)
        .send({ walletId: 'wal_001', type: 'CREDIT', amount: '99.00', currency: 'PEN' })
        .expect(409);
    }, TIMEOUT);
  });

  // ── Edge Cases ─────────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    const idempKey = () => `edge-${Date.now()}-${Math.random()}`;

    it('422 on insufficient balance', async () => {
      await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '9999999.00', currency: 'PEN' })
        .expect(422);
    }, TIMEOUT);

    it('422 on BLOCKED wallet', async () => {
      await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({ walletId: 'wal_003', type: 'CREDIT', amount: '10.00', currency: 'PEN' })
        .expect(422);
    }, TIMEOUT);

    it('404 on non-existent wallet', async () => {
      await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({ walletId: 'wal_999', type: 'CREDIT', amount: '10.00', currency: 'PEN' })
        .expect(404);
    }, TIMEOUT);

    it('422 on currency mismatch (PEN on USD wallet)', async () => {
      await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({ walletId: 'wal_004', type: 'DEBIT', amount: '10.00', currency: 'PEN' })
        .expect(422);
    }, TIMEOUT);

    it('422 when reversing an already-reversed transaction', async () => {
      const txnRes = await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({ walletId: 'wal_001', type: 'DEBIT', amount: '5.00', currency: 'PEN' });

      const txnId = txnRes.body.transactionId as string;

      await req()
        .post(`/transactions/${txnId}/reversal`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({ reason: 'Primera reversa', externalReference: 'rev_001' })
        .expect(201);

      await req()
        .post(`/transactions/${txnId}/reversal`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({ reason: 'Segunda reversa — debe fallar', externalReference: 'rev_002' })
        .expect(422);
    }, TIMEOUT);
  });

  // ── Transfer ───────────────────────────────────────────────────────────────

  describe('POST /transactions/transfer', () => {
    const idempKey = () => `transfer-${Date.now()}-${Math.random()}`;

    it('successful transfer updates both balances atomically', async () => {
      const [bal1Before, bal2Before] = await Promise.all([
        req().get('/wallets/wal_001/balance').set('Authorization', `Bearer ${jwtToken}`)
          .then((r: Response) => parseFloat(r.body.availableBalance as string)),
        req().get('/wallets/wal_002/balance').set('Authorization', `Bearer ${jwtToken}`)
          .then((r: Response) => parseFloat(r.body.availableBalance as string)),
      ]);

      const amount = 50;
      const res = await req()
        .post('/transactions/transfer')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', idempKey())
        .send({
          sourceWalletId: 'wal_001',
          targetWalletId: 'wal_002',
          amount: `${amount}.00`,
          currency: 'PEN',
          description: 'Transferencia entre usuarios',
        })
        .expect(201);

      expect(res.body.debitTransaction).toBeDefined();
      expect(res.body.creditTransaction).toBeDefined();
      expect(res.body.transferredAmount).toBe(`${amount}.00`);

      const [bal1After, bal2After] = await Promise.all([
        req().get('/wallets/wal_001/balance').set('Authorization', `Bearer ${jwtToken}`)
          .then((r: Response) => parseFloat(r.body.availableBalance as string)),
        req().get('/wallets/wal_002/balance').set('Authorization', `Bearer ${jwtToken}`)
          .then((r: Response) => parseFloat(r.body.availableBalance as string)),
      ]);

      expect(bal1After).toBeCloseTo(bal1Before - amount, 2);
      expect(bal2After).toBeCloseTo(bal2Before + amount, 2);
    }, TIMEOUT);
  });

  // ── Transaction Status ─────────────────────────────────────────────────────

  describe('GET /transactions/:id', () => {
    it('returns transaction status', async () => {
      const createRes = await req()
        .post('/transactions')
        .set('Authorization', `Bearer ${jwtToken}`)
        .set('Idempotency-Key', `status-${Date.now()}`)
        .send({
          walletId: 'wal_001',
          type: 'CREDIT',
          amount: '1.00',
          currency: 'PEN',
          externalReference: 'status_test_001',
        });

      const txnId = createRes.body.transactionId as string;

      const statusRes = await req()
        .get(`/transactions/${txnId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200);

      expect(statusRes.body.transactionId).toBe(txnId);
      expect(statusRes.body.status).toBe('COMPLETED');
      expect(statusRes.body.externalReference).toBe('status_test_001');
    }, TIMEOUT);

    it('returns 404 for non-existent transaction', async () => {
      await req()
        .get('/transactions/txn_999_nonexistent')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    }, TIMEOUT);
  });
});
