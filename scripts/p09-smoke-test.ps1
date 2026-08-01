param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Username = "admin",
    [string]$Password = $env:CTIC_SMOKE_PASSWORD
)

$BaseUrl = $BaseUrl.TrimEnd("/")

if ([string]::IsNullOrWhiteSpace($Password)) {
    $securePassword = Read-Host "Nhap mat khau $Username" -AsSecureString

    $credential = New-Object System.Management.Automation.PSCredential(
        $Username,
        $securePassword
    )

    $Password = $credential.GetNetworkCredential().Password
}

$script:results = @()
$script:token = $null

function Add-TestResult {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [int]$Expected,
        [int]$Actual,
        [string]$Message
    )

    $result = [PSCustomObject]@{
        Test     = $Name
        Method   = $Method
        Path     = $Path
        Expected = $Expected
        Actual   = $Actual
        Result   = if ($Expected -eq $Actual) {
            "PASS"
        }
        else {
            "FAIL"
        }
        Message  = $Message
    }

    $script:results += $result
}

function Get-HttpStatus {
    param(
        [object]$ErrorRecord
    )

    if (
        $null -ne $ErrorRecord.Exception.Response -and
        $null -ne $ErrorRecord.Exception.Response.StatusCode
    ) {
        return [int]$ErrorRecord.Exception.Response.StatusCode
    }

    return 0
}

function Invoke-SmokeGet {
    param(
        [string]$Name,
        [string]$Path,
        [bool]$Authenticated = $true
    )

    try {
        $parameters = @{
            Method      = "GET"
            Uri         = "$BaseUrl$Path"
            ErrorAction = "Stop"
        }

        if ($Authenticated) {
            $parameters["Headers"] = @{
                Authorization = "Bearer $script:token"
            }
        }

        $response = Invoke-RestMethod @parameters

        Add-TestResult `
            -Name $Name `
            -Method "GET" `
            -Path $Path `
            -Expected 200 `
            -Actual 200 `
            -Message "OK"

        return $response
    }
    catch {
        $status = Get-HttpStatus -ErrorRecord $_

        Add-TestResult `
            -Name $Name `
            -Method "GET" `
            -Path $Path `
            -Expected 200 `
            -Actual $status `
            -Message $_.ErrorDetails.Message

        return $null
    }
}

Write-Host ""
Write-Host "1. Kiem tra Health"

$null = Invoke-SmokeGet `
    -Name "Health Liveness" `
    -Path "/health/live" `
    -Authenticated $false

$null = Invoke-SmokeGet `
    -Name "Health Readiness" `
    -Path "/health" `
    -Authenticated $false

Write-Host "2. Dang nhap"

