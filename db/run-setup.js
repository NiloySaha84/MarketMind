import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const connectionString =
    process.argv[2] ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_PUBLIC_URL;

const scriptName = process.argv[3] || 'railway-setup.sql';

if (!connectionString) {
    console.error(
        [
            'Missing Postgres connection string.',
            '',
            'Usage:',
            '  node db/run-setup.js "<DATABASE_PUBLIC_URL>" [script.sql]',
            '',
            'Or set it as an env var:',
            '  DATABASE_URL="postgresql://user:pass@host:port/db" node db/run-setup.js',
            '',
            'Get the value from Railway -> Postgres service -> Variables -> DATABASE_PUBLIC_URL.'
        ].join('\n')
    );
    process.exit(1);
}

const safeUrl = connectionString.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, scriptName);

let sql;
try {
    sql = readFileSync(sqlPath, 'utf8');
} catch {
    console.error(`Could not read SQL file: ${sqlPath}`);
    process.exit(1);
}

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

console.log(`Connecting to ${safeUrl} ...`);

try {
    await client.connect();
    console.log(`Connected. Applying ${scriptName} ...`);

    await client.query(sql);

    console.log(`\nSuccess: ${scriptName} applied. Schema, roles, tables, and RLS are ready.`);
} catch (error) {
    console.error(`\nFailed to apply ${scriptName}:`);
    console.error(`  ${error.message}`);
    process.exitCode = 1;
} finally {
    await client.end();
}
