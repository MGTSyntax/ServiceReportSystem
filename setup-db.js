// /setup-db.js

const dotenv = require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function run(){
  // const sqlPath = path.join(__dirname, 'schema.sql');
  // const sql = fs.readFileSync(sqlPath, 'utf8');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true, 
  });

  // try{
  //   console.log('Running schema.sql against your MySQL server...');
  //   await connection.query(sql);
  //   console.log('Done. srf_system database and reports table are ready.');
  // }catch(err){
  //   console.error('Failed to run schema.sql:', err.message);
  //   process.exitCode = 1;
  // }finally{
  //   await connection.end();
  // }
}

run();
