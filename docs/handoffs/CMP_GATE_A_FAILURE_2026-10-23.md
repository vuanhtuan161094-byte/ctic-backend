# Gate A child exit 1: diagnosis and remaining blocker

Gate A remains PENDING. Do not rerun the apply launcher yet.

## Observed Windows evidence

- Reviewed all five `CMP_GATE_A_*.log` files in `CMP/artifacts/sql/gate-a`.
- Parent `CMP_GATE_A_20261023_120644_a6e47f1d.log`: UAC requested at 12:06:45.197; child exited 1 at 12:06:56.926 (+07:00).
- Child `CMP_GATE_A_20261023_120655_00d52dac.log`: `ERROR Keyword not supported: 'DataSource'.` at 12:06:56.123, followed by END. No IDENTITY or APPLY_BEGIN in any of the five logs.
- Windows PowerShell 5.1 reproduced the exception at `SqlConnectionStringBuilder.DataSource = ...`. The failure occurs before constructing/opening the SQL connection. This specific run did not submit SQL bootstrap commands.
- The 11:53 and 11:54 logs contain only START; incomplete logs do not prove the current global SQL state.
- Read-only SQL probes via Shared Memory failed with `The system cannot find the file specified.`
- Host Windows service query: `MSSQL$SQLEXPRESS`, State=Stopped, Started=False, PID=0, ExitCode=1066, ServiceSpecificExitCode=10048. No service operation was performed.
- Observed existing TCP settings: Enabled=1, IPAll TcpPort=1433, dynamic ports empty. No setting was changed. These observations do not establish when or by whom the settings changed.
- Access to the configured SQL log registry parameters and SQL ERRORLOG is denied to the ordinary host account. The service failure cause still needs privileged read-only inspection; the service exit code alone is insufficient to prove a current port conflict.

## Fix and verification

- Build the connection using canonical SQL dictionary keys, preserving Shared Memory, master, Windows authentication and existing encryption settings.
- Log phase, PID/Windows identity and SQL write-attempt status; log SQL numeric error metadata without exception messages, SQL text, credentials or source lines.
- Credential failures now reach the outer failure logger. APPLY_BEGIN is emitted only after credential preparation, immediately before bootstrap submission. An attempted write is classified as possible partial state, never automatic retry.
- Regression tests execute the production builder on Windows PowerShell without opening SQL and verify secret-safe failure classification before/after attempted writes.
- Added `scripts/demo/sql/RUN_CMP_DEMO_SQL_INSPECT.cmd`: a separate read-only UAC diagnostic. It reads service/error-log/listener information and, only if SQL is running with authoritative metadata visibility, reads DEMO database/login/backup metadata. It does not start services, change TCP, read SQL passwords or invoke bootstrap.

## Resume condition

Database existence/state, both DEMO login identities and backup history are UNVERIFIED while the service is stopped. Do not label them absent or Gate A PASS. Use the read-only inspector under Administrator to obtain protected SQL ERRORLOG evidence. Any service/TCP repair needs separate owner authorization and a concrete rollback plan. Once SQL is available, inspect metadata before proposing bootstrap. If partial objects exist, retain them and prepare a targeted repair; never drop/reset/recreate them automatically.
