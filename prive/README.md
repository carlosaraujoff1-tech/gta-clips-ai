# PRIVÉ

Plataforma premium, discreta e exclusiva para maiores de 18 anos, com descoberta de perfis
verificados, agenda e solicitações de reserva. É um PWA instalável, feito com Next.js e Supabase.

> Arquitetura, modelo de dados, cronograma e **pontos jurídicos**: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)

## Rodar localmente

```bash
cd prive
npm install
npm run dev        # http://localhost:3100
```

Sem as variáveis do Supabase, o app roda em **modo demonstração**: os dados ficam no próprio
navegador e a tela de login mostra contas de teste. A senha de todas é `prive2026`.

| Conta | E-mail | O que ver |
|---|---|---|
| Cliente | cliente@demo.prive | início, busca, perfil, agendamento, reservas, chat, conta |
| Profissional | pro1@demo.prive | painel, solicitações, disponibilidade, perfil e fotos, verificação |
| Parceiro | parceiro@demo.prive | estabelecimentos e reservas |
| Admin | admin@demo.prive | dashboard, verificações, denúncias, moderação, auditoria, permissões |

Em **Minha conta → Restaurar dados de demonstração** os dados de teste voltam ao estado inicial.

## Publicar para o cliente ver (pelo celular)

1. Entre em vercel.com → *Add New Project* → importe este repositório.
2. Em **Root Directory**, escolha `prive`.
3. Deploy. O link gerado já funciona e pode ser instalado na tela inicial (Android: menu →
   *Instalar app*; iPhone: Compartilhar → *Adicionar à Tela de Início*).

## Ligar o Supabase (próxima etapa)

1. Crie um projeto na região São Paulo.
2. Rode `supabase/migrations/0001_init.sql` (SQL Editor ou `supabase db push`).
3. Copie `.env.example` para `.env.local` e preencha a URL e a chave `anon`.

Para testar as políticas RLS num PostgreSQL local, rode `supabase/tests/run.sh`.

## Scripts

`npm run dev` · `npm run build` · `npm run lint` · `npm run typecheck`
