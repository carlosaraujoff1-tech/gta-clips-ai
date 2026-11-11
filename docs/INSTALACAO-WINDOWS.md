# Instalação no Windows 11 — passo a passo

Guia para colocar o GTA Clips AI para funcionar no seu PC (Ryzen 5 5500, RX 7600 8 GB,
32 GB de RAM, SSD interno + HD externo). Tempo total: cerca de 40 a 60 minutos, a maior parte
esperando downloads.

> **Aviso honesto:** este guia foi escrito e testado em Linux. No Windows, você é o primeiro a
> rodar. Se algum passo der erro, copie a mensagem inteira e mande para mim: eu corrijo o guia.

Tudo roda **localmente**. Depois de instalado e com os modelos baixados, funciona sem internet.

---

## Visão geral

| Etapa | O que faz | Tempo |
|---|---|---|
| 1 | Instalar os programas (Git, uv, Node.js, FFmpeg, Ollama) | ~10 min |
| 2 | Baixar o projeto e instalar as dependências | ~10 min |
| 3 | Iniciar o sistema e configurar as pastas do HD externo | ~5 min |
| 4 | Baixar os modelos de IA (transcrição e análise) | ~10–20 min |
| 5 | Conferir se está tudo certo | ~2 min |
| 6 | Testar com uma live | — |

Espaço necessário no **SSD**: cerca de 8 GB (programas, dependências e modelos).
Espaço no **HD externo**: depende das lives (uma hora de OBS ocupa de 5 a 15 GB).

---

## Etapa 1 — Instalar os programas

Abra o **PowerShell** (menu Iniciar → digite `PowerShell` → abrir). **Não precisa ser como
administrador.** Rode cada comando abaixo, um de cada vez. Se o Windows perguntar se aceita os
termos do `winget`, digite `S` e Enter.

O que cada programa faz:

| Programa | Para quê |
|---|---|
| **Git** | baixar o projeto do GitHub |
| **uv** | instala o Python 3.11 (isolado, sem mexer no seu) e as bibliotecas do backend |
| **Node.js** | roda a interface |
| **FFmpeg** | lê e edita os vídeos (inclui o FFprobe) |
| **Ollama** | roda a IA que escolhe os melhores momentos (usa a RX 7600) |

```powershell
winget install --id Git.Git -e
```

```powershell
winget install --id astral-sh.uv -e
```

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

```powershell
winget install --id Gyan.FFmpeg -e
```

```powershell
winget install --id Ollama.Ollama -e
```

**Depois de instalar tudo: feche o PowerShell e abra outro.** Isso é obrigatório: o Windows só
enxerga os programas novos em um terminal novo.

Confira se instalou (cada comando deve mostrar uma versão):

```powershell
git --version
```

```powershell
uv --version
```

```powershell
node --version
```

```powershell
ffmpeg -version
```

```powershell
ollama --version
```

> O Ollama abre sozinho depois de instalado e fica com um ícone perto do relógio. **Deixe-o
> aberto** sempre que for usar a análise com IA.

---

## Etapa 2 — Baixar o projeto e instalar as dependências

O código fica no **SSD** (não no HD externo). Sugestão: `C:\gta-clips-ai`.

```powershell
cd C:\
```

```powershell
git clone https://github.com/carlosaraujoff1-tech/gta-clips-ai
```

> Se o repositório estiver **privado**, o Git abre uma janela do navegador para você entrar na
> sua conta do GitHub. É normal: faça o login e autorize.

**Backend** (o "motor"). O `uv sync` baixa o Python 3.11 sozinho e instala tudo (pode levar uns
5 minutos, são bibliotecas de IA grandes):

```powershell
cd C:\gta-clips-ai\backend
```

```powershell
uv sync
```

**Frontend** (a interface):

```powershell
cd C:\gta-clips-ai\frontend
```

```powershell
npm install
```

---

## Etapa 3 — Iniciar o sistema

### Jeito fácil

Dê dois cliques em **`C:\gta-clips-ai\scripts\iniciar.bat`**. Ele abre duas janelas pretas
(backend e frontend) e depois o navegador em `http://localhost:3000`.

> Não feche as duas janelas pretas enquanto estiver usando o sistema. Para desligar, feche-as.

### Jeito manual (se o atalho não funcionar)

Em um PowerShell:

```powershell
cd C:\gta-clips-ai\backend
```

```powershell
uv run python -m app.main
```

Em **outro** PowerShell:

```powershell
cd C:\gta-clips-ai\frontend
```

```powershell
npm run dev
```

Depois abra **http://localhost:3000** no navegador.

### Configurar as pastas do HD externo

1. Conecte o HD externo e veja qual letra o Windows deu a ele (Este Computador). Abaixo vou
   usar `E:`; troque pela sua.
2. No sistema, vá em **Configurações → Armazenamento de vídeos**.
3. No campo **"Atalho: pasta raiz no HD externo"**, digite `E:\GTA-CLIPS-AI` e clique em
   **Preencher pastas**.
4. Clique em **Salvar** (barra de baixo) e depois em **Criar pastas que faltam**.
5. Os quatro status devem ficar **"Pronta"** em verde.

> Se a letra do HD mudar um dia, é só repetir esse passo. O sistema avisa quando não encontra a
> unidade.

---

## Etapa 4 — Baixar os modelos de IA

São baixados **uma única vez** (precisa de internet). Depois funcionam offline.

