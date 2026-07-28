const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const helmet = require('@fastify/helmet');
const swagger = require('@fastify/swagger');
const swaggerUi = require('@fastify/swagger-ui');
const basicAuth = require('@fastify/basic-auth');
const { createClient } = require('@supabase/supabase-js');
const { serializerCompiler, validatorCompiler, jsonSchemaTransform } = require('fastify-type-provider-zod');
const z = require('zod');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(cors, { origin: true });
fastify.register(helmet, { contentSecurityPolicy: false });

const roleHierarchy = {
  admin: ['admin'],
  operador: ['admin', 'operador'],
  motorista: ['admin', 'operador', 'motorista'],
  cliente: ['admin', 'operador', 'cliente']
};

const publicTables = ['landing_pages', 'melhorias_solicitadas'];
const adminTables = [
  'perfis',
  'empresas',
  'clientes',
  'motoristas',
  'veiculos',
  'ordens_servico',
  'ordem_servico_paradas',
  'ordem_servico_passageiros',
  'ordem_servico_rotas',
  'passageiros',
  'tarifarios',
  'recebimentos',
  'repasse_motoristas',
  'veiculo_abastecimentos',
  'veiculo_manutencoes',
  'eventos_veiculo',
  'notificacoes',
  'logs_auditoria',
  'emails_recebidos',
  'landing_pages',
  'configuracoes_sistema',
  'melhorias_solicitadas'
];

const operadorTables = [
  'empresas',
  'clientes',
  'motoristas',
  'veiculos',
  'ordens_servico',
  'ordem_servico_paradas',
  'ordem_servico_passageiros',
  'ordem_servico_rotas',
  'passageiros',
  'tarifarios',
  'veiculo_abastecimentos',
  'veiculo_manutencoes',
  'eventos_veiculo',
  'notificacoes'
];

const motoristaReadableRelations = '*';
const ordemRelations = '*';
const updatedAtTables = new Set(['empresas', 'motoristas', 'ordens_servico', 'recebimentos', 'ordem_servico_paradas', 'landing_pages', 'configuracoes_sistema', 'melhorias_solicitadas', 'passageiros', 'ordem_servico_rotas']);
const searchColumnsByTable = {
  perfis: ['email', 'full_name', 'nome', 'cpf', 'telefone'],
  empresas: ['razao_social', 'nome_fantasia', 'cnpj', 'email', 'telefone', 'cpf'],
  clientes: ['nome'],
  motoristas: ['nome', 'cpf', 'telefone', 'cnh', 'email'],
  veiculos: ['placa', 'modelo', 'cor'],
  ordens_servico: ['numero_os', 'nome_passageiro', 'origem', 'destino', 'passageiro', 'voucher'],
  passageiros: ['nome', 'telefone'],
  tarifarios: ['origem', 'destino', 'descricao'],
  notificacoes: ['titulo', 'mensagem', 'tipo'],
  logs_auditoria: ['nome_usuario', 'tipo_acao', 'tabela_afetada', 'object_id'],
  emails_recebidos: ['type'],
  landing_pages: ['slug', 'title'],
  melhorias_solicitadas: ['nome', 'descricao']
};

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
  status: z.string().optional(),
  search: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

const idParamSchema = z.object({ id: z.string().uuid() });
const anyBodySchema = z.record(z.any());
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const registerSchema = loginSchema.extend({
  nome: z.string().min(2),
  cpf: z.string().optional(),
  telefone: z.string().optional(),
  role: z.enum(['admin', 'operador', 'motorista', 'cliente']).default('motorista')
});

fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Motors Connect API - Enterprise Edition',
      description: 'API completa separada por perfis: administradores, operadores, motoristas e clientes.',
      version: '4.0.0'
    },
    servers: [
      { url: 'https://motors-connect-api.vercel.app', description: 'Produção' },
      { url: 'http://localhost:3000', description: 'Local' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    },
    tags: [
      { name: 'Autenticação' },
      { name: 'Admin' },
      { name: 'Operador' },
      { name: 'Motorista' },
      { name: 'Cliente' },
      { name: 'Notificações' },
      { name: 'Público' }
    ]
  },
  transform: jsonSchemaTransform
});

const swaggerUser = process.env.SWAGGER_USER || 'admin';
const swaggerPass = process.env.SWAGGER_PASS || 'motors2026';

fastify.register(basicAuth, {
  validate: (username, password, req, reply, done) => {
    if (username === swaggerUser && password === swaggerPass) done();
    else done(new Error('Unauthorized'));
  },
  authenticate: { realm: 'Docs' }
});

fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiHooks: { onRequest: fastify.basicAuth }
});

function requestSupabase(token) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function normalizeError(error) {
  if (!error) return null;
  const statusCode = Number(error.status || error.statusCode || error.code) || 400;
  return { statusCode: statusCode >= 100 && statusCode < 600 ? statusCode : 400, error: error.message || error };
}

async function sendOrThrow(reply, result, successStatus = 200) {
  if (result.error) {
    const normalized = normalizeError(result.error);
    return reply.status(normalized.statusCode).send({ error: normalized.error, details: result.error.details });
  }
  return reply.status(successStatus).send(result.data);
}

async function authenticate(request, reply) {
  const authHeader = request.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return reply.status(401).send({ error: 'Token ausente.' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return reply.status(401).send({ error: 'Token inválido ou expirado.' });

  const client = requestSupabase(token);
  const { data: perfil, error: perfilError } = await client
    .from('perfis')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (perfilError) return reply.status(403).send({ error: 'Não foi possível carregar o perfil do usuário.' });

  request.db = client;
  request.user = { ...user, perfil, role: perfil?.role || 'motorista' };
}

const authorize = (roles) => async (request, reply) => {
  if (!request.user || !roles.includes(request.user.role)) {
    return reply.status(403).send({ error: 'Acesso negado: permissão insuficiente.' });
  }
};

function paginatedQuery(query, params) {
  const page = params.page || 1;
  const limit = params.limit || 50;
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  return query.range(from, to);
}

function applyCommonFilters(query, params, searchableColumns = []) {
  let filtered = query;
  if (params.status) filtered = filtered.eq('status', params.status);
  if (params.from) filtered = filtered.gte('created_at', params.from);
  if (params.to) filtered = filtered.lte('created_at', params.to);
  if (params.search && searchableColumns.length) {
    const terms = searchableColumns.map((column) => `${column}.ilike.%${params.search}%`).join(',');
    filtered = filtered.or(terms);
  }
  return filtered;
}

async function getMotoristaId(request, reply) {
  if (request.user.role !== 'motorista') return null;
  const { data, error } = await request.db.from('motoristas').select('id').eq('perfil_id', request.user.id).maybeSingle();
  if (error || !data) {
    reply.status(404).send({ error: 'Motorista não encontrado para o perfil autenticado.' });
    return undefined;
  }
  return data.id;
}

async function getEmpresaId(request, reply) {
  if (request.user.role !== 'cliente') return null;
  const { data, error } = await request.db.from('empresas').select('id').eq('perfil_id', request.user.id).maybeSingle();
  if (error || !data) {
    reply.status(404).send({ error: 'Empresa/cliente não encontrado para o perfil autenticado.' });
    return undefined;
  }
  return data.id;
}

function registerCrudRoutes(api, prefix, table, roles, options = {}) {
  const tag = options.tag || prefix.replace('/api/', '');
  const searchableColumns = options.search || [];
  const select = options.select || '*';

  api.get(`${prefix}/${table}`, {
    preHandler: [authenticate, authorize(roles)],
    schema: { tags: [tag], security: [{ bearerAuth: [] }], querystring: paginationSchema }
  }, async (request, reply) => {
    const params = request.query;
    let query = request.db.from(table).select(select, { count: 'exact' }).order('created_at', { ascending: false, nullsFirst: false });
    query = applyCommonFilters(query, params, searchableColumns);
    const result = await paginatedQuery(query, params);
    if (result.error) return sendOrThrow(reply, result);
    reply.header('x-total-count', result.count || 0);
    return reply.send(result.data);
  });

  api.get(`${prefix}/${table}/:id`, {
    preHandler: [authenticate, authorize(roles)],
    schema: { tags: [tag], security: [{ bearerAuth: [] }], params: idParamSchema }
  }, async (request, reply) => {
    const result = await request.db.from(table).select(select).eq('id', request.params.id).maybeSingle();
    if (!result.error && !result.data) return reply.status(404).send({ error: 'Registro não encontrado.' });
    return sendOrThrow(reply, result);
  });

  api.post(`${prefix}/${table}`, {
    preHandler: [authenticate, authorize(roles)],
    schema: { tags: [tag], security: [{ bearerAuth: [] }], body: options.createSchema || anyBodySchema }
  }, async (request, reply) => {
    const payload = Array.isArray(request.body) ? request.body : [request.body];
    const result = await request.db.from(table).insert(payload).select(select);
    return sendOrThrow(reply, result, 201);
  });

  api.patch(`${prefix}/${table}/:id`, {
    preHandler: [authenticate, authorize(roles)],
    schema: { tags: [tag], security: [{ bearerAuth: [] }], params: idParamSchema, body: anyBodySchema }
  }, async (request, reply) => {
    const payload = updatedAtTables.has(table) ? { ...request.body, updated_at: new Date().toISOString() } : request.body;
    const result = await request.db.from(table).update(payload).eq('id', request.params.id).select(select).maybeSingle();
    return sendOrThrow(reply, result);
  });

  api.delete(`${prefix}/${table}/:id`, {
    preHandler: [authenticate, authorize(roles)],
    schema: { tags: [tag], security: [{ bearerAuth: [] }], params: idParamSchema }
  }, async (request, reply) => {
    const result = await request.db.from(table).delete().eq('id', request.params.id).select('id').maybeSingle();
    return sendOrThrow(reply, result);
  });
}

fastify.register(async function (api) {
  api.get('/', { schema: { hide: true } }, async (request, reply) => {
    reply.type('text/html; charset=utf-8').send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Motors Connect API v4</title></head><body style="background:#0a0a0a;color:white;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;"><h1>Motors Connect API Enterprise</h1><p>API completa para administradores, operadores, motoristas e clientes.</p><a href="/docs" style="background:#3b82f6;color:white;padding:10px 20px;border-radius:5px;text-decoration:none;">Documentação Swagger</a></body></html>`);
  });

  api.get('/api/health', { schema: { tags: ['Público'] } }, async () => ({ status: 'ok', version: '4.0.0' }));

  api.post('/api/auth/login', {
    schema: { tags: ['Autenticação'], body: loginSchema }
  }, async (request, reply) => {
    const { data, error } = await supabase.auth.signInWithPassword(request.body);
    return sendOrThrow(reply, { data, error });
  });

  api.post('/api/auth/register', {
    schema: { tags: ['Autenticação'], body: registerSchema }
  }, async (request, reply) => {
    const { email, password, nome, cpf, telefone, role } = request.body;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nome, cpf, telefone, role } }
    });
    if (error) return sendOrThrow(reply, { error });

    if (data.user) {
      await supabaseAdmin.from('perfis').upsert({
        id: data.user.id,
        email,
        nome,
        full_name: nome,
        cpf,
        telefone,
        role,
        status: role === 'motorista' ? 'pendente' : 'ativo',
        aprovado_operador: role !== 'motorista'
      });
    }
    return reply.status(201).send(data);
  });

  api.get('/api/me', {
    preHandler: [authenticate],
    schema: { tags: ['Autenticação'], security: [{ bearerAuth: [] }] }
  }, async (request) => ({ user: request.user, perfil: request.user.perfil }));

  api.get('/api/admin/dashboard', {
    preHandler: [authenticate, authorize(roleHierarchy.admin)],
    schema: { tags: ['Admin'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    const [ordens, motoristas, veiculos, recebimentos, repasses] = await Promise.all([
      request.db.from('ordens_servico').select('id,status,valor_faturamento,valor_repasse', { count: 'exact' }),
      request.db.from('motoristas').select('id,status,status_operacional', { count: 'exact' }),
      request.db.from('veiculos').select('id,status,status_operacional', { count: 'exact' }),
      request.db.from('recebimentos').select('valor,status'),
      request.db.from('repasse_motoristas').select('valor,status')
    ]);
    const firstError = [ordens, motoristas, veiculos, recebimentos, repasses].find((item) => item.error);
    if (firstError) return sendOrThrow(reply, firstError);
    const sum = (rows, field) => (rows || []).reduce((total, row) => total + Number(row[field] || 0), 0);
    return {
      ordens_total: ordens.count || 0,
      ordens_por_status: (ordens.data || []).reduce((acc, row) => ({ ...acc, [row.status || 'sem_status']: (acc[row.status || 'sem_status'] || 0) + 1 }), {}),
      faturamento_previsto: sum(ordens.data, 'valor_faturamento'),
      recebimentos_total: sum(recebimentos.data, 'valor'),
      repasses_total: sum(repasses.data, 'valor'),
      motoristas_total: motoristas.count || 0,
      veiculos_total: veiculos.count || 0
    };
  });

  for (const table of adminTables) registerCrudRoutes(api, '/api/admin', table, roleHierarchy.admin, { tag: 'Admin', search: searchColumnsByTable[table] || [] });
  for (const table of operadorTables) registerCrudRoutes(api, '/api/operador', table, roleHierarchy.operador, { tag: 'Operador', search: searchColumnsByTable[table] || [], select: table === 'ordens_servico' ? ordemRelations : '*' });

  api.get('/api/operacional/corridas', {
    preHandler: [authenticate, authorize(roleHierarchy.operador)],
    schema: { tags: ['Operador'], security: [{ bearerAuth: [] }], querystring: paginationSchema }
  }, async (request, reply) => {
    const params = request.query;
    let query = request.db.from('ordens_servico').select(ordemRelations, { count: 'exact' }).order('data_execucao', { ascending: false });
    query = applyCommonFilters(query, params, ['numero_os', 'passageiro', 'nome_passageiro', 'origem', 'destino']);
    const result = await paginatedQuery(query, params);
    if (result.error) return sendOrThrow(reply, result);
    reply.header('x-total-count', result.count || 0);
    return reply.send(result.data);
  });

  api.post('/api/operacional/corridas', {
    preHandler: [authenticate, authorize(roleHierarchy.operador)],
    schema: { tags: ['Operador'], security: [{ bearerAuth: [] }], body: anyBodySchema }
  }, async (request, reply) => {
    const result = await request.db.from('ordens_servico').insert({ ...request.body, criado_por: request.user.id }).select(ordemRelations).single();
    return sendOrThrow(reply, result, 201);
  });

  api.get('/api/motorista/me', {
    preHandler: [authenticate, authorize(roleHierarchy.motorista)],
    schema: { tags: ['Motorista'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    if (request.user.role !== 'motorista') return reply.send({ perfil: request.user.perfil });
    const result = await request.db.from('motoristas').select('*, veiculos(*)').eq('perfil_id', request.user.id).maybeSingle();
    return sendOrThrow(reply, result);
  });

  api.get('/api/motorista/ordens', {
    preHandler: [authenticate, authorize(roleHierarchy.motorista)],
    schema: { tags: ['Motorista'], security: [{ bearerAuth: [] }], querystring: paginationSchema }
  }, async (request, reply) => {
    const motoristaId = await getMotoristaId(request, reply);
    if (motoristaId === undefined) return;
    let query = request.db.from('ordens_servico').select(motoristaReadableRelations, { count: 'exact' }).order('data_execucao', { ascending: false });
    if (motoristaId) query = query.eq('motorista_id', motoristaId);
    query = applyCommonFilters(query, request.query, ['numero_os', 'passageiro', 'nome_passageiro', 'origem', 'destino']);
    const result = await paginatedQuery(query, request.query);
    if (result.error) return sendOrThrow(reply, result);
    reply.header('x-total-count', result.count || 0);
    return reply.send(result.data);
  });

  api.get('/api/motorista/ordens/:id', {
    preHandler: [authenticate, authorize(roleHierarchy.motorista)],
    schema: { tags: ['Motorista'], security: [{ bearerAuth: [] }], params: idParamSchema }
  }, async (request, reply) => {
    const motoristaId = await getMotoristaId(request, reply);
    if (motoristaId === undefined) return;
    let query = request.db.from('ordens_servico').select(motoristaReadableRelations).eq('id', request.params.id);
    if (motoristaId) query = query.eq('motorista_id', motoristaId);
    const result = await query.maybeSingle();
    if (!result.error && !result.data) return reply.status(404).send({ error: 'Ordem não encontrada.' });
    return sendOrThrow(reply, result);
  });

  api.patch('/api/motorista/ordens/:id/status', {
    preHandler: [authenticate, authorize(roleHierarchy.motorista)],
    schema: {
      tags: ['Motorista'],
      security: [{ bearerAuth: [] }],
      params: idParamSchema,
      body: z.object({ status: z.enum(['pendente', 'em_andamento', 'concluido', 'cancelado']), horario_inicio: z.string().optional(), horario_fim: z.string().optional(), km_inicial: z.number().optional(), km_final: z.number().optional() })
    }
  }, async (request, reply) => {
    const motoristaId = await getMotoristaId(request, reply);
    if (motoristaId === undefined) return;
    let query = request.db.from('ordens_servico').update({ ...request.body, updated_at: new Date().toISOString() }).eq('id', request.params.id);
    if (motoristaId) query = query.eq('motorista_id', motoristaId);
    const result = await query.select(motoristaReadableRelations).maybeSingle();
    return sendOrThrow(reply, result);
  });

  api.post('/api/motorista/localizacao', {
    preHandler: [authenticate, authorize(roleHierarchy.motorista)],
    schema: { tags: ['Motorista'], security: [{ bearerAuth: [] }], body: z.object({ latitude: z.coerce.string(), longitude: z.coerce.string(), veiculo_id: z.string().uuid().optional() }) }
  }, async (request, reply) => {
    const motoristaId = await getMotoristaId(request, reply);
    if (motoristaId === undefined) return;
    const payload = { latitude_atual: request.body.latitude, longitude_atual: request.body.longitude, updated_at: new Date().toISOString() };
    const result = await request.db.from('motoristas').update(payload).eq('id', motoristaId).select('*').single();
    if (!result.error && (request.body.veiculo_id || result.data?.veiculo_id)) {
      await request.db.from('veiculos').update({ ultima_latitude: request.body.latitude, ultima_longitude: request.body.longitude }).eq('id', request.body.veiculo_id || result.data.veiculo_id);
    }
    return sendOrThrow(reply, result);
  });

  api.post('/api/motorista/ordens/:id/rota', {
    preHandler: [authenticate, authorize(roleHierarchy.motorista)],
    schema: { tags: ['Motorista'], security: [{ bearerAuth: [] }], params: idParamSchema, body: z.object({ rota_json: z.any(), total_pontos: z.number().int().nonnegative(), distancia_km: z.number().nonnegative(), iniciado_em: z.string().optional(), finalizado_em: z.string().optional(), veiculo_id: z.string().uuid().optional() }) }
  }, async (request, reply) => {
    const motoristaId = await getMotoristaId(request, reply);
    if (motoristaId === undefined) return;
    const payload = { ...request.body, ordem_servico_id: request.params.id, motorista_id: motoristaId, updated_at: new Date().toISOString() };
    const result = await request.db.from('ordem_servico_rotas').upsert(payload, { onConflict: 'ordem_servico_id' }).select('*').single();
    return sendOrThrow(reply, result, 201);
  });

  api.get('/api/cliente/minhas-corridas', {
    preHandler: [authenticate, authorize(roleHierarchy.cliente)],
    schema: { tags: ['Cliente'], security: [{ bearerAuth: [] }], querystring: paginationSchema }
  }, async (request, reply) => {
    const empresaId = await getEmpresaId(request, reply);
    if (empresaId === undefined) return;
    let query = request.db.from('ordens_servico').select(ordemRelations, { count: 'exact' }).order('data_execucao', { ascending: false });
    if (empresaId) query = query.eq('empresa_id', empresaId);
    query = applyCommonFilters(query, request.query, ['numero_os', 'passageiro', 'nome_passageiro', 'origem', 'destino']);
    const result = await paginatedQuery(query, request.query);
    if (result.error) return sendOrThrow(reply, result);
    reply.header('x-total-count', result.count || 0);
    return reply.send(result.data);
  });

  api.get('/api/notificacoes', {
    preHandler: [authenticate],
    schema: { tags: ['Notificações'], security: [{ bearerAuth: [] }] }
  }, async (request, reply) => {
    const result = await request.db.from('notificacoes').select('*').eq('user_id', request.user.id).order('created_at', { ascending: false });
    return sendOrThrow(reply, result);
  });

  api.patch('/api/notificacoes/:id/lida', {
    preHandler: [authenticate],
    schema: { tags: ['Notificações'], security: [{ bearerAuth: [] }], params: idParamSchema }
  }, async (request, reply) => {
    const result = await request.db.from('notificacoes').update({ lida: true }).eq('id', request.params.id).eq('user_id', request.user.id).select('*').maybeSingle();
    return sendOrThrow(reply, result);
  });

  api.post('/api/notificacoes', {
    preHandler: [authenticate, authorize(roleHierarchy.operador)],
    schema: { tags: ['Notificações'], security: [{ bearerAuth: [] }], body: z.object({ user_id: z.string().uuid(), titulo: z.string(), mensagem: z.string(), tipo: z.string().optional(), link: z.string().optional(), metadata: z.record(z.any()).optional() }) }
  }, async (request, reply) => {
    const result = await request.db.from('notificacoes').insert(request.body).select('*').single();
    return sendOrThrow(reply, result, 201);
  });

  for (const table of publicTables) {
    api.get(`/api/public/${table}`, { schema: { tags: ['Público'], querystring: paginationSchema } }, async (request, reply) => {
      let query = supabase.from(table).select('*', { count: 'exact' }).order('created_at', { ascending: false, nullsFirst: false });
      if (table === 'landing_pages') query = query.eq('status', 'publicado');
      query = applyCommonFilters(query, request.query, ['slug', 'title', 'nome', 'descricao']);
      const result = await paginatedQuery(query, request.query);
      if (result.error) return sendOrThrow(reply, result);
      reply.header('x-total-count', result.count || 0);
      return reply.send(result.data);
    });
  }
});

const start = async () => {
  try {
    await fastify.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) start();

module.exports = async (req, res) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};
