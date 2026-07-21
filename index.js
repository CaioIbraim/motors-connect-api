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

// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Type Provider Configuration
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

// Plugins
fastify.register(cors);
fastify.register(helmet, { contentSecurityPolicy: false });

// Swagger Configuration
fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Motors Connect API - Enterprise Edition',
      description: 'API Completa atendendo ADM, Operadores, Clientes e Motoristas.',
      version: '3.0.0'
    },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
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

/**
 * RBAC MIDDLEWARE & HELPERS
 */
const authenticate = async (request, reply) => {
  const authHeader = request.headers.authorization;
  if (!authHeader) return reply.status(401).send({ error: 'Token missing' });
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return reply.status(403).send({ error: 'Invalid token' });
  
  // Fetch Profile Role
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  request.user = { ...user, role: profile?.role || 'user' };
};

const authorize = (roles) => async (request, reply) => {
  if (!roles.includes(request.user.role)) {
    return reply.status(403).send({ error: 'Acesso negado: permissão insuficiente' });
  }
};

/**
 * API ROUTES
 */
fastify.register(async function (api) {
  
  // Landing Page
  api.get('/', { schema: { hide: true } }, async (request, reply) => {
    reply.type('text/html; charset=utf-8').send(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head><meta charset="UTF-8"><title>Motors Connect API v3</title></head>
        <body style="background:#0a0a0a; color:white; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
          <h1>Motors Connect API Enterprise</h1>
          <p>Suporte completo para ADM, Operadores, Clientes e Motoristas.</p>
          <a href="/docs" style="background:#3b82f6; color:white; padding:10px 20px; border-radius:5px; text-decoration:none;">Documentação Swagger</a>
          <p style="margin-top:20px; color:#666;">User: admin | Pass: motors2026</p>
        </body>
      </html>
    `);
  });

  // --- MÓDULO DE AUTENTICAÇÃO ---
  api.post('/api/auth/login', {
    schema: { tags: ['Autenticação'], body: z.object({ email: z.string().email(), password: z.string() }) }
  }, async (request) => {
    const { data, error } = await supabase.auth.signInWithPassword(request.body);
    if (error) throw error;
    return data;
  });

  // --- MÓDULO ADMINISTRATIVO (ADM ONLY) ---
  api.get('/api/admin/dashboard', {
    preHandler: [authenticate, authorize(['admin'])],
    schema: { tags: ['Admin'], security: [{ bearerAuth: [] }] }
  }, async () => {
    // KPI Mockup based on Robert Marinho Logic
    return { total_faturamento: 150000, total_corridas: 450, motoristas_ativos: 35 };
  });

  // --- MÓDULO OPERACIONAL (ADM & OPERADOR) ---
  api.get('/api/operacional/corridas', {
    preHandler: [authenticate, authorize(['admin', 'operador'])],
    schema: { tags: ['Operacional'], security: [{ bearerAuth: [] }] }
  }, async () => {
    const { data, error } = await supabase.from('ordens_servico').select('*, empresas(*), motoristas(*)').order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  });

  api.post('/api/operacional/corridas', {
    preHandler: [authenticate, authorize(['admin', 'operador'])],
    schema: { tags: ['Operacional'], security: [{ bearerAuth: [] }], body: z.any() }
  }, async (request) => {
    const { data, error } = await supabase.from('ordens_servico').insert([request.body]).select();
    if (error) throw error;
    return data;
  });

  // --- MÓDULO CLIENTE (ADM, OPERADOR & CLIENTE) ---
  api.get('/api/cliente/minhas-corridas', {
    preHandler: [authenticate, authorize(['admin', 'operador', 'cliente'])],
    schema: { tags: ['Cliente'], security: [{ bearerAuth: [] }] }
  }, async (request) => {
    const { data: empresa } = await supabase.from('empresas').select('id').eq('perfil_id', request.user.id).single();
    const { data, error } = await supabase.from('ordens_servico').select('*').eq('empresa_id', empresa?.id);
    if (error) throw error;
    return data;
  });

  // --- MÓDULO MOTORISTA (ADM, OPERADOR & MOTORISTA) ---
  api.get('/api/motorista/minhas-corridas', {
    preHandler: [authenticate, authorize(['admin', 'operador', 'motorista'])],
    schema: { tags: ['Motorista'], security: [{ bearerAuth: [] }] }
  }, async (request) => {
    const { data: motorista } = await supabase.from('motoristas').select('id').eq('perfil_id', request.user.id).single();
    const { data, error } = await supabase.from('ordens_servico').select('*').eq('motorista_id', motorista?.id);
    if (error) throw error;
    return data;
  });

  // --- MÓDULO FINANCEIRO (ADM ONLY) ---
  api.get('/api/financeiro/faturamento', {
    preHandler: [authenticate, authorize(['admin'])],
    schema: { tags: ['Financeiro'], security: [{ bearerAuth: [] }] }
  }, async () => {
    const { data, error } = await supabase.from('recebimentos').select('*, empresas(nome_fantasia)');
    if (error) throw error;
    return data;
  });

  api.get('/api/financeiro/repasses', {
    preHandler: [authenticate, authorize(['admin'])],
    schema: { tags: ['Financeiro'], security: [{ bearerAuth: [] }] }
  }, async () => {
    const { data, error } = await supabase.from('repasse_motoristas').select('*, motoristas(nome)');
    if (error) throw error;
    return data;
  });

  // --- MÓDULO DE CADASTROS GERAIS ---
  api.get('/api/veiculos', {
    preHandler: [authenticate],
    schema: { tags: ['Cadastros'], security: [{ bearerAuth: [] }] }
  }, async () => {
    const { data, error } = await supabase.from('veiculos').select('*');
    if (error) throw error;
    return data;
  });

});

// Start
const start = async () => {
  try { await fastify.listen({ port: 3000, host: '0.0.0.0' }); }
  catch (err) { fastify.log.error(err); process.exit(1); }
};

if (require.main === module) start();
module.exports = async (req, res) => {
  await fastify.ready();
  fastify.server.emit('request', req, res);
};
