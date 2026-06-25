import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet } from './entities/wallet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { AuditLog } from '../common/entities/audit-log.entity';
import { AuditService } from '../common/audit/audit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, Transaction, AuditLog])],
  controllers: [WalletsController],
  providers: [WalletsService, AuditService],
  exports: [WalletsService],
})
export class WalletsModule {}
