# GTA Clips AI

Plataforma **local** que transforma lives e gravações de GTA RP em cortes verticais (9:16),
legendados e prontos para TikTok, YouTube Shorts e Instagram Reels — **sempre com a sua
aprovação antes de qualquer publicação**.

Tudo roda no seu computador: sem APIs pagas, sem nuvem, funcionando offline depois de instalado.

## Status

| Fase | Nome | Status |
|---|---|---|
| 1 | Fundação | ✅ Concluída (aguardando validação no PC Windows) |
| 2 | Importação | ⏳ Aguardando autorização |
| 3 | Transcrição (Faster-Whisper) | — |
| 4 | Inteligência artificial (Ollama + Qwen3 4B) | — |
| 5 | Edição automática (FFmpeg, 9:16, legendas) | — |
| 6 | Aprovação | — |
| 7 | Publicação | — |
| 8 | Métricas | — |

## Estrutura

```
gta-clips-ai/
├── backend/            API local (Python 3.11 + FastAPI + SQLAlchemy + SQLite)
│   ├── app/
│   │   ├── api/        Rotas HTTP
│   │   ├── core/       Configuração, logs, erros, segurança
│   │   ├── db/         Modelos e sessão do banco
│   │   ├── schemas/    Validação de dados (Pydantic)
│   │   └── services/   Regras de negócio (armazenamento, status do sistema…)
│   ├── alembic/        Migrações do banco (evolução da estrutura)
│   └── tests/          Testes automatizados
├── frontend/           Interface (Next.js + React + TypeScript strict + Tailwind)
│   └── src/
│       ├── app/        Páginas (rotas)
│       ├── components/ Componentes visuais reutilizáveis
│       ├── features/   Telas de cada área
│       └── lib/        Cliente da API, tipos e utilitários
└── docs/               Documentação técnica
```

## Como rodar no Windows (desenvolvimento)

### Pré-requisitos

- **Python 3.11** e **uv** (gerenciador de pacotes Python) — `winget install astral-sh.uv`
- **Node.js 20.9+** (recomendado 22 LTS)
- **Git**
- **FFmpeg** (opcional na Fase 1; necessário a partir da Fase 2)

> Nada disso é instalado automaticamente. Cada instalação será combinada antes.

### 1. Backend

Abra o PowerShell na pasta do projeto:

```powershell
cd backend
uv sync              # cria o ambiente isolado (.venv) e instala as dependências
uv run python -m app.main
```

O backend sobe em `http://127.0.0.1:8000` (acessível **somente** deste computador).
O banco SQLite e os logs ficam em `backend/data/` (no SSD).

### 2. Frontend

Em outro terminal:

```powershell
cd frontend
npm install
npm run dev
```

Acesse **http://localhost:3000**.

### Testes e verificações

```powershell
cd backend
uv run pytest           # testes
uv run ruff check .     # estilo
uv run mypy app         # tipos (modo strict)

cd ../frontend
npm run typecheck       # TypeScript strict
npm run lint
npm run build
```

## Princípios

- **Aprovação obrigatória**: nada é publicado sem ação explícita sua.
- **Vídeos fora do banco**: o banco guarda só caminhos e metadados.
- **Caminhos configuráveis**: a letra do HD externo não é fixa; o sistema avisa se a unidade sumir.
- **Segurança**: a API só aceita conexões locais, rejeita comandos arbitrários e só executa
  `ffmpeg`/`ffprobe` com argumentos fixos.
- **Sem botões falsos**: o que ainda não existe aparece desabilitado com a fase prevista.

Detalhes técnicos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
