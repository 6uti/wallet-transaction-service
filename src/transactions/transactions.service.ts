import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

import { Transaction, TransactionType, TransactionStatus } from './entities/transaction.entity';
import { Wallet, WalletStatus } from '../wallets/entities/wallet.entity';
import { AuditService } from '../common/audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReversalDto } from './dto/reversal.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly txnRepo: Repository<Transaction>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private formatTransaction(t: Transaction) {
    return {
      transactionId: t.id,
      walletId: t.walletId,
      relatedWalletId: t.relatedWalletId,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      description: t.description,
      externalReference: t.externalReference,
      reversalOf: t.reversalOf,
      reversedBy: t.reversedBy,
      createdAt: t.createdAt,
    };
  }

  private assertWalletActive(wallet: Wallet): void {
    if (wallet.status !== WalletStatus.ACTIVE) {
      throw new UnprocessableEntityException(
        `Wallet '${wallet.id}' is ${wallet.status} and cannot perform operations`,
      );
    }
  }

  private assertSufficientBalance(wallet: Wallet, amount: Decimal): void {
    const balance = new Decimal(wallet.balance);
    if (balance.lessThan(amount)) {
      throw new UnprocessableEntityException(
        `Insufficient balance. Available: ${wallet.balance}, required: ${amount.toFixed(2)}`,
      );
    }
  }

  private async getWalletOrFail(
    manager: EntityManager,
    walletId: string,
    lockMode: 'pessimistic_write' | 'none' = 'pessimistic_write',
  ): Promise<Wallet> {
    const wallet =
      lockMode === 'pessimistic_write'
        ? await manager.findOne(Wallet, { where: { id: walletId }, lock: { mode: 'pessimistic_write' } })
        : await manager.findOne(Wallet, { where: { id: walletId } });

    if (!wallet) throw new NotFoundException(`Wallet '${walletId}' not found`);
    return wallet;
  }

  // ─── Create Debit / Credit ─────────────────────────────────────────────────

  async createTransaction(
    dto: CreateTransactionDto,
    idempotencyKey: string,
    actorId: string,
  ) {
    // Idempotency check
    const existing = await this.idempotencyService.checkOrThrow(
      idempotencyKey,
      dto as unknown as Record<string, unknown>,
    );
    if (existing) return existing.responseBody;

    const result = await this.dataSource.transaction(async (manager) => {
      const wallet = await this.getWalletOrFail(manager, dto.walletId);
      this.assertWalletActive(wallet);

      const amount = new Decimal(dto.amount);

      if (dto.currency !== wallet.currency) {
        throw new UnprocessableEntityException(
          `Currency mismatch. Wallet currency: ${wallet.currency}, requested: ${dto.currency}`,
        );
      }

      const balanceBefore = wallet.balance;

      if (dto.type === TransactionType.DEBIT) {
        this.assertSufficientBalance(wallet, amount);
        wallet.balance = new Decimal(wallet.balance).minus(amount).toFixed(2);
      } else {
        wallet.balance = new Decimal(wallet.balance).plus(amount).toFixed(2);
      }

      const txn = manager.create(Transaction, {
        id: uuidv4(),
        walletId: wallet.id,
        type: dto.type,
        amount: amount.toFixed(2),
        currency: dto.currency,
        status: TransactionStatus.COMPLETED,
        description: dto.description ?? null,
        externalReference: dto.externalReference ?? null,
      });

      await manager.save(Wallet, wallet);
      const savedTxn = await manager.save(Transaction, txn);

      await this.auditService.log(
        {
          entityType: 'Transaction',
          entityId: savedTxn.id,
          action: dto.type,
          actorId,
          beforeState: { balance: balanceBefore },
          afterState: { balance: wallet.balance },
          metadata: { idempotencyKey },
        },
        manager,
      );

      return this.formatTransaction(savedTxn);
    });

    await this.idempotencyService.save(
      idempotencyKey,
      dto as unknown as Record<string, unknown>,
      result as Record<string, unknown>,
      201,
    );

    return result;
  }

  // ─── Transfer ──────────────────────────────────────────────────────────────

  async transfer(dto: TransferDto, idempotencyKey: string, actorId: string) {
    if (dto.sourceWalletId === dto.targetWalletId) {
      throw new BadRequestException('Source and target wallet must be different');
    }

    const existing = await this.idempotencyService.checkOrThrow(
      idempotencyKey,
      dto as unknown as Record<string, unknown>,
    );
    if (existing) return existing.responseBody;

    const result = await this.dataSource.transaction(async (manager) => {
      // Lock both wallets in consistent order to avoid deadlocks
      const [id1, id2] = [dto.sourceWalletId, dto.targetWalletId].sort();
      await this.getWalletOrFail(manager, id1);
      if (id1 !== id2) await this.getWalletOrFail(manager, id2);

      const source = await this.getWalletOrFail(manager, dto.sourceWalletId);
      const target = await this.getWalletOrFail(manager, dto.targetWalletId);

      this.assertWalletActive(source);
      this.assertWalletActive(target);

      const amount = new Decimal(dto.amount);

      if (dto.currency !== source.currency) {
        throw new UnprocessableEntityException(
          `Currency mismatch on source wallet. Expected: ${source.currency}`,
        );
      }
      if (dto.currency !== target.currency) {
        throw new UnprocessableEntityException(
          `Currency mismatch on target wallet. Expected: ${target.currency}`,
        );
      }

      this.assertSufficientBalance(source, amount);

      const sourceBalanceBefore = source.balance;
      const targetBalanceBefore = target.balance;

      source.balance = new Decimal(source.balance).minus(amount).toFixed(2);
      target.balance = new Decimal(target.balance).plus(amount).toFixed(2);

      const debitTxn = manager.create(Transaction, {
        id: uuidv4(),
        walletId: source.id,
        relatedWalletId: target.id,
        type: TransactionType.TRANSFER_DEBIT,
        amount: amount.toFixed(2),
        currency: dto.currency,
        status: TransactionStatus.COMPLETED,
        description: dto.description ?? 'Transfer debit',
      });

      const creditTxn = manager.create(Transaction, {
        id: uuidv4(),
        walletId: target.id,
        relatedWalletId: source.id,
        type: TransactionType.TRANSFER_CREDIT,
        amount: amount.toFixed(2),
        currency: dto.currency,
        status: TransactionStatus.COMPLETED,
        description: dto.description ?? 'Transfer credit',
      });

      await manager.save(Wallet, source);
      await manager.save(Wallet, target);
      const savedDebit = await manager.save(Transaction, debitTxn);
      const savedCredit = await manager.save(Transaction, creditTxn);

      await this.auditService.log({
        entityType: 'Transfer',
        entityId: savedDebit.id,
        action: 'TRANSFER',
        actorId,
        beforeState: {
          sourceBalance: sourceBalanceBefore,
          targetBalance: targetBalanceBefore,
        },
        afterState: {
          sourceBalance: source.balance,
          targetBalance: target.balance,
        },
        metadata: { idempotencyKey, creditTransactionId: savedCredit.id },
      }, manager);

      return {
        debitTransaction: this.formatTransaction(savedDebit),
        creditTransaction: this.formatTransaction(savedCredit),
        transferredAmount: amount.toFixed(2),
        currency: dto.currency,
      };
    });

    await this.idempotencyService.save(
      idempotencyKey,
      dto as unknown as Record<string, unknown>,
      result as Record<string, unknown>,
      201,
    );

    return result;
  }

  // ─── Reversal ──────────────────────────────────────────────────────────────

  async reverseTransaction(
    transactionId: string,
    dto: ReversalDto,
    idempotencyKey: string,
    actorId: string,
  ) {
    const existing = await this.idempotencyService.checkOrThrow(
      idempotencyKey,
      { transactionId, ...dto } as unknown as Record<string, unknown>,
    );
    if (existing) return existing.responseBody;

    const result = await this.dataSource.transaction(async (manager) => {
      const original = await manager.findOne(Transaction, { where: { id: transactionId } });
      if (!original) throw new NotFoundException(`Transaction '${transactionId}' not found`);

      if (original.isReversed()) {
        throw new UnprocessableEntityException(
          `Transaction '${transactionId}' has already been reversed`,
        );
      }

      if (original.status !== TransactionStatus.COMPLETED) {
        throw new UnprocessableEntityException(
          `Only COMPLETED transactions can be reversed. Current status: ${original.status}`,
        );
      }

      // Reversal is only supported for DEBIT and CREDIT
      if (![TransactionType.DEBIT, TransactionType.CREDIT].includes(original.type)) {
        throw new UnprocessableEntityException(
          `Transaction type '${original.type}' cannot be directly reversed. Reverse individual legs instead.`,
        );
      }

      const wallet = await this.getWalletOrFail(manager, original.walletId);
      this.assertWalletActive(wallet);

      const amount = new Decimal(original.amount);
      const balanceBefore = wallet.balance;

      // Reverse the balance impact
      if (original.type === TransactionType.DEBIT) {
        wallet.balance = new Decimal(wallet.balance).plus(amount).toFixed(2);
      } else {
        this.assertSufficientBalance(wallet, amount);
        wallet.balance = new Decimal(wallet.balance).minus(amount).toFixed(2);
      }

      const reversalTxn = manager.create(Transaction, {
        id: uuidv4(),
        walletId: original.walletId,
        type: TransactionType.REVERSAL,
        amount: amount.toFixed(2),
        currency: original.currency,
        status: TransactionStatus.COMPLETED,
        description: dto.reason,
        externalReference: dto.externalReference ?? null,
        reversalOf: original.id,
      });

      original.status = TransactionStatus.REVERSED;
      original.reversedBy = reversalTxn.id;

      await manager.save(Wallet, wallet);
      const savedReversal = await manager.save(Transaction, reversalTxn);
      await manager.save(Transaction, original);

      await this.auditService.log({
        entityType: 'Transaction',
        entityId: savedReversal.id,
        action: 'REVERSAL',
        actorId,
        beforeState: { balance: balanceBefore, originalStatus: TransactionStatus.COMPLETED },
        afterState: { balance: wallet.balance, originalStatus: TransactionStatus.REVERSED },
        metadata: { idempotencyKey, originalTransactionId: transactionId },
      }, manager);

      return this.formatTransaction(savedReversal);
    });

    await this.idempotencyService.save(
      idempotencyKey,
      { transactionId, ...dto } as unknown as Record<string, unknown>,
      result as Record<string, unknown>,
      201,
    );

    return result;
  }

  // ─── Get Status ────────────────────────────────────────────────────────────

  async findById(transactionId: string) {
    const txn = await this.txnRepo.findOne({ where: { id: transactionId } });
    if (!txn) throw new NotFoundException(`Transaction '${transactionId}' not found`);
    return this.formatTransaction(txn);
  }
}
