import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import request from 'supertest';
import { MAIL_TRANSPORT } from '../src/mail/mail.transport.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { mailOf, MemoryMailTransport, tokenFrom } from './mail.js';

/**
 * Boots the real AppModule with the production HTTP setup. E-mails go to an
 * in-memory outbox (`mailOf(app)` in `test/mail.ts`).
 */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(MAIL_TRANSPORT)
    .useValue(new MemoryMailTransport())
    .compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

/**
 * Empties every table (ids start over) and the outbox. Refuses to run unless
 * the database name ends in `_test`, so it never wipes the dev database.
 */
export async function resetDatabase(app: INestApplication) {
  mailOf(app).clear();
  const prisma = app.get(PrismaService);
  const [{ db }] = await prisma.$queryRaw<
    { db: string }[]
  >`SELECT current_database() AS db`;
  if (!db.endsWith('_test')) {
    throw new Error(`Refusing to reset "${db}": not a *_test database`);
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}

export const userBody = (name: string, email: string) => ({
  name,
  email,
  password: 'segredo123',
  birthDate: '1990-05-20',
  cep: '01001000',
  city: 'São Paulo',
  state: 'SP',
});

export type Agent = ReturnType<typeof request.agent>;

/**
 * Registers a user, activates the account through the e-mailed link and
 * returns an agent carrying their session cookies.
 */
export async function signUp(
  app: INestApplication<App>,
  name: string,
  email: string,
): Promise<Agent> {
  const client = request.agent(app.getHttpServer());
  await client.post('/auth/register').send(userBody(name, email)).expect(201);
  const token = tokenFrom(mailOf(app).lastTo(email.trim().toLowerCase()));
  await client.post('/auth/activation').send({ token }).expect(200);
  return client;
}

export interface PaymentMethodBody {
  id: number;
  name: string;
  type: 'CREDIT_CARD' | 'ACCOUNT' | 'OTHER';
  dueDay: number | null;
  active: boolean;
}

/** Creates a payment method of `client` (a credit card due on the 12th by default). */
export async function createPaymentMethod(
  client: Agent,
  body: Record<string, unknown> = {},
) {
  const res = await client
    .post('/payment-methods')
    .send({
      name: 'Cartão Americanas',
      type: 'CREDIT_CARD',
      dueDay: 12,
      ...body,
    })
    .expect(201);
  return res.body as PaymentMethodBody;
}

export interface CellBody {
  categoryId: number;
  month: string;
  amountCents: number;
}

/** Plans one plain launch per cell (`POST /budget/transactions`); returns their ids. */
export async function addTransactions(
  client: Agent,
  cells: CellBody[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const { categoryId, month, amountCents } of cells) {
    const res = await client
      .post('/budget/transactions')
      .send({ categoryId, month, plannedCents: amountCents })
      .expect(201);
    ids.push((res.body as { id: number }[])[0].id);
  }
  return ids;
}
