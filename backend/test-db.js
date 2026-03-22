const { Client } = require('pg');
const client = new Client({
  connectionString: "postgresql://postgres:password@localhost:5433/elearning?schema=public"
});

async function test() {
  try {
    await client.connect();
    console.log("Connected successfully to PostgreSQL!");
    const res = await client.query('SELECT NOW()');
    console.log("Current time from DB:", res.rows[0]);
    await client.end();
  } catch (err) {
    console.error("Connection failed:", err);
    process.exit(1);
  }
}

test();
