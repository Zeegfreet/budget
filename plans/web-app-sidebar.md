# Menu lateral recolhível no layout autenticado

## Context
Hoje o shell autenticado (`AppLayout`) usa um header (`AppHeader`) com logo, link "Início", e-mail e botão "Sair". Queremos trocar por um **menu lateral recolhível** que concentre a navegação da aplicação e, no rodapé, um **avatar com o nome do usuário** que abre um menu com **Alterar senha**, **Editar perfil** e **Sair**.

Decisões do usuário:
- "Alterar senha" e "Editar perfil" levam a **rotas placeholder** (`/settings/password`, `/settings/profile`) com página "em breve"; API e formulários ficam para outra tarefa.
- A navegação mostra **só rotas existentes** ("Início"), vinda de um array de config pronto para receber novos itens.

Escopo: só `apps/web` + README. Nenhuma mudança de API nem de CI (o job `web` já cobre lint/test/build).

## Abordagem

### 1. Componentes shadcn (via CLI, sem editar à mão)
`pnpm dlx shadcn@latest add sidebar dropdown-menu avatar` em `apps/web`.
- `sidebar` traz `sheet`, `tooltip`, `use-mobile` (`src/hooks/use-mobile.ts`) e reaproveita `button/input/separator/skeleton`. Os tokens `--sidebar-*` já existem em `src/index.css`.
- Usar `collapsible="icon"`: no desktop recolhe para a faixa de ícones (estado persistido no cookie `sidebar_state` pelo próprio `SidebarProvider`, atalho Ctrl/⌘+B, `SidebarRail`); no mobile vira `Sheet`.

### 2. Lógica/utilidades
- `src/lib/navigation.ts`: `appNavItems: { label: string; to: LinkProps['to']; icon: LucideIcon }[]` = `[{ label: 'Início', to: '/', icon: HomeIcon }]`.
- `src/lib/initials.ts` + spec: `getInitials('Ana Souza') → 'AS'`, um nome → 1 letra, espaços extras, string vazia.
- `src/features/auth/hooks.ts`: `useSignOut()` — extrai a mutation hoje em `AppHeader.tsx` (`logout` → `onSettled`: `queryClient.clear()` + `navigate({ to: '/login', replace: true })`).

### 3. Atomic design (respeitando ui → atoms → molecules → organisms → templates)
- **atom** `UserAvatar` (`components/atoms/UserAvatar.tsx`): `Avatar` + `AvatarFallback` com `getInitials(name)`.
- **molecule** `SidebarNav` (`molecules/SidebarNav.tsx`): `SidebarGroup/SidebarMenu`, um `SidebarMenuButton asChild tooltip={label}` com `<Link activeProps>` por item de `appNavItems`; `isActive` via `useMatchRoute`/`activeProps`.
- **molecule** `UserMenu` (`molecules/UserMenu.tsx`): `DropdownMenu` cujo trigger é um `SidebarMenuButton size="lg"` com `UserAvatar` + nome + e-mail (truncados; só o avatar quando recolhido). Itens: `Editar perfil` (Link `/settings/profile`, `UserIcon`), `Alterar senha` (Link `/settings/password`, `KeyRoundIcon`), separador, `Sair` (`LogOutIcon`, `variant="destructive"`, chama `useSignOut`). `side` = `right` no desktop, `top` no mobile (`useSidebar().isMobile`). Recebe `user: AuthUser` por prop.
- **organism** `AppSidebar` (`organisms/AppSidebar.tsx`): `Sidebar collapsible="icon"` → `SidebarHeader` (Link "/" com `Logo`/`BrandIcon` quando recolhido), `SidebarContent` (`SidebarNav`), `SidebarFooter` (`UserMenu` com `useQuery(authQueries.me())`), `SidebarRail`.
- **template** `AppLayout`: `SidebarProvider` + `AppSidebar` + `SidebarInset` contendo `<main>` com um `SidebarTrigger aria-label="Alternar menu lateral"` discreto no topo do conteúdo (necessário para abrir no mobile e recolher no desktop; não é um header). Ler o cookie `sidebar_state` para `defaultOpen`.
- Remover `organisms/AppHeader.tsx` e seu export do barrel; adicionar os novos aos barrels `index.ts`.

