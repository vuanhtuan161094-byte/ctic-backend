$ErrorActionPreference = 'Stop'

try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $credentialPath = Join-Path $env:LOCALAPPDATA 'CMP\DEMO\credentials.json'
    $credentialJson = [System.IO.File]::ReadAllText($credentialPath)
    $credentialData = $credentialJson | ConvertFrom-Json
    if ($credentialData.schema -ne 'cmp-demo-credentials/v1') { exit 2 }

    $accounts = New-Object 'System.Collections.Generic.List[object]'
    if (-not [string]::IsNullOrWhiteSpace([string]$credentialData.admin.username) -and
        -not [string]::IsNullOrWhiteSpace([string]$credentialData.admin.password)) {
        $accounts.Add([pscustomobject]@{
            Label = 'Quản trị viên'
            Username = [string]$credentialData.admin.username
            Password = [string]$credentialData.admin.password
        })
    }

    $roleLabels = @{
        SALES = 'Nhân viên kinh doanh'
        STAFF = 'Nhân viên'
        COORDINATOR = 'Điều phối viên'
        AUDITOR = 'Chuyên gia / đánh giá viên'
        TECHNICAL_REVIEWER = 'Thẩm xét kỹ thuật'
        DECISION_MAKER = 'Người ra quyết định'
        ADMIN = 'Quản trị viên nội bộ'
    }
    foreach ($key in @($credentialData.internalAccounts.PSObject.Properties.Name | Sort-Object)) {
        $account = $credentialData.internalAccounts.$key
        if ([string]::IsNullOrWhiteSpace([string]$account.username) -or
            [string]::IsNullOrWhiteSpace([string]$account.password)) { continue }
        $role = ([string]$account.role).ToUpperInvariant()
        $label = $roleLabels[$role]
        if ([string]::IsNullOrWhiteSpace($label)) { $label = 'Nhân viên nội bộ' }
        $accounts.Add([pscustomobject]@{
            Label = $label
            Username = [string]$account.username
            Password = [string]$account.password
        })
    }

    foreach ($customerCode in @($credentialData.portalAccounts.PSObject.Properties.Name | Sort-Object)) {
        $account = $credentialData.portalAccounts.$customerCode
        if ([string]::IsNullOrWhiteSpace([string]$account.password)) { continue }
        $username = [string]$account.username
        if ([string]::IsNullOrWhiteSpace($username)) { $username = [string]$account.email }
        if ([string]::IsNullOrWhiteSpace($username)) { continue }
        $displayName = [string]$account.full_name
        if ([string]::IsNullOrWhiteSpace($displayName)) { $displayName = [string]$customerCode }
        $accounts.Add([pscustomobject]@{
            Label = "Portal — $displayName ($customerCode)"
            Username = $username
            Password = [string]$account.password
        })
    }

    if ($accounts.Count -eq 0) { exit 2 }
}
catch {
    exit 2
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'CMP - Tài khoản DEMO'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(760, 520)
$form.MinimumSize = New-Object System.Drawing.Size(640, 460)
$form.Font = New-Object System.Drawing.Font('Segoe UI', 10)

$instruction = New-Object System.Windows.Forms.Label
$instruction.Text = 'Chọn tài khoản để xem tên đăng nhập. Mật khẩu chỉ được chép vào clipboard khi bạn bấm nút.'
$instruction.Location = New-Object System.Drawing.Point(18, 16)
$instruction.Size = New-Object System.Drawing.Size(710, 42)
$instruction.Anchor = 'Top,Left,Right'
$form.Controls.Add($instruction)

$accountList = New-Object System.Windows.Forms.ListBox
$accountList.Location = New-Object System.Drawing.Point(18, 62)
$accountList.Size = New-Object System.Drawing.Size(710, 290)
$accountList.Anchor = 'Top,Bottom,Left,Right'
$accountList.DisplayMember = 'Label'
foreach ($account in $accounts) { [void]$accountList.Items.Add($account) }
$form.Controls.Add($accountList)

$usernameLabel = New-Object System.Windows.Forms.Label
$usernameLabel.Text = 'Tên đăng nhập'
$usernameLabel.Location = New-Object System.Drawing.Point(18, 366)
$usernameLabel.Size = New-Object System.Drawing.Size(160, 26)
$usernameLabel.Anchor = 'Bottom,Left'
$form.Controls.Add($usernameLabel)

$usernameValue = New-Object System.Windows.Forms.TextBox
$usernameValue.Location = New-Object System.Drawing.Point(18, 394)
$usernameValue.Size = New-Object System.Drawing.Size(500, 30)
$usernameValue.ReadOnly = $true
$usernameValue.Anchor = 'Bottom,Left,Right'
$form.Controls.Add($usernameValue)

$copyButton = New-Object System.Windows.Forms.Button
$copyButton.Text = 'Chép mật khẩu'
$copyButton.Location = New-Object System.Drawing.Point(540, 392)
$copyButton.Size = New-Object System.Drawing.Size(188, 34)
$copyButton.Anchor = 'Bottom,Right'
$form.Controls.Add($copyButton)

$status = New-Object System.Windows.Forms.Label
$status.Text = 'Mật khẩu không hiển thị trên cửa sổ.'
$status.Location = New-Object System.Drawing.Point(18, 440)
$status.Size = New-Object System.Drawing.Size(710, 26)
$status.Anchor = 'Bottom,Left,Right'
$form.Controls.Add($status)

$script:currentDemoAccount = $null
$accountList.Add_SelectedIndexChanged({
    $script:currentDemoAccount = $accountList.SelectedItem
    if ($null -ne $script:currentDemoAccount) {
        $usernameValue.Text = $script:currentDemoAccount.Username
        $status.Text = 'Mật khẩu không hiển thị trên cửa sổ.'
    }
})
$copyButton.Add_Click({
    if ($null -eq $script:currentDemoAccount) { return }
    try {
        [System.Windows.Forms.Clipboard]::SetText([string]$script:currentDemoAccount.Password)
        $status.Text = 'Đã chép mật khẩu vào clipboard.'
    }
    catch {
        $status.Text = 'Không thể ghi vào clipboard. Tài khoản không bị thay đổi.'
    }
})

$accountList.SelectedIndex = 0
[void]$form.ShowDialog()
$form.Dispose()
