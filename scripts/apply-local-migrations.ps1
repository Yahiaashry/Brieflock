$ErrorActionPreference = 'Stop'
# Explicit local container; never reads a hosted connection string or resets data.
$containerName = 'supabase_db_BriefLock'
$applied = @(docker exec $containerName psql -U postgres -d postgres -At -c 'select version from supabase_migrations.schema_migrations')
if ($LASTEXITCODE -ne 0) { throw 'Cannot read local migration history.' }
foreach ($migration in (Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '../supabase/migrations') -Filter '*.sql' | Sort-Object Name)) {
  $version = $migration.BaseName.Split('_')[0]
  if ($applied -contains $version) { continue }
  if ($version -notmatch '^\d{14}$') { throw 'Invalid migration filename.' }
  $sql = (Get-Content -LiteralPath $migration.FullName -Raw) + "`ninsert into supabase_migrations.schema_migrations(version) values ('$version');"
  $sql | docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1 --single-transaction -q
  if ($LASTEXITCODE -ne 0) { throw "Local migration failed: $($migration.Name)" }
  Write-Output "Applied $($migration.Name)"
}
