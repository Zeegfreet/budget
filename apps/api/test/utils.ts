import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
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
  await prisma.transaction.deleteMany();
  await prisma.category.deleteMany();
  await prisma.categoryGroup.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
