import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';

/** Boots the real AppModule with the production HTTP setup. */
export async function createTestApp(): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}

export async function resetDatabase(app: INestApplication) {
  const prisma = app.get(PrismaService);
  await prisma.groupTransactionShare.deleteMany();
  await prisma.groupTransaction.deleteMany();
  await prisma.splitMethodShare.deleteMany();
  await prisma.splitMethod.deleteMany();
  await prisma.groupInvitation.deleteMany();
  await prisma.groupMember.deleteMany();
  await prisma.financeGroup.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.paymentMethod.deleteMany();
  await prisma.category.deleteMany();
  await prisma.categoryGroup.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
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

/** Registers a user and returns an agent carrying their session cookies. */
export async function signUp(
  app: INestApplication<App>,
  name: string,
  email: string,
): Promise<Agent> {
  const client = request.agent(app.getHttpServer());
  await client.post('/auth/register').send(userBody(name, email)).expect(201);
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
