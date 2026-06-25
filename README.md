# Wallet Transaction Service
** Backend Senior Technical Challenge**

Microservicio backend para gestionar operaciones de una billetera digital regulada.
Construido con **NestJS**, **TypeScript**, **PostgreSQL** y **Docker Compose**.

---

## ⚡ Inicio rápido (1 solo comando)

```bash
git clone https://github.com/6uti/wallet-transaction-service.git
cd wallet-transaction-service
docker compose up --build
```

Cuando veas esto en los logs, el servicio está listo:
```
wallet-service | 🚀 Wallet Service running on port 3000
wallet-service | 📚 Swagger docs: http://localhost:3000/api/docs
```

Verificar que funciona:
```bash
curl http://localhost:3000/health
# → {"status":"ok"}
```

---

## ✅ Entregables

| # | Entregable | Estado |
|---|---|---|
| 1 | Repositorio GitHub | ✅ https://github.com/6uti/wallet-transaction-service |
| 2 | README con instrucciones claras | ✅ Este archivo |
| 3 | Docker Compose para app + PostgreSQL | ✅ `docker-compose.yml` |
| 4 | Script de inicialización de BD | ✅ `src/database/init.sql` |
| 5 | Swagger / OpenAPI | ✅ http://localhost:3000/api/docs |
| 6 | Tests unitarios e integración | ✅ `test/unit/` y `test/integration/` |
| 7 | Diagrama de arquitectura | ✅ `ARCHITECTURE.md` |
| 8 | Colección Postman | ✅ `postman_collection.json` |

---

## 📚 Documentación de la API

### Swagger interactivo
```
http://localhost:3000/api/docs
```

### Postman
Importar el archivo `postman_collection.json` en Postman.
Ejecutar primero **Auth → Login** para que el token se guarde automáticamente en `{{token}}`.

---

## 🔐 Credenciales de prueba

```
username: senior.backend
password: Password123
```

---

## 💳 Wallets precargadas

| ID | Owner | Moneda | Saldo | Estado |
|---|---|---|---|---|
| `wal_001` | Alice García | PEN | 1500.00 | ACTIVE |
| `wal_002` | Bob Rodríguez | PEN | 800.00 | ACTIVE |
| `wal_003` | Carol Mendoza | PEN | 250.00 | BLOCKED |
| `wal_004` | David Torres | USD | 500.00 | ACTIVE |

---

## 🛣️ Endpoints

| Método | Endpoint | Auth | Idempotency-Key |
|---|---|---|---|
| POST | `/auth/login` | — | — |
| GET | `/health` | — | — |
| GET | `/readiness` | — | — |
| GET | `/wallets/:walletId/balance` | ✅ | — |
| GET | `/wallets/:walletId/movements` | ✅ | — |
| POST | `/transactions` | ✅ | **Requerido** |
| POST | `/transactions/transfer` | ✅ | **Requerido** |
| POST | `/transactions/:id/reversal` | ✅ | **Requerido** |
| GET | `/transactions/:id` | ✅ | — |

### Ejemplos de request

**Login**
```bash
POST /auth/login
{
  "username": "senior.backend",
  "password": "Password123"
}
```

**Débito**
```bash
POST /transactions
Authorization: Bearer {token}
Idempotency-Key: {uuid}

{
  "walletId": "wal_001",
  "type": "DEBIT",
  "amount": "25.50",
  "currency": "PEN",
  "description": "Pago QR comercio",
  "externalReference": "qr_789456"
}
```

**Transferencia**
```bash
POST /transactions/transfer
Authorization: Bearer {token}
Idempotency-Key: {uuid}

{
  "sourceWalletId": "wal_001",
  "targetWalletId": "wal_002",
  "amount": "100.00",
  "currency": "PEN",
  "description": "Transferencia entre usuarios"
}
```

**Reversa**
```bash
POST /transactions/{id}/reversal
Authorization: Bearer {token}
Idempotency-Key: {uuid}

{
  "reason": "Merchant refund / reversal",
  "externalReference": "rev_123456"
}
```

---

## 🧪 Tests

### Tests unitarios (sin Docker)
```bash
npm install
npm run test:unit
```
```
PASS test/unit/transactions.service.spec.ts
PASS test/unit/idempotency.service.spec.ts

Tests: 29 passed, 29 total
```

### Tests de integración (requieren Docker)
```bash
# Terminal 1 — levantar la base de datos
docker compose up postgres -d

# Terminal 2 — correr los tests
npm install
npm run test:integration
```
```
Tests: 20 passed, 20 total
```

### Cobertura
```bash
npm run test:cov
```

---

## 🏗️ Arquitectura