try {
    $loginBody = @{
        username = $Username
        password = $Password
    } | ConvertTo-Json

    $loginParameters = @{
        Method      = "POST"
        Uri         = "$BaseUrl/auth/login"
        ContentType = "application/json"
        Body        = $loginBody
        ErrorAction = "Stop"
    }

    $login = Invoke-RestMethod @loginParameters
    $script:token = $login.access_token

    Add-TestResult `
        -Name "Authentication" `
        -Method "POST" `
        -Path "/auth/login" `
        -Expected 200 `
        -Actual 200 `
        -Message "OK"
}
catch {
    $status = Get-HttpStatus -ErrorRecord $_

    Add-TestResult `
        -Name "Authentication" `
        -Method "POST" `
        -Path "/auth/login" `
        -Expected 200 `
        -Actual $status `
        -Message $_.ErrorDetails.Message

    $script:results | Format-Table -AutoSize

    Write-Host "SMOKE TEST DUNG VI DANG NHAP THAT BAI" `
        -ForegroundColor Red

    exit 1
}

Write-Host "3. Kiem tra cac module P.09"

$endpoints = @(
    @{
        Name = "Customers"
        Path = "/customers"
    },
    @{
        Name = "Applications"
        Path = "/certification-applications"
    },
    @{
        Name = "Application Reviews"
        Path = "/application-reviews"
    },
    @{
        Name = "Contracts"
        Path = "/contracts"
    },
    @{
        Name = "Agreements"
        Path = "/certification-agreements"
    },
    @{
        Name = "Projects"
        Path = "/certification-projects"
    },
    @{
        Name = "Mandays"
        Path = "/manday-calculations"
    },
    @{
        Name = "Audit Programs"
        Path = "/audit-programs"
    },
    @{
        Name = "Audit Plans"
        Path = "/audit-plans"
    },
    @{
        Name = "Audit Teams"
        Path = "/audit-team-appointments"
    },
    @{
        Name = "Reports"
        Path = "/reports"
    },
    @{
        Name = "Findings"
        Path = "/audit-findings"
    },
    @{
        Name = "Technical Reviews"
        Path = "/technical-reviews"
    },
    @{
        Name = "Decisions"
        Path = "/certification-decisions"
    },
    @{
        Name = "Result Notifications"
        Path = "/audit-result-notifications"
    },
    @{
        Name = "Certificates"
        Path = "/certificates"
    },
    @{
        Name = "Experts"
        Path = "/experts"
    },
    @{
        Name = "Competencies"
        Path = "/expert-competencies"
    },
    @{
        Name = "Classification Codes"
        Path = "/industry-classifications/codes"
    },
    @{
        Name = "IAF Scopes"
        Path = "/industry-classifications/iaf-scopes"
    },
    @{
        Name = "Dashboard"
        Path = "/dashboard/overview"
    },
    @{
        Name = "Notifications"
        Path = "/notifications/me/summary"
    },
    @{
        Name = "Users"
        Path = "/users"
    },
    @{
        Name = "Roles"
        Path = "/users/roles"
    },
    @{
        Name = "Audit Logs"
        Path = "/audit-logs/summary"
    }
)

$projects = $null
$technicalReviews = $null

foreach ($endpoint in $endpoints) {
    $response = Invoke-SmokeGet `
        -Name $endpoint.Name `
        -Path $endpoint.Path

    if ($endpoint.Name -eq "Projects") {
        $projects = $response
    }

    if ($endpoint.Name -eq "Technical Reviews") {
        $technicalReviews = $response
    }
}

Write-Host "4. Kiem tra lien ket ho so"

$firstProject = @($projects) |
    Select-Object -First 1

if (
    $null -ne $firstProject -and
    $null -ne $firstProject.id
) {
    $null = Invoke-SmokeGet `
        -Name "Project Dossier" `
        -Path "/certification-projects/$($firstProject.id)/dossier"

    $null = Invoke-SmokeGet `
        -Name "Project Alerts" `
        -Path "/certification-projects/$($firstProject.id)/alerts"

    $null = Invoke-SmokeGet `
        -Name "Project Scopes" `
        -Path "/certification-project-scopes/project/$($firstProject.id)"
}

$firstReview = @($technicalReviews) |
    Select-Object -First 1

if (
    $null -ne $firstReview -and
    $null -ne $firstReview.id
) {
    $null = Invoke-SmokeGet `
        -Name "Review Documents" `
        -Path "/document-files/entity/technical_review/$($firstReview.id)"
}

Write-Host ""
Write-Host "===== P.09 SMOKE TEST ====="

$script:results |
    Select-Object `
        Test,
        Expected,
        Actual,
        Result |
    Format-Table -AutoSize

$failedTests = @(
    $script:results |
        Where-Object {
            $_.Result -eq "FAIL"
        }
)

Write-Host ""
Write-Host "Tong test: $($script:results.Count)"
Write-Host "PASS: $($script:results.Count - $failedTests.Count)"
Write-Host "FAIL: $($failedTests.Count)"

if ($failedTests.Count -gt 0) {
    Write-Host ""
    Write-Host "===== TEST BI LOI =====" `
        -ForegroundColor Red

    $failedTests |
        Select-Object `
            Test,
            Method,
            Path,
            Actual,
            Message |
        Format-List

    exit 1
}

Write-Host ""
Write-Host "SMOKE TEST P.09 HOAN THANH" `
    -ForegroundColor Green

exit 0