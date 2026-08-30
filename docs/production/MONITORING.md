# Monitoring contract

External monitoring should observe at minimum: public liveness/readiness, 5xx rate, DB connectivity, storage availability/capacity, scheduler failures, backup age/status and security/rate-limit anomalies.

Suggested severity:
- CRITICAL: app, DB or storage unavailable; backup failure.
- HIGH: repeated scheduler failure, disk/storage near capacity, significant security anomaly.
- WARNING: pending migrations before release, abnormal latency, backup age approaching policy threshold.

Public health is intentionally minimal. Detailed health and scheduler state are available only through authenticated System Administration.
