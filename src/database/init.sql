-- ============================================================
-- Wallet Transaction Service — Database Initialization
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Wallets ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallets (
  id            VARCHAR(36)     PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  owner_id      VARCHAR(100)    NOT NULL,
  owner_name    VARCHAR(200)    NOT NULL,
  currency      VARCHAR(3)      NOT NULL,
  status        VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE',
  balance       NUMERIC(20, 2)  NOT NULL DEFAULT 0.00,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_wallets_status   CHECK (status IN ('ACTIVE', 'BLOCKED', 'CLOSED')),
  CONSTRAINT chk_wallets_currency CHECK (currency IN ('PEN', 'USD', 'EUR')),
  CONSTRAINT chk_wallets_balance  CHECK (balance >= 0)
);

-- ── Transactions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                    VARCHAR(36)    PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  wallet_id             VARCHAR(36)    NOT NULL REFERENCES wallets(id),
  related_wallet_id     VARCHAR(36)    REFERENCES wallets(id),
  type                  VARCHAR(20)    NOT NULL,
  amount                NUMERIC(20, 2) NOT NULL,
  currency              VARCHAR(3)     NOT NULL,
  status                VARCHAR(20)    NOT NULL DEFAULT 'PENDING',
  description           TEXT,
  external_reference    VARCHAR(200),
  reversal_of           VARCHAR(36)    REFERENCES transactions(id),
  reversed_by           VARCHAR(36)    REFERENCES transactions(id),
  metadata              JSONB,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_txn_type   CHECK (type IN ('DEBIT','CREDIT','TRANSFER_DEBIT','TRANSFER_CREDIT','REVERSAL')),
  CONSTRAINT chk_txn_status CHECK (status IN ('PENDING','COMPLETED','FAILED','REVERSED')),
  CONSTRAINT chk_txn_amount CHECK (amount > 0)
);

-- ── Idempotency Records ────────────────────────────────────
CREATE TABLE IF NOT EXISTS idempotency_records (
  id              VARCHAR(36)    PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  idempotency_key VARCHAR(255)   NOT NULL UNIQUE,
  request_hash    VARCHAR(64)    NOT NULL,
  response_body   JSONB          NOT NULL,
  http_status     INT            NOT NULL,
  created_at      TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ    NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

-- ── Audit Logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id            VARCHAR(36)    PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  entity_type   VARCHAR(50)    NOT NULL,
  entity_id     VARCHAR(36)    NOT NULL,
  action        VARCHAR(50)    NOT NULL,
  actor_id      VARCHAR(100),
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_wallets_owner_id       ON wallets(owner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status    ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_type      ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_created   ON transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idem_key               ON idempotency_records(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_audit_entity           ON audit_logs(entity_type, entity_id);

-- ── Seed Data ──────────────────────────────────────────────
INSERT INTO wallets (id, owner_id, owner_name, currency, status, balance)
VALUES
  ('wal_001', 'usr_001', 'Alice García',   'PEN', 'ACTIVE',  1500.00),
  ('wal_002', 'usr_002', 'Bob Rodríguez',  'PEN', 'ACTIVE',   800.00),
  ('wal_003', 'usr_003', 'Carol Mendoza',  'PEN', 'BLOCKED',  250.00),
  ('wal_004', 'usr_004', 'David Torres',   'USD', 'ACTIVE',   500.00)
ON CONFLICT (id) DO NOTHING;

-- Initial credit transactions for audit trail
INSERT INTO transactions (id, wallet_id, type, amount, currency, status, description, external_reference)
VALUES
  ('txn_seed_001', 'wal_001', 'CREDIT', 1500.00, 'PEN', 'COMPLETED', 'Saldo inicial', 'SEED_001'),
  ('txn_seed_002', 'wal_002', 'CREDIT',  800.00, 'PEN', 'COMPLETED', 'Saldo inicial', 'SEED_002'),
  ('txn_seed_003', 'wal_003', 'CREDIT',  250.00, 'PEN', 'COMPLETED', 'Saldo inicial', 'SEED_003'),
  ('txn_seed_004', 'wal_004', 'CREDIT',  500.00, 'USD', 'COMPLETED', 'Saldo inicial', 'SEED_004')
ON CONFLICT (id) DO NOTHING;
