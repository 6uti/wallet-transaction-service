import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import {
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransactionsService } from '../../src/transactions/transactions.service';
import { Transaction, TransactionType, TransactionStatus } from '../../src/transactions/entities/transaction.entity';
import { Wallet, WalletStatus, Currency } from '../../src/wallets/entities/wallet.entity';
import { AuditService } from '../../src/common/audit/audit.service';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service';

// ── Factories ──────────────────────────────────────────────────────────────

function makeWallet(overrides: Partial<Wallet> = {}): Wallet {
  const w = new Wallet();
  w.id = 'wal_001';
  w.ownerId = 'usr_001';
  w.ownerName = 'Alice';
  w.currency = Currency.PEN;
  w.status = WalletStatus.ACTIVE;
  w.balance = '1500.00';
  w.createdAt = new Date();
  w.updatedAt = new Date();
  return Object.assign(w, overrides);
}

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  const t = new Transaction();
  t.id = 'txn_001';
  t.walletId = 'wal_001';
  t.relatedWalletId = null;
  t.type = TransactionType.DEBIT;
  t.amount = '25.50';
  t.currency = 'PEN';
  t.status = TransactionStatus.COMPLETED;
  t.description = 'Test';
  t.externalReference = null;
  t.reversalOf = null;
  t.reversedBy = null;
  t.metadata = null;
  t.createdAt = new Date();
  t.updatedAt = new Date();
  return Object.assign(t, overrides);
}

// ── Mocks ──────────────────────────────────────────────────────────────────

const managerMock = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  getRepository: jest.fn().mockReturnValue({ save: jest.fn() }),
};

const dataSourceMock = {
  transaction: jest.fn((fn: (m: typeof managerMock) => Promise<unknown>) => fn(managerMock)),
} as unknown as DataSource;

const txnRepoMock = { findOne: jest.fn() };
const walletRepoMock = {};
const auditServiceMock = { log: jest.fn().mockResolvedValue(undefined) };
const idempotencyServiceMock = {
  checkOrThrow: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockResolvedValue(undefined),
};

// ── Suite ──────────────────────────────────────────────────────────────────

