import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { AuditLog } from '../common/entities/audit-log.entity';
import { IdempotencyRecord } from '../common/entities/idempotency-record.entity';

export const databaseConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get<string>('DB_HOST', 'localhost'),
  port: config.get<number>('DB_PORT', 5432),
  username: config.get<string>('DB_USERNAME', 'wallet_user'),
  password: config.get<string>('DB_PASSWORD', 'wallet_pass'),
  database: config.get<string>('DB_DATABASE', 'wallet_db'),
  entities: [Wallet, Transaction, AuditLog, IdempotencyRecord],
  synchronize: false, // always use migrations in production
  logging: config.get<string>('NODE_ENV') === 'development',
  ssl: false,
});
