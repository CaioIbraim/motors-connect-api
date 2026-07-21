const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function checkTables() {
  const tables = ['motoristas', 'ordens_servico', 'ordem_servico_paradas', 'veiculos', 'empresas'];
  console.log('Verificando tabelas no Supabase...');
  
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ Tabela "${table}" não encontrada ou erro:`, error.message);
    } else {
      console.log(`✅ Tabela "${table}" existe.`);
    }
  }
}

checkTables();
