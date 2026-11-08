# BOMB//SHIFT

Jogo de arcade no estilo Bomberman, construído com React + TypeScript + Vite + Phaser 3 + Supabase.

---

## Pré-requisitos

- **Node.js** 20+ (recomendado: 22 LTS)
- **npm** 10+
- Conta no [Supabase](https://supabase.com) com projeto criado

---

## Configuração do ambiente

1. Clone o repositório:
   ```bash
   git clone <url-do-repo>
   cd bomb_shift
   ```

2. Instale as dependências:
   ```bash
   npm install
   ```

3. Crie o arquivo `.env.local` na raiz do projeto:
   ```env
   VITE_SUPABASE_URL=https://SEU_PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua_chave_anonima_aqui
   ```
   > ⚠️ Nunca faça commit do `.env.local`. Ele já está no `.gitignore`.

---

## Desenvolvimento

```bash
npm run dev
```

Acesse em: `http://localhost:5173`

---

## Build de produção

```bash
npm run build
```

Os arquivos são gerados em `dist/`.

---

## Testes

```bash
npm run test          # todos os testes (watch mode)
npm run test -- --run # executar uma vez e sair
```

---

## Lint

```bash
npm run lint
```

---

## Schema do Supabase

As 7 migrações em `supabase/migrations/` devem ser aplicadas **em ordem** no painel SQL do Supabase (ou via `supabase db push` se tiver a CLI configurada):

| Arquivo | Conteúdo |
|---|---|
| `001_profiles.sql` | Tabela `profiles` e trigger `handle_new_user` |
| `002_solo_matches.sql` | Tabela `solo_matches` |
| `003_pvp_matches.sql` | Tabela `pvp_matches` |
| `004_rls.sql` | Políticas de Row Level Security |
| `005_solo_rankings.sql` | RPC `solo_rankings()` |
| `006_pvp_rankings.sql` | RPC `pvp_rankings()` |
| `007_indexes.sql` | Índices de performance |

> As migrações **já foram aplicadas** no projeto Supabase de desenvolvimento.

---

## Edge Functions

As Edge Functions para registro de partidas estão preparadas mas **ainda não foram implantadas**:

| Função | Arquivo | Status |
|---|---|---|
| `submit-solo-result` | `supabase/functions/submit-solo-result/` | ⏳ Pendente deploy |
| `submit-pvp-result` | `supabase/functions/submit-pvp-result/` | ⏳ Pendente deploy |

Enquanto não estiverem ativas, a tela pós-partida exibe **"Registro online em desenvolvimento"** para usuários autenticados. Rankings e perfil ficam vazios até as funções serem implantadas.

Para implantar (requer [Supabase CLI](https://supabase.com/docs/guides/cli)):
```bash
supabase functions deploy submit-solo-result
supabase functions deploy submit-pvp-result
```

---

## Deploy (Vercel)

1. Faça push do repositório para o GitHub.
2. Importe o projeto no [Vercel](https://vercel.com).
3. Configure as variáveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. O arquivo `vercel.json` já configura o rewrite para SPA routing.
5. Clique em **Deploy**.

---

## Estrutura do projeto

```
src/
  game/          # Engine Phaser 3 (arena, jogadores, bombas, SHIFT, IA, HUD, áudio)
  pages/         # Páginas React (menu, jogo, perfil, rankings, configurações)
  components/    # Componentes UI reutilizáveis
  hooks/         # Hooks React (useAuth, useRankings)
  contexts/      # AuthContext (sessão Supabase)
  lib/           # Cliente Supabase + tipos do banco
  styles/        # Tokens de design (CSS variables)
  test/          # Suite de testes Vitest (182+ testes)
supabase/
  migrations/    # 7 migrações SQL
  functions/     # Edge Functions (pendente deploy)
```

---

## Pendências conhecidas (pós ST-13)

- **Música de fundo (BGM)**: `AudioManager` suporta a estrutura, mas o loop de música não foi implementado por ausência de assets de áudio definidos.
- **Partículas de passos**: mencionadas no plano ST-13 como "sutis"; não implementadas para evitar overhead no `Player.update()`.
- **Edge Functions**: o código existe mas ainda não está implantado no Supabase remoto.

---

## Versão

**BOMB//SHIFT v0.1** — Em desenvolvimento ativo.
