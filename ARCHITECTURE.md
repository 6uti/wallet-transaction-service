```mermaid
graph TB
    Client["Client (HTTP)"]

    subgraph API["NestJS Application"]
        Auth["AuthModule\n/auth/login"]
        Wallets["WalletsModule\n/wallets/:id/balance\n/wallets/:id/movements"]
        Transactions["TransactionsModule\n/transactions\n/transactions/transfer\n/transactions/:id/reversal"]
        Health["HealthModule\n/health  /readiness"]

        JwtGuard["JwtAuthGuard\n(Passport-JWT)"]
        IdemSvc["IdempotencyService\nSHA-256 key+body hash"]
        AuditSvc["AuditService\nEvery critical operation"]
        ExcFilter["HttpExceptionFilter\nNo stack trace leaks"]
        LogIntercept["LoggingInterceptor\nWinston (no PII)"]
    end

    subgraph DB["PostgreSQL 15"]
        wallets_t[("wallets")]
        transactions_t[("transactions")]
        idempotency_t[("idempotency_records")]
        audit_t[("audit_logs")]
    end

    Client --> Auth
    Client --> Wallets
    Client --> Transactions
    Client --> Health

    Auth -.->|JWT token| Client
    Wallets -->|uses| JwtGuard
    Transactions -->|uses| JwtGuard
    Transactions -->|checks| IdemSvc
    Transactions -->|logs| AuditSvc

    ExcFilter -.->|wraps all| Transactions
    LogIntercept -.->|wraps all| Transactions

    Wallets --> wallets_t
    Wallets --> transactions_t
    Transactions --> wallets_t
    Transactions --> transactions_t
    IdemSvc --> idempotency_t
    AuditSvc --> audit_t

    style DB fill:#f9f,stroke:#333
    style API fill:#e8f4fd,stroke:#2196F3
```

## Key Design Decisions

| Concern | Decision | Reason |
|---|---|---|
| Arithmetic | `Decimal.js` for all money ops | Avoids IEEE-754 float errors |
| Atomicity | `DataSource.transaction()` with `EntityManager` | Guaranteed rollback on any failure |
| Deadlock prevention | Lock wallets in sorted ID order | Consistent lock ordering prevents AB/BA deadlock |
| Idempotency | SHA-256 of request body stored per key | Same key + different body → 409 Conflict |
| Currency storage | `NUMERIC(20,2)` in Postgres | Never float in DB |
| Error responses | Global `HttpExceptionFilter` | Stack traces never reach clients |
| Logs | Winston with `errors({ stack: false })` | No sensitive data in logs |
| Auth | JWT validated by Passport guard | Stateless, standard |
| Audit | Every critical op writes to `audit_logs` within same transaction | Guaranteed consistency |
