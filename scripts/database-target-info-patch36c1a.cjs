const {
  getRuntimeDatabaseUrl,
  getMigrationDatabaseUrl,
  parseSqlServerUrl,
} = require('./lib/database-credentials-patch36c1a.cjs');

try {
  const runtimeUrl = getRuntimeDatabaseUrl();
  const runtime = parseSqlServerUrl(runtimeUrl);
  const migration = getMigrationDatabaseUrl({ required: false });
  process.stdout.write(
    JSON.stringify({
      host: runtime.host,
      port: runtime.port,
      database: runtime.database,
      schema: runtime.schema,
      runtimeUser: runtime.user,
      nodeEnv: process.env.NODE_ENV || 'development',
      migrationConfigured: Boolean(migration),
    }),
  );
} catch (error) {
  console.error(error?.message || String(error));
  process.exit(1);
}
