import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness check' })
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Readiness check — verifies DB connectivity' })
  async readiness() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready', db: 'connected', timestamp: new Date().toISOString() };
    } catch {
      return { status: 'not ready', db: 'disconnected', timestamp: new Date().toISOString() };
    }
  }
}
