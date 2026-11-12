# PRIVÉ — Arquitetura, banco de dados e cronograma

## 1. Arquitetura proposta

```
┌──────────────────────────── Navegador / PWA instalado ────────────────────────────┐
│  Next.js 16 (App Router) + React 19 + TypeScript strict + Tailwind 4              │
│  ├─ Telas (src/app)          rotas por função: cliente, profissional, parceiro,   │
│  │                           admin — protegidas por guard de sessão/função         │
│  ├─ Componentes (src/components)  design system PRIVÉ reutilizável                 │
│  ├─ Camada de dados (src/lib/db.ts)  ÚNICO ponto de acesso a dados                 │
│  │     • MODO DEMONSTRAÇÃO: localStorage + seed (sem backend)                      │
│  │     • MODO SUPABASE: supabase-js (Auth, Postgres, Storage, Realtime)            │
│  └─ Service worker (public/sw.js)  shell offline, nunca guarda dados privados      │
└───────────────────────────────────────┬───────────────────────────────────────────┘
                                        │ HTTPS (TLS 1.2+) + JWT do Supabase Auth
┌───────────────────────────────────────▼───────────────────────────────────────────┐
│ Supabase                                                                          │
│  ├─ Auth: e-mail/senha, confirmação de e-mail, recuperação de senha              │
│  ├─ Postgres 15+: tabelas com RLS em 100% delas, triggers de integridade          │
│  ├─ Storage: 3 buckets PRIVADOS, leitura só por URL assinada                      │
│  ├─ Realtime: chat e notificações                                                 │
│  └─ Edge Functions (fase 7+): moderação de imagem, e-mails transacionais          │
└───────────────────────────────────────────────────────────────────────────────────┘
```

Princípios:

- **Segurança no banco, não só na tela.** Toda regra crítica (maioridade, publicação só após
  verificação, quem pode mudar o status de uma reserva, avaliação só após reserva concluída,
  mascaramento de contatos no chat) existe **duas vezes**: em `src/lib/db.ts`, para a
  experiência na tela, e em `supabase/migrations/0001_init.sql`, como política RLS, constraint ou
  trigger. A segunda é a que vale.
- **Camada de dados única.** As telas não sabem se estão falando com o localStorage ou com o
  Supabase. Trocar de modo não muda a interface.
- **Mobile first.** Layout pensado para 390px, com área segura do iPhone, navegação inferior e
  sheets. No desktop o app fica centralizado e o admin ganha barra lateral.

## 2. Estrutura de pastas

```
prive/
├── docs/ARQUITETURA.md          este documento
├── public/                      ícones PWA, service worker, página offline
├── supabase/
│   ├── migrations/0001_init.sql esquema completo + RLS + storage + triggers
│   └── tests/                   testes de RLS rodando num PostgreSQL real
└── src/
    ├── app/
    │   ├── page.tsx             splash + aviso 18+
    │   ├── (auth)/              entrar, cadastro, recuperar
    │   ├── (app)/               área logada com navegação inferior
    │   │   ├── inicio/          Tela 2 — página inicial
    │   │   ├── buscar/          Tela 3 — pesquisa e filtros
    │   │   ├── perfil/[id]/     Tela 4 — perfil  (+ /agendar = Tela 5)
    │   │   ├── reservas/        Tela 5 — histórico de solicitações
    │   │   ├── mensagens/       chat privado
    │   │   ├── conta/           Tela 6 — minha conta, privacidade, suporte
    │   │   ├── profissional/    Tela 7 — painel profissional
    │   │   ├── estabelecimentos/  Tela 8 — vitrine de parceiros
    │   │   └── parceiro/        Tela 8 — gestão do estabelecimento
    │   ├── admin/               Tela 9 — painel administrativo
    │   └── manifest.ts          manifesto PWA
    ├── components/              ui, arte, guard, calendário, denúncia, reservas…
    └── lib/
        ├── db.ts                camada de dados + regras de negócio
        ├── safety.ts            maioridade, mascaramento, termos de risco, senha
        ├── config.ts            feature flags de conformidade, cidades, categorias
        ├── seed.ts              dados de demonstração
        └── types.ts             modelo de dados
```

