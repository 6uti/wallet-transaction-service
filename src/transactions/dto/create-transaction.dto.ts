import { IsString, IsNotEmpty, IsEnum, IsDecimal, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TransactionType } from '../entities/transaction.entity';
import { Currency } from '../../wallets/entities/wallet.entity';

export class CreateTransactionDto {
  @ApiProperty({ example: 'wal_001' })
  @IsString()
  @IsNotEmpty()
  walletId: string;

  @ApiProperty({ enum: [TransactionType.DEBIT, TransactionType.CREDIT] })
  @IsEnum([TransactionType.DEBIT, TransactionType.CREDIT])
  type: TransactionType.DEBIT | TransactionType.CREDIT;

  @ApiProperty({ example: '25.50', description: 'Decimal string — never float' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Amount must be a valid decimal string e.g. "25.50"' })
  amount: string;

  @ApiProperty({ enum: Currency, example: 'PEN' })
  @IsEnum(Currency)
  currency: Currency;

  @ApiPropertyOptional({ example: 'Pago QR comercio' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'qr_789456' })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
