import type { EntryKind } from '../prisma/generated/client.js';

/** Types and categories every user starts with; editable later. */
export const DEFAULT_CATEGORIES: {
  kind: EntryKind;
  name: string;
  categories: string[];
}[] = [
  {
    kind: 'EXPENSE',
    name: 'Despesas Básicas',
    categories: ['Moradia', 'Alimentação', 'Transporte', 'Saúde'],
  },
  {
    kind: 'EXPENSE',
    name: 'Custos de Vida',
    categories: ['Lazer', 'Educação', 'Assinaturas', 'Outros'],
  },
  { kind: 'INCOME', name: 'Salário', categories: ['Salário'] },
  { kind: 'INCOME', name: 'Provento', categories: ['Proventos'] },
  { kind: 'INCOME', name: 'Renda Extra', categories: ['Renda extra'] },
];