```
src/
├── auth/                     # JWT login simulado
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── jwt.strategy.ts
│   └── dto/login.dto.ts
├── wallets/                  # Balance y movimientos
│   ├── wallets.controller.ts
│   ├── wallets.service.ts
│   ├── wallets.module.ts
│   ├── entities/wallet.entity.ts
│   └── dto/movements-query.dto.ts
├── transactions/             # Débito, crédito, transferencia, reversa
│   ├── transactions.controller.ts
│   ├── transactions.service.ts
│   ├── transactions.module.ts
│   ├── entities/transaction.entity.ts
│   └── dto/
├── health/                   # Health check y readiness
├── common/
│   ├── audit/                # Auditoría en cada operación crítica
│   ├── idempotency/          # Control de Idempotency-Key
│   ├── guards/               # JwtAuthGuard
│   ├── exceptions/           # HttpExceptionFilter (sin stack traces)
│   ├── interceptors/         # LoggingInterceptor
│   ├── decorators/           # @CurrentUser()
│   └── entities/             # AuditLog, IdempotencyRecord
├── database/
│   └── init.sql              # Schema + seed data
└── main.ts
```

Ver diagrama completo en [`ARCHITECTURE.md`](./ARCHITECTURE.md)

---

## 🔧 Desarrollo local (sin Docker para la app)

```bash
# 1 — Levantar solo la base de datos
docker compose up postgres -d

# 2 — Copiar variables de entorno locales
cp .env.local .env

# 3 — Instalar dependencias
npm install

# 4 — Correr en modo desarrollo (hot reload)
npm run start:dev
```

---

## ⚙️ Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto HTTP | `3000` |
| `DB_HOST` | Host PostgreSQL | `postgres` |
| `DB_PORT` | Puerto PostgreSQL | `5432` |
| `DB_USERNAME` | Usuario BD | `wallet_user` |
| `DB_PASSWORD` | Contraseña BD | `wallet_pass` |
| `DB_DATABASE` | Nombre BD | `wallet_db` |
| `JWT_SECRET` | Clave secreta JWT | — |
| `JWT_EXPIRES_IN` | Expiración token (segundos) | `3600` |

---

## 📋 Reglas de negocio implementadas

- ✅ Solo wallets `ACTIVE` pueden operar
- ✅ No se permite saldo negativo
- ✅ No se permite operar con moneda distinta a la de la wallet
- ✅ Montos como string decimal (`"25.50"`), nunca float — usa `Decimal.js`
- ✅ Saldo actualizado dentro de la misma transacción de BD
- ✅ Toda operación crítica es atómica con rollback automático
- ✅ `Idempotency-Key` requerida en operaciones críticas
- ✅ Misma clave con body diferente retorna `409 Conflict`
- ✅ Una transacción reversada no puede reversarse nuevamente
- ✅ Toda operación crítica genera registro en `audit_logs`

---

## 🔒 Seguridad

- JWT validado por `JwtAuthGuard` en cada endpoint protegido
- DTOs con `class-validator` — validación estricta de entrada
- `HttpExceptionFilter` global — nunca expone stack traces al cliente
- Logs con Winston sin tokens, passwords ni datos sensibles
- Variables de entorno para todos los secretos
- HTTP status codes correctos: 400, 401, 404, 409, 422, 500

---

## 🤖 Uso de IA

**Herramienta utilizada:** Claude (Anthropic)

**¿Para qué se usó?**
- Generación del scaffold inicial de módulos NestJS
- Estructura base de DTOs con class-validator
- Configuración del DocumentBuilder de Swagger

**¿Qué código se aceptó?**
- Estructura base de los módulos (ajustada manualmente)
- Configuración inicial de Swagger

**¿Qué código se descartó?**
- Propuesta de usar `Repository.save()` directo sin `DataSource.transaction()` — incorrecto para atomicidad real
- Uso de `parseFloat()` para montos — reemplazado por `Decimal.js`
- Ordenamiento de locks en transfers — la IA no lo consideró, se agregó manualmente para prevenir deadlocks

**¿Qué se validó manualmente?**
- Toda la lógica de atomicidad y rollback
- El flujo completo de idempotencia con SHA-256
- Prevención de deadlocks en transfers (orden de locks por ID)
- Que los errores nunca exponen stack traces al cliente
- Todos los casos borde del challenge

**¿Qué riesgos se identificaron?**
- La IA sugirió aritmética con `Number` para montos — identificado y corregido con `Decimal.js`
- La IA no ordenó los locks en transfers — se agregó orden consistente por ID para evitar deadlocks
- El `expiresIn` del JWT llegaba como string desde las variables de entorno — corregido con `parseInt()`
