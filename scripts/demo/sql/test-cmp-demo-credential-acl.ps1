$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'cmp-demo-credential-acl.ps1')

$ownerSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowedSids = @($ownerSid, 'S-1-5-18', 'S-1-5-32-544')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('cmp-demo-acl-' + [guid]::NewGuid().ToString('N'))
$testFile = Join-Path $testRoot 'credentials.test.json'

try {
    New-Item -ItemType Directory -Path $testRoot | Out-Null
    [IO.File]::WriteAllText($testFile, '{"test":"acl-marker"}', [Text.UTF8Encoding]::new($false))
    # Seed an unwanted explicit account on an isolated temp directory/file.
    # The helper must purge the extra DACL ACE while leaving owner unchanged.
    $unwanted = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-545')
    foreach ($path in @($testRoot, $testFile)) {
        $item = if ($path -eq $testRoot) { [IO.DirectoryInfo]::new($path) } else { [IO.FileInfo]::new($path) }
        $access = $item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
        $access.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            $unwanted, [Security.AccessControl.FileSystemRights]::ReadData, [Security.AccessControl.AccessControlType]::Allow
        ))
        $item.SetAccessControl($access)
    }
    Set-CmpDemoCredentialAcl -DirectoryPath $testRoot -CredentialFilePath $testFile -OwnerSid $ownerSid

    $contents = [IO.File]::ReadAllText($testFile)
    if ($contents -ne '{"test":"acl-marker"}') { throw 'The creating Windows user could not read the protected test file.' }

    foreach ($path in @($testRoot, $testFile)) {
        $acl = Get-Acl -LiteralPath $path
        $actualSids = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) | ForEach-Object { $_.IdentityReference.Value } | Sort-Object -Unique)
        $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
        foreach ($sid in $actualSids) {
            if ($sid -notin $allowedSids) { throw "Unexpected credential ACL principal: $sid" }
        }
        foreach ($sid in $allowedSids) {
            if ($sid -notin $actualSids) { throw "Required credential ACL principal is missing: $sid" }
        }
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $ownerSid) {
            throw 'The credential path owner does not match the ordinary Windows account.'
        }
        foreach ($rule in $rules) {
            if ($rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
                ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -ne [Security.AccessControl.FileSystemRights]::FullControl) {
                throw 'A credential ACL entry is not an explicit FullControl allow entry.'
            }
        }
    }

    Write-Output 'PASS: owner can read the test file; ACL contains only owner SID, SYSTEM, and Administrators.'
}
finally {
    if (Test-Path -LiteralPath $testRoot) {
        Remove-Item -LiteralPath $testRoot -Recurse -Force
    }
}
