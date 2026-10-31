import { Client } from "pg";

import { requireEnvironment } from "./env.js";

function parsePassword(value: string): string {
  return decodeURIComponent(new URL(value).password);
}

async function ensureRole(client: Client, role: string, password: string): Promise<void> {
  const quoted = await client.query<{ statement: string }>(
    `select format(
       'create role %I login password %L nosuperuser nobypassrls nocreatedb nocreaterole inherit',
       $1,
       $2
     ) as statement`,
    [role, password],
  );

  try {
    await client.query(quoted.rows[0]!.statement);
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "42710") {
      throw error;
    }

    const alter = await client.query<{ statement: string }>(
      `select format(
         'alter role %I with login password %L nosuperuser nobypassrls nocreatedb nocreaterole inherit',
         $1,
         $2
       ) as statement`,
      [role, password],
    );
    await client.query(alter.rows[0]!.statement);
  }
}

async function main(): Promise<void> {
  const client = new Client({
    connectionString: requireEnvironment("DATABASE_URL_MIGRATOR"),
    application_name: "incident-witness-role-provisioner",
  });

  await client.connect();
  try {
    await ensureRole(client, "iw_api", parsePassword(requireEnvironment("DATABASE_URL_IW_API")));
    await ensureRole(
      client,
      "iw_worker",
      parsePassword(requireEnvironment("DATABASE_URL_IW_WORKER")),
    );
    console.log("Restricted roles ensured with credentials from the configured environment.");
  } finally {
    await client.end();
  }
}

await main();
