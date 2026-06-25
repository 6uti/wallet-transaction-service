import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';
import { IdempotencyRecord } from '../../src/common/entities/idempotency-record.entity';

const mockRecord = (overrides: Partial<IdempotencyRecord> = {}): IdempotencyRecord => ({
  id: 'rec_001',
  idempotencyKey: 'key_001',
  requestHash: 'hash_abc',
  responseBody: { transactionId: 'txn_001' },
  httpStatus: 201,
  createdAt: new Date(),
  expiresAt: new Date(Date.now() + 3600000),
  ...overrides,
});

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  const repoMock = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: getRepositoryToken(IdempotencyRecord), useValue: repoMock },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    jest.clearAllMocks();
  });

  describe('hashBody', () => {
    it('produces same hash for same body', () => {
      const body = { walletId: 'wal_001', amount: '25.50' };
      expect(service.hashBody(body)).toBe(service.hashBody(body));
    });

    it('produces different hashes for different bodies', () => {
      const a = { walletId: 'wal_001', amount: '25.50' };
      const b = { walletId: 'wal_001', amount: '30.00' };
      expect(service.hashBody(a)).not.toBe(service.hashBody(b));
    });

    it('hash is a 64-character hex string (SHA-256)', () => {
      const hash = service.hashBody({ foo: 'bar' });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('checkOrThrow', () => {
    it('returns null when key is new', async () => {
      repoMock.findOne.mockResolvedValue(null);
      const result = await service.checkOrThrow('new_key', { amount: '10' });
      expect(result).toBeNull();
    });

    it('returns existing record when key+body match', async () => {
      const body = { amount: '10.00' };
      const hash = service.hashBody(body);
      const record = mockRecord({ idempotencyKey: 'key_001', requestHash: hash });
      repoMock.findOne.mockResolvedValue(record);

      const result = await service.checkOrThrow('key_001', body);
      expect(result).toBe(record);
    });

    it('throws ConflictException when same key used with different body', async () => {
      const originalBody = { amount: '10.00' };
      const newBody = { amount: '99.00' };
      const record = mockRecord({ requestHash: service.hashBody(originalBody) });
      repoMock.findOne.mockResolvedValue(record);

      await expect(service.checkOrThrow('key_001', newBody)).rejects.toThrow(ConflictException);
    });

    it('conflict error message is meaningful', async () => {
      const record = mockRecord({ requestHash: service.hashBody({ a: 1 }) });
      repoMock.findOne.mockResolvedValue(record);

      await expect(service.checkOrThrow('key_001', { a: 2 })).rejects.toThrow(
        'Idempotency key already used with a different request body',
      );
    });
  });

  describe('save', () => {
    it('persists record with correct fields', async () => {
      const record = mockRecord();
      repoMock.create.mockReturnValue(record);
      repoMock.save.mockResolvedValue(record);

      const body = { amount: '50.00' };
      const response = { transactionId: 'txn_001' };
      await service.save('key_001', body, response, 201);

      expect(repoMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: 'key_001',
          requestHash: service.hashBody(body),
          responseBody: response,
          httpStatus: 201,
        }),
      );
      expect(repoMock.save).toHaveBeenCalledWith(record);
    });

    it('sets expiresAt ~24h in the future', async () => {
      const before = Date.now();
      repoMock.create.mockImplementation((data: Partial<IdempotencyRecord>) => data);
      repoMock.save.mockImplementation((v: unknown) => v);

      await service.save('key_x', {}, {}, 200);

      const createCall = repoMock.create.mock.calls[0][0] as { expiresAt: Date };
      const expiresMs = createCall.expiresAt.getTime();
      const expectedMs = before + 24 * 60 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(expectedMs - 1000);
      expect(expiresMs).toBeLessThanOrEqual(expectedMs + 1000);
    });
  });
});
