import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './entities/transaction.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { AuditLog } from '../common/entities/audit-log.entity';
import { IdempotencyRecord } from '../common/entities/idempotency-record.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';
import { AuditService } from '../common/audit/audit.service';
import { IdempotencyService } from '../common/idempotency/idempotency.service';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, Wallet, AuditLog, IdempotencyRecord])],
  controllers: [TransactionsController],
  providers: [TransactionsService, AuditService, IdempotencyService],
})
export class TransactionsModule {}
