import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Wallet } from '../../wallets/entities/wallet.entity';

export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
  TRANSFER_DEBIT = 'TRANSFER_DEBIT',
  TRANSFER_CREDIT = 'TRANSFER_CREDIT',
  REVERSAL = 'REVERSAL',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REVERSED = 'REVERSED',
}

@Entity('transactions')
export class Transaction {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id: string;

  @Column({ name: 'wallet_id', type: 'varchar', length: 36 })
  walletId: string;

  @ManyToOne(() => Wallet, (w) => w.transactions)
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({ name: 'related_wallet_id', type: 'varchar', length: 36, nullable: true })
  relatedWalletId: string | null;

  @Column({ type: 'varchar', length: 20, enum: TransactionType })
  type: TransactionType;

  /** Stored as NUMERIC — use Decimal.js for arithmetic */
  @Column({ type: 'numeric', precision: 20, scale: 2 })
  amount: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 20, enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ name: 'external_reference', type: 'varchar', length: 200, nullable: true })
  externalReference: string | null;

  /** ID of the original transaction this reversal targets */
  @Column({ name: 'reversal_of', type: 'varchar', length: 36, nullable: true })
  reversalOf: string | null;

  /** ID of the reversal transaction that cancelled this one */
  @Column({ name: 'reversed_by', type: 'varchar', length: 36, nullable: true })
  reversedBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  isReversed(): boolean {
    return this.status === TransactionStatus.REVERSED || this.reversedBy !== null;
  }
}
