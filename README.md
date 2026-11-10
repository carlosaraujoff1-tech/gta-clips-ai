# GTA Clips AI

Plataforma **local** que transforma lives e gravações de GTA RP em cortes verticais (9:16),
legendados e prontos para TikTok, YouTube Shorts e Instagram Reels — **sempre com a sua
aprovação antes de qualquer publicação**.

Tudo roda no seu computador: sem APIs pagas, sem nuvem, funcionando offline depois de instalado.

## Status

| Fase | Nome | Status |
|---|---|---|
| 1 | Fundação | ✅ Concluída (aguardando validação no PC Windows) |
| 2 | Importação | ✅ Concluída (aguardando validação no PC Windows) |
| 3 | Transcrição (Faster-Whisper) | ✅ Concluída (aguardando validação no PC Windows) |
| 4 | Inteligência artificial (Ollama + Qwen3 4B) | ⏳ Aguardando autorização |
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
- **FFmpeg** (inclui o FFprobe, usado para ler os metadados dos vídeos a partir da Fase 2)

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

## Importando gravações (Fase 2)

1. Em **Configurações**, defina as pastas do HD externo e clique em **Criar pastas que faltam**.
2. Em **Lives**:
   - **Escanear pasta de originais** registra todos os vídeos que já estão na pasta de originais
     (inclusive em subpastas). Rodar de novo não duplica nada.
   - **Importar arquivo** copia um vídeo de outra pasta (ex.: a pasta do OBS) para os originais.
     Dica: no Explorador, `Shift` + botão direito no vídeo → **Copiar como caminho**.
3. Duração, resolução, FPS, codecs e faixas de áudio são lidos com o FFprobe.
4. Cópias e varreduras rodam em segundo plano, com progresso e botão de cancelar.

Regras de segurança dos arquivos:
- O arquivo original **nunca é movido nem apagado**; a importação só copia.
- A cópia é feita em um arquivo temporário `.part`, renomeado só no final. Se cancelar ou der
  erro, o temporário é removido.
- A cópia é recusada se for deixar menos de 1 GB livre no HD.
- **Remover da biblioteca** apaga só o registro; o vídeo continua no disco.

## Transcrevendo (Fase 3)

1. Em **Configurações → Transcrição (Whisper)**, clique em **Baixar** no modelo `small`
   (~480 MB, precisa de internet **uma única vez**). O modelo fica em `backend/data/models` no SSD.
2. Em **Lives**, abra uma gravação e clique em **Transcrever** (escolha a faixa de áudio se a
   live tiver mais de uma), ou use **Transcrever pendentes** para enfileirar todas.
3. Acompanhe em **Tarefas**: extração do áudio, progresso e tempo restante estimado.
4. **Ver transcrição** mostra o texto com horários, busca (ignora acentos) e exporta SRT, VTT
   ou TXT.

Detalhes técnicos:
- Roda **na CPU** (int8). O Faster-Whisper não tem aceleração para GPUs AMD no Windows.
- Silêncios são pulados (VAD), o que acelera bastante lives longas.
- Os horários de cada palavra são guardados para as legendas sincronizadas da Fase 5.
- O áudio temporário (WAV) vai para a pasta de processamento e é apagado ao final, mesmo se
  der erro ou for cancelado.

## Princípios

- **Aprovação obrigatória**: nada é publicado sem ação explícita sua.
- **Vídeos fora do banco**: o banco guarda só caminhos e metadados.
- **Caminhos configuráveis**: a letra do HD externo não é fixa; o sistema avisa se a unidade sumir.
- **Segurança**: a API só aceita conexões locais, rejeita comandos arbitrários e só executa
  `ffmpeg`/`ffprobe` com argumentos fixos.
- **Sem botões falsos**: o que ainda não existe aparece desabilitado com a fase prevista.

Detalhes técnicos em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
