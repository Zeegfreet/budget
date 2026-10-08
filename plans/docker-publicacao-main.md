# Publicar a imagem Docker só no merge para a main (e em tags v*)

## Context

Hoje `.github/workflows/docker.yml` publica `zeegfreet/budget` em qualquer tag `v*`, mesmo em commits de branches de feature (a `v1.0.0` saiu da `feat/finance-groups`) e sem esperar o CI passar. O usuário quer que a imagem suba **só quando houver merge na `main`**, depois de lint, testes e e2e verdes. Decisão: merge na main publica `:latest` e `:sha-<commit>`; tags `v*` (criadas na main) continuam publicando versões fixas `:1.2.3` e `:1.2` para deploy/rollback. `latest` passa a significar "o que está na main".

Ao implementar, salvar uma cópia deste plano em `plans/docker-publicacao-main.md`.

## Mudanças

1. **`.github/workflows/ci.yml`**: novo job `publish` no fim:
   - `needs: [api, web, docker]` (só roda com tudo verde).
   - `if: github.event_name == 'push' && (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v'))` — PRs e branches de feature nunca publicam.
   - Passos (os mesmos de hoje no `docker.yml`): checkout, `setup-qemu-action`, `setup-buildx-action`, `login-action` (secrets `DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`), `metadata-action` e `build-push-action` com `platforms: linux/amd64,linux/arm64`, `push: true`, cache `type=gha`.
   - Tags do `metadata-action`:
     ```
     type=raw,value=latest,enable={{is_default_branch}}
     type=sha
     type=semver,pattern={{version}}
     type=semver,pattern={{major}}.{{minor}}
     ```
     com `flavor: latest=false` (evita que uma tag `v*` mova o `latest`).
   - `concurrency` do workflow continua `cancel-in-progress: true` por ref: dois merges seguidos cancelam a publicação anterior e o `latest` fica com o mais novo (aceitável).
2. **Remover `.github/workflows/docker.yml`** (a publicação passa a viver no CI).
3. **`scripts/docker-build.sh`**: `--push` passa a publicar **só a tag de versão informada** (sem `:latest`), para o `latest` vir sempre da main; atualizar o texto de ajuda. Uso fica para emergências/testes manuais.
4. **README** (seções **CI/CD**, **Build da imagem**, checklist): explicar o novo fluxo — PR → CI; merge na main → `:latest` + `:sha-…`; release = `git tag vX.Y.Z` **na main** → `:X.Y.Z` e `:X.Y`; o script `--push` não mexe no `latest`. Tirar a menção ao **Run workflow** manual.
5. **`CLAUDE.md`** (seção Docker / deploy): trocar a referência ao `docker.yml` pelo job `publish` do `ci.yml` e as regras de tag.

## Verificação

- Validar a sintaxe do workflow localmente (`npx --yes @action-validator/cli .github/workflows/ci.yml` ou equivalente) e `bash -n scripts/docker-build.sh` + `./scripts/docker-build.sh --help`.
- Após commit e push na branch: no GitHub Actions, o CI da branch roda e o job `publish` aparece como **skipped**.
- Após o merge do PR na main: o job `publish` roda depois de `api`, `web` e `docker`, e o Docker Hub mostra `latest` e `sha-<commit>` com `amd64` e `arm64` (`curl https://hub.docker.com/v2/repositories/zeegfreet/budget/tags`).
- (Opcional) `git tag v1.0.1` na main → `1.0.1` e `1.0` publicadas, `latest` inalterado.
