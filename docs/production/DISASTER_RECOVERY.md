# Disaster recovery

RPO/RTO are deployment commitments and must be set by the operating organization based on backup frequency, infrastructure and staffing; this repository does not claim guaranteed values.

Incident sequence: detect -> contain -> preserve evidence -> select last verified DB+storage recovery point -> restore into controlled infrastructure -> validate schema/files/authentication -> smoke test -> resume traffic -> post-incident review.

Do not restore only SQL or only storage unless the incident analysis proves the other persistence domain is intact and consistent.
