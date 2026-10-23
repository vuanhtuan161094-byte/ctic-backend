# CMP DEMO credentials: modify the DACL only.
# Do NOT use Set-Acl with a newly constructed security descriptor or SetOwner:
# both can require SeSecurityPrivilege when PowerShell tries to apply the SACL.
# GetAccessControl(Access) + SetAccessControl change access rights only.
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
    $allowed = @($owner, $system, $administrators)
    $fullControl = [Security.AccessControl.FileSystemRights]::FullControl

    function Set-AccessOnly {
        param(
            [Parameter(Mandatory = $true)][IO.FileSystemInfo]$Item,
            [Parameter(Mandatory = $true)][bool]$IsDirectory
        )

        # Read/write only the DACL: never read, set, or replace the SACL or owner.
        $acl = $Item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
        $acl.SetAccessRuleProtection($true, $false)
        foreach ($existing in @($acl.GetAccessRules($true, $false, [Security.Principal.SecurityIdentifier]))) {
            $acl.PurgeAccessRules($existing.IdentityReference)
        }
        foreach ($principal in $allowed) {
            if ($IsDirectory) {
                $rule = [Security.AccessControl.FileSystemAccessRule]::new(
                    $principal, $fullControl,
                    [Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit,
                    [Security.AccessControl.PropagationFlags]::None,
                    [Security.AccessControl.AccessControlType]::Allow
                )
            }
            else {
                $rule = [Security.AccessControl.FileSystemAccessRule]::new(
                    $principal, $fullControl, [Security.AccessControl.AccessControlType]::Allow
                )
            }
            $acl.AddAccessRule($rule)
        }
        $Item.SetAccessControl($acl)

        # Fail closed before writing passwords if inherited/broad/denying ACEs survive.
        $check = $Item.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
        if (-not $check.AreAccessRulesProtected) {
            throw 'The DEMO credential ACL still inherits access rules.'
        }
        $rules = @($check.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
        $allowedSids = @($allowed | ForEach-Object { $_.Value })
        $found = @{}
        foreach ($rule in $rules) {
            $sid = $rule.IdentityReference.Value
            if ($sid -notin $allowedSids -or $rule.IsInherited -or
                $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow -or
                ($rule.FileSystemRights -band $fullControl) -ne $fullControl) {
                throw 'The DEMO credential ACL contains unexpected access permissions.'
            }
            $found[$sid] = $true
        }
        foreach ($sid in $allowedSids) {
            if (-not $found.ContainsKey($sid)) {
                throw 'The DEMO credential ACL is missing a required protected principal.'
            }
        }
    }

    Set-AccessOnly -Item ([IO.DirectoryInfo]::new($DirectoryPath)) -IsDirectory $true
    if (Test-Path -LiteralPath $CredentialFilePath -PathType Leaf) {
        Set-AccessOnly -Item ([IO.FileInfo]::new($CredentialFilePath)) -IsDirectory $false
    }
}