## 3. Modelo do banco de dados

| Tabela | Finalidade | Quem acessa (RLS) |
|---|---|---|
| `accounts` | nome de exibição, função, status | titular; admin com `users.manage` |
| `account_private` | data de nascimento (CHECK ≥ 18 anos) | titular; equipe de verificação |
| `consents` | consentimentos LGPD | titular |
| `admin_permissions` | permissões granulares de admin | `permissions.manage` |
| `professionals` | perfil profissional (CHECK: publicado ⇒ verificado) | todos veem só publicados e verificados; dono; moderação |
| `professional_photos` | fotos (bucket privado) com status de moderação | aprovadas de perfis visíveis; dono; moderação |
| `availability`, `blocked_dates` | agenda semanal e bloqueios | público lê de perfis visíveis; dono edita |
| `verification_requests` | documento + selfie (bucket `verification-docs`) | titular envia; só verificação lê |
| `establishments`, `establishment_photos` | parceiros com alvará | aprovados públicos; dono; `establishments.manage` |
| `favorites` | favoritos | titular |
| `bookings` | solicitações (EXCLUDE impede horário duplicado) | cliente e dono do perfil/local; transições validadas por trigger |
| `reviews` | avaliações (1 por reserva concluída) | públicas; inserção só com reserva concluída |
| `conversations`, `messages` | chat (trigger mascara contatos e sinaliza risco) | participantes; moderação vê sinalizadas |
| `blocks` | bloqueios (escondem perfis e travam chat) | titular |
| `reports` | denúncias (prioridade urgente automática) | denunciante; moderação |
| `notifications` | notificações in-app | titular |
| `audit_log` | auditoria administrativa, **somente inserção** | leitura por admins; ninguém altera |

Relacionamentos principais: `auth.users 1─1 accounts 1─0..1 professionals 1─N photos/availability/bookings`,
`accounts(partner) 1─N establishments`, `bookings 1─0..1 reviews`, `conversations 1─N messages`.

## 4. Tecnologias escolhidas

| Camada | Escolha | Motivo |
|---|---|---|
| Frontend | Next.js 16 + React 19 + TypeScript strict | rotas, PWA nativo (`manifest.ts`), SSR quando necessário |
| Estilo | Tailwind CSS 4 com tokens próprios | identidade preto/dourado consistente |
| Tipografia | Cormorant Garamond (títulos) + Manrope (texto) | elegância editorial + legibilidade no celular |
| Ícones | lucide-react (traço fino) | minimalistas |
| Backend | Supabase (Auth, Postgres, Storage, Realtime) | RLS nativa, sem servidor próprio para manter |
| Banco | PostgreSQL 15+ | constraints, EXCLUDE, triggers |
| Hospedagem | Vercel (frontend) + Supabase (região São Paulo, `sa-east-1`) | dados no Brasil, LGPD |

## 5. Cronograma de desenvolvimento

| Etapa | Entrega | Status |
|---|---|---|
| 1. Arquitetura | este documento | ✅ |
| 2. Identidade visual | tokens, tipografia, logotipo, ícones PWA, componentes | ✅ |
| 3. Telas principais | as 9 telas navegáveis e funcionais (modo demonstração) | ✅ |
| 4. Banco de dados | `0001_init.sql` com RLS, storage e triggers + testes | ✅ (validado em PostgreSQL 16) |
| 5. Autenticação | ligar `db.ts` ao Supabase Auth (cadastro, login, recuperação, confirmação de e-mail) | ⏭ próxima |
| 6. Pesquisa e perfis | consultas reais, upload de fotos no Storage, URLs assinadas | ⏳ |
| 7. Disponibilidade e solicitações | reservas no banco, Realtime no chat e notificações | ⏳ |
| 8. Painel administrativo | ações do admin via banco, fila de moderação de imagens | ⏳ |
| 9. Segurança e testes | pentest básico, testes E2E, revisão LGPD/DPIA, rate limiting | ⏳ |
| 10. PWA | push notifications, ícones finais, publicação | ⏳ |

