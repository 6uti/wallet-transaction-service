import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction, TransactionStatus, TransactionType } from '../transactions/entities/transaction.entity';
import { MovementsQueryDto } from './dto/movements-query.dto';

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(Transaction)
    private readonly txnRepo: Repository<Transaction>,
  ) {}

  async findOneOrFail(walletId: string): Promise<Wallet> {
    const wallet = await this.walletRepo.findOne({ where: { id: walletId } });
    if (!wallet) throw new NotFoundException(`Wallet '${walletId}' not found`);
    return wallet;
  }

  async getBalance(walletId: string) {
    const wallet = await this.findOneOrFail(walletId);
    return {
      walletId: wallet.id,
      ownerName: wallet.ownerName,
      currency: wallet.currency,
      availableBalance: wallet.balance,
      status: wallet.status,
    };
  }

  async getMovements(walletId: string, query: MovementsQueryDto) {
    await this.findOneOrFail(walletId);

    const { type, status, page = 1, pageSize = 20 } = query;

    const qb = this.txnRepo
      .createQueryBuilder('txn')
      .where('txn.walletId = :walletId', { walletId })
      .orderBy('txn.createdAt', 'DESC');

    if (type && type !== 'ALL') {
      qb.andWhere('txn.type = :type', { type });
    }
    if (status) {
      qb.andWhere('txn.status = :status', { status });
    }

    const [movements, total] = await qb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return {
      walletId,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      movements: movements.map((m) => ({
        transactionId: m.id,
        type: m.type,
        amount: m.amount,
        currency: m.currency,
        status: m.status,
        description: m.description,
        externalReference: m.externalReference,
        createdAt: m.createdAt,
      })),
    };
  }
}
