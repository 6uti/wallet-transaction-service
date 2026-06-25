import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiSecurity,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiParam,
} from '@nestjs/swagger';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransferDto } from './dto/transfer.dto';
import { ReversalDto } from './dto/reversal.dto';

@ApiTags('Transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  private requireIdempotencyKey(key: string | undefined): string {
    if (!key || key.trim() === '') {
      throw new BadRequestException('Idempotency-Key header is required');
    }
    return key.trim();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create DEBIT or CREDIT transaction' })
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: 'UUID for idempotency' })
  @ApiResponse({ status: 201, description: 'Transaction created' })
  @ApiResponse({ status: 409, description: 'Idempotency key conflict' })
  @ApiResponse({ status: 422, description: 'Business rule violation' })
  createTransaction(
    @Body() dto: CreateTransactionDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionsService.createTransaction(
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      user.sub,
    );
  }

  @Post('transfer')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Transfer between wallets (double-entry)' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 201, description: 'Transfer completed' })
  @ApiResponse({ status: 409, description: 'Conflict' })
  transfer(
    @Body() dto: TransferDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionsService.transfer(
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      user.sub,
    );
  }

  @Post(':id/reversal')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reverse a completed transaction' })
  @ApiParam({ name: 'id', description: 'Transaction ID to reverse' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiResponse({ status: 201, description: 'Reversal completed' })
  @ApiResponse({ status: 422, description: 'Already reversed or non-reversible' })
  reverseTransaction(
    @Param('id') id: string,
    @Body() dto: ReversalDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.transactionsService.reverseTransaction(
      id,
      dto,
      this.requireIdempotencyKey(idempotencyKey),
      user.sub,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transaction status' })
  @ApiParam({ name: 'id', description: 'Transaction ID' })
  @ApiResponse({ status: 200, description: 'Transaction found' })
  @ApiResponse({ status: 404, description: 'Not found' })
  findById(@Param('id') id: string) {
    return this.transactionsService.findById(id);
  }
}
