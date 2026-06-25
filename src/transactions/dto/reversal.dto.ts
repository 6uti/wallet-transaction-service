import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReversalDto {
  @ApiProperty({ example: 'Merchant refund / reversal' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({ example: 'rev_123456' })
  @IsOptional()
  @IsString()
  externalReference?: string;
}
