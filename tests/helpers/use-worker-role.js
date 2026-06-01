// import first in worker tests — sets bia_worker before config/db loads
process.env.DB_USER = 'bia_worker';