describe('TransactionsService', () => {
  let service: TransactionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: getRepositoryToken(Transaction), useValue: txnRepoMock },
        { provide: getRepositoryToken(Wallet), useValue: walletRepoMock },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: IdempotencyService, useValue: idempotencyServiceMock },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);

    jest.clearAllMocks();
    idempotencyServiceMock.checkOrThrow.mockResolvedValue(null);
    idempotencyServiceMock.save.mockResolvedValue(undefined);
    auditServiceMock.log.mockResolvedValue(undefined);
    (dataSourceMock.transaction as jest.Mock).mockImplementation(
      (fn: (m: typeof managerMock) => Promise<unknown>) => fn(managerMock),
    );
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns formatted transaction when found', async () => {
      txnRepoMock.findOne.mockResolvedValue(makeTransaction());
      const result = await service.findById('txn_001');
      expect(result.transactionId).toBe('txn_001');
      expect(result.status).toBe(TransactionStatus.COMPLETED);
    });

    it('throws NotFoundException when transaction does not exist', async () => {
      txnRepoMock.findOne.mockResolvedValue(null);
      await expect(service.findById('txn_999')).rejects.toThrow(NotFoundException);
    });

    it('formatted response never exposes internal entity fields', async () => {
      txnRepoMock.findOne.mockResolvedValue(makeTransaction());
      const result = await service.findById('txn_001');
      expect(result).not.toHaveProperty('wallet');
      expect(result).not.toHaveProperty('metadata');
    });
  });

  // ── createTransaction ─────────────────────────────────────────────────────

  describe('createTransaction', () => {
    const debitDto = {
      walletId: 'wal_001',
      type: TransactionType.DEBIT as TransactionType.DEBIT,
      amount: '25.50',
      currency: Currency.PEN,
      description: 'Test debit',
    };

    it('returns cached response on repeated idempotency key — no DB call made', async () => {
      const cached = { transactionId: 'txn_001', status: 'COMPLETED' };
      idempotencyServiceMock.checkOrThrow.mockResolvedValue({ responseBody: cached });

      const result = await service.createTransaction(debitDto, 'idem_001', 'usr_001');
      expect(result).toEqual(cached);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });

    it('throws 422 when wallet status is BLOCKED', async () => {
      managerMock.findOne.mockResolvedValue(makeWallet({ status: WalletStatus.BLOCKED }));
      await expect(
        service.createTransaction(debitDto, 'idem_002', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when wallet status is CLOSED', async () => {
      managerMock.findOne.mockResolvedValue(makeWallet({ status: WalletStatus.CLOSED }));
      await expect(
        service.createTransaction(debitDto, 'idem_003', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 on insufficient balance for DEBIT', async () => {
      managerMock.findOne.mockResolvedValue(makeWallet({ balance: '10.00' }));
      await expect(
        service.createTransaction({ ...debitDto, amount: '999.00' }, 'idem_004', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 on currency mismatch', async () => {
      managerMock.findOne.mockResolvedValue(makeWallet({ currency: Currency.USD }));
      await expect(
        service.createTransaction(debitDto, 'idem_005', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 404 when wallet does not exist', async () => {
      managerMock.findOne.mockResolvedValue(null);
      await expect(
        service.createTransaction(debitDto, 'idem_006', 'usr_001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('CREDIT succeeds even with zero balance', async () => {
      const wallet = makeWallet({ balance: '0.00' });
      const txn = makeTransaction({ type: TransactionType.CREDIT });
      managerMock.findOne.mockResolvedValue(wallet);
      managerMock.create.mockReturnValue(txn);
      managerMock.save.mockResolvedValue(txn);

      const creditDto = { ...debitDto, type: TransactionType.CREDIT as TransactionType.CREDIT };
      const result = await service.createTransaction(creditDto, 'idem_007', 'usr_001');
      expect(result).toBeDefined();
      expect(result.transactionId).toBe('txn_001');
    });

    it('exact balance debit is allowed (boundary)', async () => {
      const wallet = makeWallet({ balance: '25.50' });
      const txn = makeTransaction();
      managerMock.findOne.mockResolvedValue(wallet);
      managerMock.create.mockReturnValue(txn);
      managerMock.save.mockResolvedValue(txn);

      const result = await service.createTransaction(debitDto, 'idem_008', 'usr_001');
      expect(result).toBeDefined();
    });
  });

  // ── reverseTransaction ────────────────────────────────────────────────────

  describe('reverseTransaction', () => {
    const reversalDto = { reason: 'Test reversal', externalReference: 'rev_001' };

    it('throws NotFoundException when original transaction not found', async () => {
      managerMock.findOne.mockResolvedValue(null);
      await expect(
        service.reverseTransaction('txn_999', reversalDto, 'idem_rev_001', 'usr_001'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 422 when transaction already has reversedBy set', async () => {
      managerMock.findOne.mockResolvedValue(
        makeTransaction({ reversedBy: 'txn_rev_001' }),
      );
      await expect(
        service.reverseTransaction('txn_001', reversalDto, 'idem_rev_002', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when transaction status is REVERSED', async () => {
      managerMock.findOne.mockResolvedValue(
        makeTransaction({ status: TransactionStatus.REVERSED }),
      );
      await expect(
        service.reverseTransaction('txn_001', reversalDto, 'idem_rev_003', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when transaction is not COMPLETED', async () => {
      managerMock.findOne.mockResolvedValue(
        makeTransaction({ status: TransactionStatus.PENDING }),
      );
      await expect(
        service.reverseTransaction('txn_001', reversalDto, 'idem_rev_004', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when trying to reverse a TRANSFER_DEBIT type', async () => {
      managerMock.findOne.mockResolvedValue(
        makeTransaction({ type: TransactionType.TRANSFER_DEBIT }),
      );
      await expect(
        service.reverseTransaction('txn_001', reversalDto, 'idem_rev_005', 'usr_001'),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('successfully reverses a DEBIT — restores funds to wallet', async () => {
      const original = makeTransaction({ type: TransactionType.DEBIT, amount: '100.00' });
      const wallet = makeWallet({ balance: '900.00' });
      const reversalTxn = makeTransaction({ id: 'txn_rev_001', type: TransactionType.REVERSAL });

      managerMock.findOne
        .mockResolvedValueOnce(original)
        .mockResolvedValueOnce(wallet);
      managerMock.create.mockReturnValue(reversalTxn);
      managerMock.save.mockResolvedValue(reversalTxn);

      const result = await service.reverseTransaction('txn_001', reversalDto, 'idem_rev_006', 'usr_001');
      expect(result.transactionId).toBe('txn_rev_001');
    });

    it('returns cached response on repeated idempotency key', async () => {
      const cached = { transactionId: 'txn_rev_001' };
      idempotencyServiceMock.checkOrThrow.mockResolvedValue({ responseBody: cached });

      const result = await service.reverseTransaction('txn_001', reversalDto, 'idem_rev_007', 'usr_001');
      expect(result).toEqual(cached);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });
  });

  // ── transfer ──────────────────────────────────────────────────────────────

  describe('transfer', () => {
    const transferDto = {
      sourceWalletId: 'wal_001',
      targetWalletId: 'wal_002',
      amount: '100.00',
      currency: Currency.PEN,
      description: 'Test transfer',
    };

    it('throws BadRequestException when source equals target wallet', async () => {
      await expect(
        service.transfer({ ...transferDto, targetWalletId: 'wal_001' }, 'idem_tr_001', 'usr_001'),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns cached response on repeated idempotency key', async () => {
      const cached = { debitTransaction: {}, creditTransaction: {} };
      idempotencyServiceMock.checkOrThrow.mockResolvedValue({ responseBody: cached });

      const result = await service.transfer(transferDto, 'idem_tr_002', 'usr_001');
      expect(result).toEqual(cached);
      expect(dataSourceMock.transaction).not.toHaveBeenCalled();
    });
  });
});
