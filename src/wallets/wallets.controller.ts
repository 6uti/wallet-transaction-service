import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MovementsQueryDto } from './dto/movements-query.dto';

@ApiTags('Wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get(':walletId/balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiParam({ name: 'walletId', example: 'wal_001' })
  @ApiResponse({ status: 200, description: 'Balance retrieved' })
  @ApiResponse({ status: 404, description: 'Wallet not found' })
  getBalance(@Param('walletId') walletId: string) {
    return this.walletsService.getBalance(walletId);
  }

  @Get(':walletId/movements')
  @ApiOperation({ summary: 'List paginated movements' })
  @ApiParam({ name: 'walletId', example: 'wal_001' })
  @ApiResponse({ status: 200, description: 'Movements list' })
  getMovements(
    @Param('walletId') walletId: string,
    @Query() query: MovementsQueryDto,
  ) {
    return this.walletsService.getMovements(walletId, query);
  }
}