### 4. Rotas placeholder
- `src/routes/_app/settings/profile.tsx` ("Editar perfil") e `src/routes/_app/settings/password.tsx` ("Alterar senha"): título + `EmptyState` "Em breve". Ficam sob o guard `_app`. Rodar `pnpm generate:routes`.

### 5. Testes (Vitest + Testing Library, `renderRoute`, mock de `@/features/auth/api`)
- `src/test/setup.ts`: polyfills de jsdom necessários para sidebar/Radix — `window.matchMedia` (usado por `useIsMobile`), `Element.prototype.hasPointerCapture/releasePointerCapture/scrollIntoView`, `ResizeObserver` se necessário.
- Atualizar `src/routes/_app/index.spec.tsx`: trocar asserções de `banner` por `navigation`/link "Início" ativo; logout agora via abrir menu do usuário (`button` com o nome) → `menuitem` "Sair" (casos sucesso e falha da API mantidos); redirects de acesso continuam garantindo que a sidebar não renderiza.
- Novo `src/components/organisms/AppSidebar.spec.tsx` ou casos no spec da rota:
  - mostra avatar com iniciais, nome e e-mail no rodapé;
  - abre o menu e lista "Editar perfil", "Alterar senha", "Sair";
  - "Editar perfil"/"Alterar senha" navegam para `/settings/profile` / `/settings/password`;
  - `SidebarTrigger` alterna `data-state` entre `expanded` e `collapsed`.
- `src/routes/_app/settings/profile.spec.tsx` e `password.spec.tsx`: renderizam a página para usuário logado; visitante deslogado vai para `/login?redirect=...`.
- `src/lib/initials.spec.ts`, `src/components/atoms/UserAvatar.spec.tsx`.

### 6. README
- "Status dos recursos": nova linha "Layout autenticado (menu lateral recolhível, menu do usuário)" Web ✅, com observação de que "Alterar senha"/"Editar perfil" são placeholders; adicionar linhas ⏳ para "Editar perfil" e "Alterar senha".
- Mencionar `src/hooks/` e os novos componentes shadcn na seção de estrutura/stack do web, se listados lá.
- Atualizar `CLAUDE.md` (Web architecture): `AppHeader` → `AppSidebar`, `src/lib/navigation.ts` como lugar de registrar novas rotas no menu.

## Arquivos críticos
- Modificar: `apps/web/src/components/templates/AppLayout.tsx`, `components/{atoms,molecules,organisms}/index.ts`, `src/routes/_app/index.spec.tsx`, `src/test/setup.ts`, `README.md`, `CLAUDE.md`
- Remover: `apps/web/src/components/organisms/AppHeader.tsx`
- Criar: `src/lib/{navigation,initials}.ts`, `src/features/auth/hooks.ts`, `atoms/UserAvatar.tsx`, `molecules/{SidebarNav,UserMenu}.tsx`, `organisms/AppSidebar.tsx`, `routes/_app/settings/{profile,password}.tsx` + specs, componentes `ui/` gerados pelo shadcn
- Reusar: `Logo`/`BrandIcon` (atoms), `EmptyState` (molecules), `authQueries.me()`, `logout` (`features/auth/api.ts`), `renderRoute` (`src/test/render.tsx`)

## Verificação
- `cd apps/web && pnpm generate:routes && pnpm lint && pnpm test && pnpm build` — tudo verde.
- Manual (`pnpm --filter api start:dev` + `pnpm --filter web start:dev`): logar, recolher/expandir o menu (botão, rail, Ctrl+B) e confirmar que persiste após reload; viewport mobile abre como sheet; menu do avatar navega para as duas páginas placeholder e "Sair" volta para `/login`.