### Transcrição (Whisper)

Em **Configurações → Transcrição (Whisper)**, clique em **Baixar** no modelo:

| Modelo | Tamanho | Quando usar |
|---|---|---|
| `small` | ~0,5 GB | Rápido. Bom para começar. |
| `medium` | ~1,5 GB | **Mais preciso** (erra menos palavras na legenda), 2 a 3 vezes mais lento. |

Dica: comece com o `small`, e se as legendas errarem muito, baixe o `medium` e troque em
"Modelo".

### Análise com IA (Ollama)

Em **Configurações → Análise com IA**, clique em **Baixar modelo** (`qwen3:4b-instruct`,
~2,5 GB).

Se preferir pelo terminal:

```powershell
ollama pull qwen3:4b-instruct
```

> O nome certo é **`qwen3:4b-instruct`**. O `qwen3:4b` sem o "instruct" é uma variante que
> "pensa em voz alta" e é muito mais lenta.

---

## Etapa 5 — Conferir se está tudo certo

Em **Configurações → Status dos serviços** (botão **Verificar novamente**), deve aparecer:

| Serviço | Esperado |
|---|---|
| Backend, Banco de dados | OK |
| FFmpeg e FFprobe | OK (com a versão) |
| Codificação por GPU AMD (AMF) | OK. Se estiver "Atenção", o sistema usa a CPU (mais lento, mas funciona) |
| Faster-Whisper | OK |
| Ollama e Modelo `qwen3:4b-instruct` | OK |

**Para saber se o Ollama está usando a placa de vídeo**, com a análise rodando, abra outro
PowerShell e rode:

```powershell
ollama ps
```

Na coluna **PROCESSOR**, aparece `100% GPU` (ótimo) ou `100% CPU` (funciona, mas mais lento).

---

## Etapa 6 — Testar com uma live

1. Vá em **Lives → Importar arquivo** e cole o caminho do vídeo (no Explorador: segure `Shift`,
   botão direito no arquivo → **Copiar como caminho**).
   Formatos aceitos: `.mp4`, `.mkv`, `.mov`, `.flv`, `.ts`, `.m2ts`, `.mpg`, `.mpeg`, `.webm`,
   `.avi`, `.m4v`.
2. Clique na gravação → **Transcrever**.
3. Depois → **Encontrar melhores momentos**.
4. Em **Clips**, clique em **Gerar vídeo** nas sugestões. Use **Editar** para ajustar.
5. Em **Aprovação**, assista e aprove ou rejeite. **Nada é publicado sem a sua aprovação.**

**Marque a posição da sua câmera** (para o layout "Câmera + jogo") em Configurações → Edição do
vídeo → "Posição da sua câmera na live": arraste um retângulo sobre ela.

Quanto tempo leva: depende da live e do PC. Para você ter uma ideia, no ambiente de teste (4
núcleos, sem GPU) uma live de 4 horas levou cerca de 2 horas só para transcrever com o `medium`.
Seu PC deve ser mais rápido, mas **cronometre a primeira live** para saber o seu tempo real.

---

## Dia a dia

- **Abrir:** Ollama aberto + `scripts\iniciar.bat`.
- **Atualizar o sistema** (quando eu avisar que há novidade):

```powershell
cd C:\gta-clips-ai
```

```powershell
git pull
```

```powershell
cd backend
```

```powershell
uv sync
```

```powershell
cd ..\frontend
```

```powershell
npm install
```

- **Onde ficam os dados:** banco, logs e modelos em `C:\gta-clips-ai\backend\data` (SSD).
  Vídeos nas pastas do HD externo.
- **Backup:** copie a pasta `C:\gta-clips-ai\backend\data` de vez em quando.

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| `winget`, `uv`, `git`, `node` ou `ffmpeg` "não é reconhecido" | Feche o PowerShell e abra outro. Se persistir, reinicie o PC. |
| Interface mostra "Backend offline" | A janela preta do backend fechou ou deu erro. Abra `iniciar.bat` de novo e leia a mensagem na janela. |
| "Porta já em uso" (8000 ou 3000) | Já há uma cópia aberta. Feche as janelas pretas antigas. |
| Status do FFmpeg "Não encontrado" | Feche e abra o terminal e o `iniciar.bat`. Ou informe o caminho do `ffmpeg.exe` em Configurações → Ferramentas. |
| Ollama "Não encontrado" | Abra o Ollama (ícone perto do relógio, ou menu Iniciar → Ollama). |
| Pasta do HD "Unidade não encontrada" | O HD está desconectado ou mudou de letra. Ajuste em Configurações. |
| Análise muito lenta | Rode `ollama ps` e veja se está em GPU. Feche o jogo/OBS durante o processamento. |
| Antivírus bloqueia algo | O sistema só roda neste computador. Se bloquear o FFmpeg ou o Ollama, adicione exceção. |

Se algo der errado, mande para mim: a mensagem de erro completa e, se puder, o conteúdo de
`C:\gta-clips-ai\backend\data\logs\backend.log` (últimas linhas).

---

## Segurança e privacidade

- O backend só escuta em `127.0.0.1` (este computador). Nada fica exposto na rede.
- Nenhum vídeo é enviado para a internet. A transcrição e a IA rodam localmente.
- Nada é publicado em rede social sem a sua aprovação explícita.
- A internet só é usada para baixar programas e modelos.
