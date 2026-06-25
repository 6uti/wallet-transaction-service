import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { v4 as uuidv4 } from 'uuid';

interface AuditParams {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  async log(params: AuditParams, manager?: EntityManager): Promise<void> {
    const record = {
      id: uuidv4(),
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      actorId: params.actorId ?? null,
      beforeState: params.beforeState ?? null,
      afterState: params.afterState ?? null,
      metadata: params.metadata ?? null,
    };

    if (manager) {
      await manager.getRepository(AuditLog).save(record);
    } else {
      await this.repo.save(record);
    }
  }
}
