# Motors Connect API - Driver

API robusta desenvolvida para atender as necessidades do aplicativo de motoristas do Motors Connect, baseada nas regras de negócio e estrutura do projeto Robert Marinho.

## 🚀 Tecnologias
- Node.js
- Express
- Supabase (PostgreSQL + Auth)
- Vercel (Hospedagem)
- Zod (Validação)

## 🛠️ Endpoints

### Autenticação
A autenticação é feita via Supabase Auth. O token JWT deve ser enviado no header `Authorization: Bearer <token>`.

### Motorista
- `GET /api/motorista/me`: Retorna os dados do perfil do motorista logado.

### Ordens de Serviço (OS)
- `GET /api/motorista/ordens`: Lista todas as OS atribuídas ao motorista.
- `GET /api/motorista/ordens/:id`: Detalhes de uma OS específica, incluindo paradas.
- `PATCH /api/motorista/ordens/:id/status`: Atualiza o status da OS (Check-in/Check-out).
  - Body: `{ "status": "em_andamento", "km_inicial": 1234, "horario_inicio": "14:00" }`

### Paradas
- `PATCH /api/motorista/paradas/:id`: Marca uma parada como realizada.
  - Body: `{ "realizada": true, "horario_realizado": "14:30" }`

### Financeiro
- `GET /api/motorista/ganhos`: Retorna o resumo de ganhos das corridas concluídas.

## 📦 Deploy
O deploy é realizado automaticamente na Vercel ao fazer push para o repositório.

## 🔗 Links Úteis
- Repositório: https://github.com/CaioIbraim/motors-connect-api
- Supabase Project: https://oyawlljkggeovnhlufwg.supabase.co

