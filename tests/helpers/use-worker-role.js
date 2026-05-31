// Import this FIRST in worker pipeline tests, before anything that pulls in
// config/db.js. The worker/dispatcher run as the `bia_worker` role in
// production (it has BYPASSRLS so background jobs can write rows for any user).
//
// dotenv does not override variables that are already set, so assigning
// DB_USER here wins over the DB_USER in .env.test.local (which is bia_app for
// the API tests).
process.env.DB_USER = 'bia_worker';
