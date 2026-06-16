const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const app = express();
const port = process.env.PORT || 3000;
// Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Motors Connect API is running' });
});
// Auth Middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication failed' });
  }
};
// Motorista Routes
app.get('/api/motorista/me', authenticateToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('motoristas')
      .select('*, profiles:perfil_id(*)')
      .eq('perfil_id', req.user.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Ordens de Serviço
app.get('/api/motorista/ordens', authenticateToken, async (req, res) => {
  try {
    const { data: motorista } = await supabase
      .from('motoristas')
      .select('id')
      .eq('perfil_id', req.user.id)
      .single();
    if (!motorista) return res.status(404).json({ error: 'Motorista not found' });
    const { data, error } = await supabase
      .from('ordens_servico')
      .select('*, empresas(nome_fantasia)')
      .eq('motorista_id', motorista.id)
      .order('data_execucao', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Detalhes da Ordem e Paradas
app.get('/api/motorista/ordens/:id', authenticateToken, async (req, res) => {
  try {
    const { data: ordem, error: ordemError } = await supabase
      .from('ordens_servico')
      .select('*, empresas(*), veiculos(*)')
      .eq('id', req.params.id)
      .single();
    if (ordemError) throw ordemError;
    const { data: paradas, error: paradasError } = await supabase
      .from('ordem_servico_paradas')
      .select('*')
      .eq('ordem_id', req.params.id)
      .order('ordem_parada', { ascending: true });
    if (paradasError) throw paradasError;
    res.json({ ...ordem, paradas });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Atualizar Status da Ordem (Check-in / Check-out)
app.patch('/api/motorista/ordens/:id/status', authenticateToken, async (req, res) => {
  const { status, km_inicial, km_final, horario_inicio, horario_fim } = req.body;
  try {
    const updateData = { status };
    if (km_inicial) updateData.km_inicial = km_inicial;
    if (km_final) updateData.km_final = km_final;
    if (horario_inicio) updateData.horario_inicio = horario_inicio;
    if (horario_fim) updateData.horario_fim = horario_fim;
    const { data, error } = await supabase
      .from('ordens_servico')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Atualizar Parada
app.patch('/api/motorista/paradas/:id', authenticateToken, async (req, res) => {
  const { realizada, horario_realizado } = req.body;
  try {
    const { data, error } = await supabase
      .from('ordem_servico_paradas')
      .update({ realizada, horario_realizado })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// Ganhos
app.get('/api/motorista/ganhos', authenticateToken, async (req, res) => {
  try {
    const { data: motorista } = await supabase
      .from('motoristas')
      .select('id')
      .eq('perfil_id', req.user.id)
      .single();
    const { data, error } = await supabase
      .from('ordens_servico')
      .select('valor_repasse, data_execucao, status')
      .eq('motorista_id', motorista.id)
      .eq('status', 'concluido');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
