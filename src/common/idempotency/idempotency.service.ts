import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyRecord)
    private readonly repo: Repository<IdempotencyRecord>,
  ) {}

  hashBody(body: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(body)).digest('hex');
  }

  async findByKey(key: string): Promise<IdempotencyRecord | null> {
    return this.repo.findOne({ where: { idempotencyKey: key } });
  }

  /**
   * Returns existing record if key was seen before, or null if this is a new request.
   * Throws 409 ConflictException if same key with a different body is detected.
   */
  async checkOrThrow(
    key: string,
    body: Record<string, unknown>,
  ): Promise<IdempotencyRecord | null> {
    const existing = await this.findByKey(key);
    if (!existing) return null;

    const incomingHash = this.hashBody(body);
    if (existing.requestHash !== incomingHash) {
      throw new ConflictException(
        'Idempotency key already used with a different request body',
      );
    }

    return existing;
  }

  async save(
    key: string,
    body: Record<string, unknown>,
    responseBody: Record<string, unknown>,
    httpStatus: number,
  ): Promise<IdempotencyRecord> {
    const record = this.repo.create({
      id: uuidv4(),
      idempotencyKey: key,
      requestHash: this.hashBody(body),
      responseBody,
      httpStatus,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    return this.repo.save(record);
  }
}
