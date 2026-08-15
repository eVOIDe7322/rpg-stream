# RPG Stream

[![CI](https://github.com/eVOIDe7322/rpg-stream/actions/workflows/ci.yml/badge.svg)](https://github.com/eVOIDe7322/rpg-stream/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20.12-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Servidor de mídia self-hosted para organizar, converter e assistir a vídeos pelo navegador. O RPG Stream usa Express, SQLite e FFmpeg, funciona inteiramente na sua própria máquina e entrega os vídeos em HLS para reprodução eficiente na rede local.

## Principais recursos

- Upload e conversão para HLS em uma fila persistente, com pausa, retomada e cancelamento.
- Capas automáticas extraídas do vídeo, com seleção manual de outro momento.
- Pesquisa, filtros, ordenação, paginação, favoritos e controle de vídeos não assistidos.
- Retomada automática da reprodução e marcadores de tempo por vídeo.
- Histórico de processamento e atualizações em tempo real sobre a fila.
- Painel administrativo com uso de disco, maiores vídeos, erros e estado da fila.
- Lixeira com retenção configurável, restauração e exclusão definitiva.
- Backup e restauração do banco de dados e da biblioteca de mídia.
- Controle de acesso com papéis de administrador, editor e visualizador.
- HTTPS opcional para acesso seguro por outros dispositivos da rede.

## Tecnologias

- Node.js e TypeScript
- Express 5
- SQLite
- FFmpeg e FFprobe
- HLS.js
- HTML, CSS e JavaScript no frontend

## Requisitos

- [Node.js](https://nodejs.org/) 20.12 ou superior.
- FFmpeg e FFprobe disponíveis no `PATH`.
- Espaço em disco suficiente para os arquivos originais, segmentos HLS e backups.

Confirme as dependências com:

```bash
node --version
ffmpeg -version
ffprobe -version
```

## Instalação rápida

```bash
git clone https://github.com/eVOIDe7322/rpg-stream.git
cd rpg-stream
npm ci
```

Crie a configuração local a partir do exemplo:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# Linux e macOS
cp .env.example .env
```

Defina no mínimo uma senha forte para o primeiro administrador:

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=troque-por-uma-senha-com-pelo-menos-8-caracteres
```

Inicie o ambiente de desenvolvimento:

```bash
npm run dev
```

A interface estará disponível em [http://localhost:8080](http://localhost:8080).

## Execução compilada

```bash
npm run build
npm start
```

O comando `npm run build` gera o JavaScript em `dist/`. O banco e os diretórios de dados são criados automaticamente na primeira inicialização.

## Configuração

As variáveis podem ser definidas no ambiente do processo ou em um arquivo `.env` na raiz. Valores do ambiente têm prioridade.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `8080` | Porta HTTP ou HTTPS do servidor. |
| `PUBLIC_HOST` | `localhost` | Host exibido no endereço de inicialização. |
| `ADMIN_USERNAME` | `admin` | Nome do primeiro administrador. |
| `ADMIN_PASSWORD` | vazio | Senha inicial, com no mínimo oito caracteres. |
| `QUEUE_CONCURRENCY` | `1` | Quantidade máxima de conversões simultâneas. |
| `TRASH_RETENTION_DAYS` | `30` | Dias até a exclusão automática de itens da lixeira. |
| `TLS_CERT_FILE` | vazio | Caminho do certificado TLS. |
| `TLS_KEY_FILE` | vazio | Caminho da chave privada TLS. |

`TLS_CERT_FILE` e `TLS_KEY_FILE` precisam ser informadas em conjunto. A variável legada `ACCESS_PIN` continua aceita apenas para migração e cria o usuário `admin`.

## Usuários e segurança

Na primeira inicialização com `ADMIN_USERNAME` e `ADMIN_PASSWORD`, o administrador é gravado no SQLite com senha protegida por `scrypt`. Os demais usuários podem ser criados no painel:

- `admin`: gerencia usuários, painel, backups, restauração e lixeira;
- `editor`: envia, altera, processa e envia vídeos para a lixeira;
- `viewer`: consulta e assiste aos vídeos sem permissão de alteração.

Se ainda não existir nenhum usuário e nenhuma senha estiver configurada, o acesso local fica liberado como administrador. Configure as credenciais antes de expor o serviço na rede.

A autenticação usa HTTP Basic. Para acesso por outros dispositivos, habilite HTTPS:

```dotenv
PUBLIC_HOST=192.168.1.20
TLS_CERT_FILE=certificados/servidor.crt
TLS_KEY_FILE=certificados/servidor.key
```

Nunca envie `.env`, chaves privadas, banco de dados, vídeos ou backups para o repositório.

## Dados persistentes

Estes caminhos são criados e utilizados em tempo de execução, mas são ignorados pelo Git:

| Caminho | Conteúdo |
| --- | --- |
| `database.db` | Metadados, usuários, fila e estado da aplicação. |
| `videos_data/` | Vídeos processados, playlists HLS e capas. |
| `temp/` | Uploads e arquivos temporários. |
| `backups/` | Backups, restaurações pendentes e rollback. |

Faça backup de `database.db` e `videos_data/` juntos para manter a biblioteca consistente. O painel administrativo também gera e restaura um arquivo ZIP completo.

## Scripts disponíveis

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Executa o servidor em modo de desenvolvimento com recarga automática. |
| `npm run build` | Compila TypeScript para `dist/`. |
| `npm start` | Inicia a versão compilada. |
| `npm test` | Compila e executa a suíte de testes. |

## Estrutura do projeto

```text
src/
├── config/            # Configuração da aplicação
├── main/              # Composição e inicialização
├── modules/           # Admin, categorias, usuários e vídeos
├── shared/            # Banco, filesystem e camada HTTP compartilhada
└── types/              # Extensões de tipos
public/                 # Interface web e HLS.js local
tests/                  # Testes automatizados
```

O backend segue um monólito modular, separando domínio, aplicação, infraestrutura e apresentação dentro de cada módulo.

## Desenvolvimento e testes

Antes de enviar alterações:

```bash
npm ci
npm test
```

Pull requests e pushes para `main` também são validados pelo GitHub Actions.

## Licença

Distribuído sob a licença MIT. Consulte [LICENSE](LICENSE).
