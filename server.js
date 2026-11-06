// /server.js

const dotenv = require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());


app.use(express.static(__dirname));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});


const COLUMNS = [
  'id', 'reportNo', 'dateReported', 'attendedByTop', 'detachment',
  'reportedThru', 'reportedBy', 'problemDetails', 'initialFindings',
  'actionTaken', 'remarks', 'type', 'serviceType', 'dept', 'assignedTo',
  'assignedOther', 'status', 'dateAttended', 'timeIn', 'timeOut',
  'attendedBySignature', 'verifiedBy', 'notedBy', 'archived',
];


function cleanRow(body){
  const row = {};
  COLUMNS.forEach(col=>{
    if(col === 'archived'){
      row[col] = body.archived ? 1 : 0;
      return;
    }
    let v = body[col];
    if(v === undefined || v === '') v = null;
    row[col] = v;
  });
  return row;
}


app.get('/api/reports', async (req, res)=>{
  try{
    const [rows] = await pool.query('SELECT * FROM reports ORDER BY createdAt DESC');
    res.json(rows);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});


app.get('/api/reports/:id', async (req, res)=>{
  try{
    const [rows] = await pool.query('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    if(!rows.length) return res.status(404).json({ error: 'Report not found' });
    res.json(rows[0]);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});


app.post('/api/reports', async (req, res) => {
  try {
    const row = cleanRow(req.body);

    if (!row.reportNo) {
      return res.status(400).json({ error: 'reportNo is required' });
    }

    const INSERT_COLUMNS = COLUMNS.filter(c => c !== 'id');

    const cols = INSERT_COLUMNS.join(', ');
    const placeholders = INSERT_COLUMNS.map(() => '?').join(', ');
    const values = INSERT_COLUMNS.map(c => row[c]);

    const [result] = await pool.query(
      `INSERT INTO reports (${cols}) VALUES (${placeholders})`,
      values
    );

    const [rows] = await pool.query(
      'SELECT * FROM reports WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create report' });
  }
});


app.put('/api/reports/:id', async (req, res)=>{
  try{
    const row = cleanRow(req.body);
    const updateCols = COLUMNS.filter(c=> c !== 'id');
    const setClause = updateCols.map(c=> `${c} = ?`).join(', ');
    const values = updateCols.map(c=> row[c]);
    values.push(req.params.id);
    const [result] = await pool.query(`UPDATE reports SET ${setClause} WHERE id = ?`, values);
    if(result.affectedRows === 0) return res.status(404).json({ error: 'Report not found' });
    const [rows] = await pool.query('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to update report' });
  }
});


app.delete('/api/reports/:id', async (req, res)=>{
  try{
    const [result] = await pool.query('DELETE FROM reports WHERE id = ?', [req.params.id]);
    if(result.affectedRows === 0) return res.status(404).json({ error: 'Report not found' });
    res.status(204).end();
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});


const PM_COLUMNS = [
  'id', 'detachment', 'dept', 'equipment', 'intervalMonths',
  'lastDone', 'nextDue', 'assignedTo', 'notes',
];

function cleanPmRow(body){
  const row = {};
  PM_COLUMNS.forEach(col=>{
    let v = body[col];
    if(col === 'intervalMonths'){
      row[col] = Number(v) > 0 ? Number(v) : 3;
      return;
    }
    if(v === undefined || v === '') v = null;
    row[col] = v;
  });
  return row;
}

app.get('/api/pm-schedule', async (req, res)=>{
  try{
    const [rows] = await pool.query('SELECT * FROM pm_schedule ORDER BY nextDue ASC');
    res.json(rows);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch PM schedule' });
  }
});

app.post('/api/pm-schedule', async (req, res) => {
  try {
    const row = cleanPmRow(req.body);

    if (!row.detachment || !row.nextDue) {
      return res.status(400).json({
        error: 'detachment and nextDue are required'
      });
    }

    const INSERT_COLUMNS = PM_COLUMNS.filter(c => c !== 'id');

    const cols = INSERT_COLUMNS.join(', ');
    const placeholders = INSERT_COLUMNS.map(() => '?').join(', ');
    const values = INSERT_COLUMNS.map(c => row[c]);

    const [result] = await pool.query(
      `INSERT INTO pm_schedule (${cols}) VALUES (${placeholders})`,
      values
    );

    const [rows] = await pool.query(
      'SELECT * FROM pm_schedule WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create PM schedule entry' });
  }
});

app.put('/api/pm-schedule/:id', async (req, res)=>{
  try{
    const row = cleanPmRow(req.body);
    const updateCols = PM_COLUMNS.filter(c=> c !== 'id');
    const setClause = updateCols.map(c=> `${c} = ?`).join(', ');
    const values = updateCols.map(c=> row[c]);
    values.push(req.params.id);
    const [result] = await pool.query(`UPDATE pm_schedule SET ${setClause} WHERE id = ?`, values);
    if(result.affectedRows === 0) return res.status(404).json({ error: 'PM schedule entry not found' });
    const [rows] = await pool.query('SELECT * FROM pm_schedule WHERE id = ?', [req.params.id]);
    res.json(rows[0]);
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to update PM schedule entry' });
  }
});

app.delete('/api/pm-schedule/:id', async (req, res)=>{
  try{
    const [result] = await pool.query('DELETE FROM pm_schedule WHERE id = ?', [req.params.id]);
    if(result.affectedRows === 0) return res.status(404).json({ error: 'PM schedule entry not found' });
    res.status(204).end();
  }catch(err){
    console.error(err);
    res.status(500).json({ error: 'Failed to delete PM schedule entry' });
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, ()=> console.log(`SRF server running on http://localhost:${PORT}`));