As etapas 5 a 8 já têm a interface pronta; falta trocar a camada de dados (`src/lib/db.ts`) do
modo demonstração para o Supabase, função por função.

## 6. Segurança e privacidade implementadas

- Aviso 18+ antes de qualquer conteúdo; data de nascimento obrigatória; bloqueio de menores no
  cadastro (tela + trigger + CHECK no banco).
- Perfil profissional só aparece após **verificação de identidade e maioridade** (documento +
  selfie), aprovada manualmente por um admin com permissão específica. Aprovação bloqueada se o
  documento indicar menos de 18 anos.
- Controle de acesso por função (cliente, profissional, parceiro, admin) e permissões granulares
  para administradores.
- Imagens e documentos em buckets **privados**; leitura só por URL assinada de curta duração.
- Chat: mascaramento de telefone, e-mail, links e chave PIX; detecção de termos de risco
  (menores, coerção) gera **denúncia automática urgente**.
- Denúncia e bloqueio em perfis, conversas, mensagens e estabelecimentos; canais oficiais
  (190, Disque 100, 180) na tela de suporte e após denúncias graves.
- Auditoria administrativa somente inserção.
- LGPD: consentimentos separados (obrigatórios × opcionais), exportação dos dados, exclusão de
  conta, dados sensíveis separados da conta pública.
- Cabeçalhos de segurança (HSTS, X-Frame-Options, noindex), service worker que não guarda dados privados.
- Modo discreto (desfoca imagens) e app instalável sem histórico de navegador.

## 7. Pontos jurídicos e de conformidade (sinalizados antes de implementar)

> Isto não é parecer jurídico. Valide com advogado(a) antes de lançar.

1. **Intermediação comercial e pagamentos — DESLIGADOS** (`FEATURES.payments = false`,
   `commissions = false`). No Brasil, a atividade da pessoa adulta independente não é crime, mas
   **tirar proveito da prostituição alheia ou facilitá-la** é (Código Penal, arts. 228–230). Cobrar
   comissão por encontro, processar o pagamento ou "agenciar" pode ser enquadrado assim.
   *Alternativa adotada:* plataforma de **anúncio, verificação e agenda**. O valor é apenas
   informativo, não há transação, e a monetização futura deve vir de **assinatura fixa de
   anúncio/destaque**, independente de encontros, mediante parecer jurídico.
2. **Estabelecimentos parceiros.** Manter local para encontros sexuais com fins lucrativos é crime
   (art. 229). *Alternativa adotada:* parceiros são hotéis, restaurantes, lounges e spas com alvará,
   e a reserva se limita a **serviços próprios do estabelecimento** (mesa, suíte, sala). O formulário
   proíbe intermediação de terceiros e todo local passa por análise de alvará.
3. **Lojas de aplicativos.** Apple App Store e Google Play não aceitam apps desse segmento. Por
   isso a distribuição é por **PWA** (instalação direta pelo navegador), que é o que foi pedido.
4. **Fornecedores.** Verifique os termos de uso de Vercel, Supabase, provedor de e-mail e de
   verificação de identidade para conteúdo adulto. Alguns proíbem; nesse caso, use hospedagem com
   política compatível. Gateways de pagamento costumam proibir esse segmento, mais um motivo para
   manter pagamentos desligados.
5. **Conteúdo.** Fotos sem nudez e sem descrição de atos sexuais (regras na tela de perfil e na
   moderação). Isso reduz o risco jurídico e com fornecedores.
6. **Combate à exploração.** Recomenda-se um protocolo interno de resposta (preservar evidências,
   suspender, comunicar à Polícia Federal/SaferNet/Disque 100), equipe de moderação humana e
   verificação de identidade por fornecedor especializado (biometria + prova de vida) antes do
   lançamento.
7. **LGPD.** Dados sobre vida sexual são **dados sensíveis** (art. 5º, II). É necessário:
   encarregado (DPO), relatório de impacto (RIPD), base legal de consentimento específico, dados
   hospedados no Brasil e política de retenção definida.
