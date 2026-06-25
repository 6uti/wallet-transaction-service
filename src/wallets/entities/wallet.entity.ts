import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Transaction } from '../../transactions/entities/transaction.entity';

export enum WalletStatus {
  ACTIVE = 'ACTIVE',
  BLOCKED = 'BLOCKED',
  CLOSED = 'CLOSED',
}

export enum Currency {
  PEN = 'PEN',
  USD = 'USD',
  EUR = 'EUR',
}

@Entity('wallets')
export class Wallet {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 100 })
  ownerId: string;

  @Column({ name: 'owner_name', type: 'varchar', length: 200 })
  ownerName: string;

  @Column({ type: 'varchar', length: 3, enum: Currency })
  currency: Currency;

  @Column({ type: 'varchar', length: 20, enum: WalletStatus, default: WalletStatus.ACTIVE })
  status: WalletStatus;

  /** Stored as NUMERIC(20,2) — never float */
  @Column({ type: 'numeric', precision: 20, scale: 2, default: '0.00' })
  balance: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => Transaction, (t) => t.wallet)
  transactions: Transaction[];

  isActive(): boolean {
    return this.status === WalletStatus.ACTIVE;
  }
}
