import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const connectionString = process.env.DATABASE_URL || process.env.DATABASE_PUBLIC_URL;

if (!connectionString) {
    console.error(
        'Set DATABASE_URL (or DATABASE_PUBLIC_URL) to your Railway Postgres connection string.\n' +
        'Example: DATABASE_URL="postgresql://user:pass@host:port/db" node db/run-setup.js'
    );
    process.exit(1);
}

const scriptName = process.argv[2] || 'railway-setup.sql';
const __dirname = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(__dirname, scriptName), 'utf8');

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

try {
    await client.connect();
    await client.query(sql);
    console.log(`Applied ${scriptName} successfully.`);
} catch (error) {
    console.error(`Failed to apply ${scriptName}:`, error.message);
    process.exitCode = 1;
} finally {
    await client.end();
}
