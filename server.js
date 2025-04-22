const express = require('express');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
app.use(express.json());

// Conexão com PostgreSQL usando Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ----------------------
// LOGIN
// ----------------------

app.post('/login', async (req, res) => {
  console.log("BODY RECEBIDO:", req.body);

  const { usuario, senha } = req.body || {};
  if (!usuario || !senha) {
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM login WHERE usuario = $1 AND senha = $2',
      [usuario.trim(), senha.trim()]
    );

    if (result.rows.length > 0) {
      res.json({
        success: true,
        message: 'Login OK',
        empresa: result.rows[0].empresa
      });
    } else {
      res.status(401).json({ success: false, message: 'Login inválido' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro no login');
  }
});

// ----------------------
// ENTREGA
// ----------------------

app.get('/entrega', async (req, res) => {
  const { empresa } = req.query;

  if (!empresa) {
    return res.status(400).json({ erro: 'Empresa não especificada' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM entrega WHERE empresa = $1 ORDER BY data DESC',
      [empresa]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao buscar entregas');
  }
});

app.get('/entrega/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query('SELECT * FROM entrega WHERE id = $1', [id]);
    if (result.rows.length > 0) {
      res.json(result.rows[0]);
    } else {
      res.status(404).json({ erro: 'Entrega não encontrada' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ erro: 'Erro ao buscar entrega' });
  }
});

app.post('/entrega', async (req, res) => {
  const { nome, endereco, telefone, produto, valor, data, empresa, fiado } = req.body;

  if (!nome || !endereco || !telefone || !produto || !valor || !data || !empresa) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios' });
  }

  try {
    await pool.query(
      `INSERT INTO entrega (nome, endereco, telefone, produto, valor, data, empresa, fiado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [nome, endereco, telefone, produto, valor, data, empresa, fiado ?? false]
    );

    res.status(201).json({ message: 'Entrega cadastrada com sucesso' });
  } catch (error) {
    console.error('Erro ao cadastrar entrega:', error);
    res.status(500).json({ erro: 'Erro ao cadastrar entrega' });
  }
});

app.put('/entrega/:id', async (req, res) => {
  const { id } = req.params;
  const { nome, endereco, telefone, produto, valor, data, fiado } = req.body;

  if (!nome || !endereco || !telefone || !produto || !valor || !data) {
    return res.status(400).json({ erro: 'Campos obrigatórios ausentes' });
  }

  try {
    await pool.query(
      `UPDATE entrega
       SET nome = $1, endereco = $2, telefone = $3, produto = $4, valor = $5, data = $6, fiado = $7
       WHERE id = $8`,
      [nome, endereco, telefone, produto, valor, data, fiado ?? false, id]
    );
    res.json({ success: true, message: 'Entrega atualizada com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao atualizar entrega' });
  }
});

app.delete('/entrega/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query('DELETE FROM entrega WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).send('Entrega não encontrada');
    }

    res.send('Entrega removida com sucesso');
  } catch (error) {
    console.error('Erro ao deletar entrega:', error);
    res.status(500).send('Erro ao deletar entrega');
  }
});

// ----------------------
// DASHBOARD
// ----------------------

app.get('/dashboard-data', async (req, res) => {
  const empresa = req.query.empresa || 'MatheusGas';

  const currentDate = new Date();
  const currentDay = currentDate.getDate();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  try {
    const dataDia = await pool.query(`
      SELECT 
        EXTRACT(DAY FROM data) AS dia,
        SUM(valor) AS total,
        COUNT(*) AS quantidade
      FROM entrega
      WHERE EXTRACT(MONTH FROM data) = $1 
        AND EXTRACT(YEAR FROM data) = $2
        AND empresa = $3
      GROUP BY dia
      ORDER BY dia
    `, [currentMonth, currentYear, empresa]);

    const dataMes = await pool.query(`
      SELECT 
        TO_CHAR(data, 'Mon') AS mes,
        COUNT(*) AS quantidade
      FROM entrega
      WHERE empresa = $1
      GROUP BY mes, EXTRACT(MONTH FROM data)
      ORDER BY EXTRACT(MONTH FROM data)
    `, [empresa]);

    const resumoHoje = await pool.query(`
      SELECT 
        COALESCE(SUM(valor), 0) AS totalHoje,
        COUNT(*) AS quantidadeHoje
      FROM entrega
      WHERE EXTRACT(DAY FROM data) = $1
        AND EXTRACT(MONTH FROM data) = $2
        AND EXTRACT(YEAR FROM data) = $3
        AND empresa = $4
    `, [currentDay, currentMonth, currentYear, empresa]);

    res.json({
      porDia: dataDia.rows,
      porMes: dataMes.rows,
      totalHoje: resumoHoje.rows[0].totalhoje,
      quantidadeHoje: resumoHoje.rows[0].quantidadehoje,
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Erro ao buscar dados do dashboard');
  }
});


app.get('/caderno', async (req, res) => {
  const { data, fiado, empresa } = req.query;

  try {
    let query = 'SELECT * FROM entrega WHERE empresa = $1';
    const values = [empresa];
    let i = 2;

    if (fiado === 'true') {
      query += ` AND fiado = true`;
    }

    if (data && fiado !== 'true') {
      query += ` AND data = $${i}`;
      values.push(data);
    }

    query += ' ORDER BY data DESC';

    const entregas = await pool.query(query, values);
    res.json(entregas.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao buscar entregas' });
  }
});

// ----------------------
// SERVER ONLINE
// ----------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
