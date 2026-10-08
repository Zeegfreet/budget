# Correções: Balanço do grupo quebrando e botão cortado no diálogo de exclusão

## Context

Depois da entrega de recálculo de rateios + recebimentos + diálogos (`plans/group-resplit-and-settlement.md`), o usuário relatou:

1. **A aba Balanço do grupo quebra.** Causa confirmada: o `apps/api/dev.db` não tem a migração `20261008060000_group_share_settlement` (última aplicada: `20261008050000_pre_registration`; `GroupTransactionShare` sem `settledAt`). A API em watch (`dist/main`, porta 3000) já usa o client novo, que seleciona `settledAt` → erro SQL → 500 no balanço (e em qualquer leitura de partes: lançamentos do grupo, extrato de grupos, faturas).
2. **Diálogo de exclusão no extrato com o primeiro botão cortado ao meio.** Causa: `RecurrenceScopeDialog` tem 3 botões no rodapé em linha (`Cancelar`, `Excluir só este`, `Excluir também os próximos`); `Button` é `whitespace-nowrap shrink-0`, então juntos passam dos 384px (`sm:max-w-sm`). Antes vazavam para fora; com o `overflow-y-auto` que adicionei ao `AlertDialogContent`, o excesso é cortado — e como o rodapé é `sm:justify-end`, o corte acontece à esquerda, no primeiro botão.

## Passos

### 1. Balanço (dados locais — aprovado pelo usuário)
- Em `apps/api`: `pnpm prisma migrate deploy --config prisma7.config.ts` (usa o `DATABASE_URL` do `.env` = `dev.db`). Só adiciona a coluna `settledAt` (nullable); nenhum dado é alterado.
- Conferir com `sqlite3 -readonly dev.db "pragma table_info(GroupTransactionShare)"` e na `_prisma_migrations`. A API em watch não precisa reiniciar (o client já é o novo).

### 2. Rodapés de diálogo que não cabem
- `components/molecules/RecurrenceScopeDialog.tsx`: rodapé em **coluna também no desktop** (`<AlertDialogFooter className="sm:flex-col-reverse">`), botões em largura total: de cima para baixo "Excluir/Alterar também os próximos", "…só este", "Cancelar" (mesma ordem que já aparece no celular).
- Proteção genérica para rodapés com rótulos longos (sem editar `components/ui/`):
  - `ConfirmDialog.tsx`: `AlertDialogFooter` com `sm:flex-wrap`.
  - `atoms/FormDialogContent.tsx`: acrescentar `[&_[data-slot=dialog-footer]]:sm:flex-wrap`.
- Teste: em `src/routes/_app/extrato.spec.tsx` (ou o spec que já cobre a exclusão recorrente), garantir que os três botões continuam acessíveis/na ordem esperada e que o rodapé tem a classe de coluna (jsdom não mede layout; a garantia real é a verificação visual abaixo).

### 3. Verificação visual (mesmo roteiro de antes, API isolada)
- Subir API em `:3100` com banco descartável no scratchpad e Vite em `:5199` (proxy para 3100), sem tocar na API do usuário em `:3000`.
- Script `playwright-core` com o Chrome instalado, a 375px e 1280px: criar um lançamento recorrente no extrato, abrir **Excluir** (escopo) e **Editar → salvar** (escopo de alteração) e a exclusão simples (`ConfirmDialog`), conferindo automaticamente que todo botão está dentro do retângulo do diálogo (`getBoundingClientRect`) e tirando screenshots; repetir a checagem nos 4 diálogos de formulário já testados.
- Encerrar os servidores pelas portas 3100/5199.

### 4. Fechamento
- `pnpm --filter web lint && pnpm --filter web test && pnpm --filter web build`.
- Copiar este plano para `plans/fix-balance-and-alert-dialogs.md`.
- Sem mudança de API, README ou CI (o README já pede `prisma migrate` no setup).

## Verificação
- Balanço: após a migração, o usuário recarrega `/grupos/:id?tab=balanco` no app dele; do meu lado, a coluna existe no `dev.db` e a migração consta em `_prisma_migrations`.
- Diálogos: checagem automática sem nenhum botão fora da caixa + screenshots a 375/1280 conferidos; testes web verdes.
