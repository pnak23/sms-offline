# S2 spike result — SQLite persistence + migrations on Spring Boot 4.1.2 / Java 21

Run: 2026-10-30, Corretto 21.0.6, Hibernate 7.4.13, Flyway 12.4.0, sqlite-jdbc 3.53.4.0, Spring Security 7.1.2, POI 5.5.1.
Console prints Khmer as '?' because the Windows console code page is not UTF-8; the assertions compare real strings and passed.

```
[INFO] -------------------< kh.school.spike:s2-persistence >-------------------
[INFO] Building s2-persistence 0
SPIKE: excel: 3415 bytes, font=Khmer UI, sheet name round-trips=true, UTF-8 in sharedStrings.xml=true
[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 1.923 s -- in spike.ExcelSpikeTest
releases of the JDK. Please add Mockito as an agent to your build as described in Mockito's documentation:
SPIKE: storage: created_at=text:2026-10-30T08:15:30Z, is_active=integer:1, version=integer
SPIKE: after rebuild: children=1, fk violations=0
SPIKE: seeds: grades=6, subjects=8 (active 7)
SPIKE: FK assertion trapped orphan: true
SPIKE: sequence: unique=100 failures=0 max=100
SPIKE: classified: unique=Violation[kind=UNIQUE, detail=app_users.username] fk=FOREIGN_KEY restrict=FOREIGN_KEY check=CHECK notnull=Violation[kind=NOT_NULL, detail=subjects.name_km]
SPIKE: Spring tx concurrency (4 threads x 25 read-then-write, pool 4, IMMEDIATE): failures=0, rows=100
SPIKE: VACUUM INTO: integrity=ok, grades=6, backupuser rows=1, bytes=118784
SPIKE: flyway history = [{version=1, success=1}, {version=2, success=1}, {version=100, success=1}, {version=101, success=1}]
SPIKE: stale update -> ObjectOptimisticLockingFailureException
SPIKE: pooled pragmas: [fk=1,journal=wal,busy=5000, fk=1,journal=wal,busy=5000, fk=1,journal=wal,busy=5000, fk=1,journal=wal,busy=5000]
[INFO] Tests run: 12, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 12.48 s -- in spike.PersistenceSpikeTest
SPIKE: dup -> 409 {"instance":"/api/v1/dup","status":409,"title":"Conflict","code":"DUPLICATE","detail":"subjects.code"}
SPIKE: orphan -> 409 {"instance":"/api/v1/orphan","status":409,"title":"Conflict","code":"REFERENCE_VIOLATION"}
SPIKE: secret: missing=403 wrong=403
SPIKE: token flow: 401 unauthenticated -> 401 wrong password -> 200 with token -> 401 after revoke
SPIKE: loopback-only: netstat -> TCP    127.0.0.1:61208        0.0.0.0:0              LISTENING       14576
SPIKE: loopback-only: LAN probe 192.168.11.95:61208 -> SocketTimeoutException
SPIKE: echo ok: 200 {"nameKm":"??? ??????","dateOfBirth":"2018-05-01","createdAt":"2026-10-30T08:15:30Z"}
SPIKE: echo invalid: 422 {"instance":"/api/v1/echo","status":422,"title":"Unprocessable Content","code":"VALIDATION_FAILED","fieldErrors":[{"code":"Past","field":"dateOfBirth"},{"code":"NotBlank","field":"nameKm"}]}
SPIKE: bcrypt cost 12: 387 ms on this PC (first call, incl. JIT warm-up); Khmer sample 17 chars / 51 bytes OK; 75-byte Khmer -> rejected (IllegalArgumentException); 80-byte ASCII -> rejected (IllegalArgumentException)
[INFO] Tests run: 6, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: 8.334 s -- in spike.WebSpikeTest
[INFO] Tests run: 19, Failures: 0, Errors: 0, Skipped: 0
[INFO] BUILD SUCCESS
```
