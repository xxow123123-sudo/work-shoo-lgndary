import fs from 'node:fs/promises';
import pg from 'pg';
const {Client}=pg;
if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const sql=await fs.readFile(new URL('./schema.sql',import.meta.url),'utf8');
const client=new Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{await client.query(sql);console.log('Legendary database schema is ready.');}
finally{await client.end();}
