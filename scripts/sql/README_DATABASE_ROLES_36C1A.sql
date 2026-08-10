/*
  CMP 36C.1a - THAM KHẢO PHÂN QUYỀN SQL SERVER

  Chạy bằng DBA/Windows administrator và THAY tên user phù hợp môi trường.
  Không lưu mật khẩu trong file này.

  Runtime user - dùng bởi DATABASE_URL:
      ALTER ROLE [db_datareader] ADD MEMBER [CMP_RUNTIME];
      ALTER ROLE [db_datawriter] ADD MEMBER [CMP_RUNTIME];

  Migration user - chỉ dùng bởi MIGRATION_DATABASE_URL:
      ALTER ROLE [db_ddladmin] ADD MEMBER [CMP_MIGRATOR];
      ALTER ROLE [db_datareader] ADD MEMBER [CMP_MIGRATOR];
      ALTER ROLE [db_datawriter] ADD MEMBER [CMP_MIGRATOR];

  Không cấp db_owner cho runtime user.
  Với production, migration credential nên được quản lý bởi người triển khai/secret manager và không được frontend biết.
*/
