import { IsString, IsNotEmpty, IsEnum, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../../wallets/entities/wallet.entity';

export class TransferDto {
  @ApiProperty({ example: 'wal_001' })
  @IsString()
  @IsNotEmpty()
  sourceWalletId: string;

  @ApiProperty({ example: 'wal_002' })
  @IsString()
  @IsNotEmpty()
  targetWalletId: string;

  @ApiProperty({ example: '100.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'Amount must be a valid decimal string e.g. "100.00"' })
  amount: string;

  @ApiProperty({ enum: Currency, example: 'PEN' })
  @IsEnum(Currency)
  currency: Currency;

  @ApiPropertyOptional({ example: 'Transferencia entre usuarios' })
  @IsOptional()
  @IsString()
  description?: string;
}
