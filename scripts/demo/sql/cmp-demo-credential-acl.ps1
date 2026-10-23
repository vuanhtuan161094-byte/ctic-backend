function Set-CmpDemoCredentialAcl {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$DirectoryPath,
        [Parameter(Mandatory = $true)][string]$CredentialFilePath,
        [Parameter(Mandatory = $true)][string]$OwnerSid
    )

    if ($OwnerSid -notmatch '^S-1-[0-9-]+$') {
        throw 'The DEMO credential owner SID is invalid.'
    }
    if (-not (Test-Path -LiteralPath $DirectoryPath -PathType Container)) {
        throw 'The DEMO credential directory does not exist.'
    }

    $owner = [Security.Principal.SecurityIdentifier]::new($OwnerSid)
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $administrators = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $principals = @($owner, $system, $administrators)
    $fullControl = [Security.AccessControl.FileSystemRights]::FullControl

    $directoryAcl = [Security.AccessControl.DirectorySecurity]::new()
    $directoryAcl.SetAccessRuleProtection($true, $false)
    $directoryAcl.SetOwner($owner)
    foreach ($principal in $principals) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new(
            $principal,
            $fullControl,
            [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit,
            [Security.AccessControl.PropagationFlags]::None,
            [Security.AccessControl.AccessControlType]::Allow
        )
        $directoryAcl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $DirectoryPath -AclObject $directoryAcl

    if (Test-Path -LiteralPath $CredentialFilePath -PathType Leaf) {
        $fileAcl = [Security.AccessControl.FileSecurity]::new()
        $fileAcl.SetAccessRuleProtection($true, $false)
        $fileAcl.SetOwner($owner)
        foreach ($principal in $principals) {
            $rule = [Security.AccessControl.FileSystemAccessRule]::new(
                $principal,
                $fullControl,
                [Security.AccessControl.AccessControlType]::Allow
            )
            $fileAcl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $CredentialFilePath -AclObject $fileAcl
    }
}
