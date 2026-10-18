$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

$apiRoot = "https://recherche-entreprises.api.gouv.fr/search"
$activityCodes = @("21.10Z", "21.20Z")
$pageSize = 25
$batchSize = 5
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(45)
$client.DefaultRequestHeaders.Add("User-Agent", "PharmaFranceStaticData/1.0")
$companiesBySiren = @{}
$sitesBySiret = @{}
$totalsByActivity = @{}
$matchedCompanyCount = 0

function Get-ApiPayload([string]$Url) {
  $response = $client.GetAsync($Url).GetAwaiter().GetResult()
  try {
    if (-not $response.IsSuccessStatusCode) {
      throw "API request failed with HTTP $([int]$response.StatusCode): $Url"
    }
    $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return ConvertFrom-Json -InputObject $json
  }
  finally {
    $response.Dispose()
  }
}

foreach ($code in $activityCodes) {
  $page = 1
  do {
    $query = "activite_principale=$([uri]::EscapeDataString($code))&etat_administratif=A&include=siege&minimal=true&page=$page&per_page=$pageSize"
    $payload = Get-ApiPayload "$apiRoot`?$query"
    if (-not $payload.results) {
      throw "API returned no company results for $code, page $page."
    }

    $totalsByActivity[$code] = [int]$payload.total_results
    foreach ($record in $payload.results) {
      if (-not $record.siren -or -not $record.nom_complet) {
        continue
      }

      $siren = [string]$record.siren
      if (-not $companiesBySiren.ContainsKey($siren)) {
        $companiesBySiren[$siren] = [pscustomobject]@{
          siren = $siren
          nom_complet = $record.nom_complet
          activityCodes = @()
          siege = [pscustomobject]@{
            coordonnees = $record.siege.coordonnees
            libelle_commune = $record.siege.libelle_commune
            code_postal = $record.siege.code_postal
          }
        }
      }

      $company = $companiesBySiren[$siren]
      if ($company.activityCodes -notcontains $code) {
        $company.activityCodes = @($company.activityCodes) + $code
      }
    }

    $page++
  } while ($page -le [int]$payload.total_pages)
}

$companies = @($companiesBySiren.Values | Sort-Object nom_complet, siren)
$totalBatches = [Math]::Ceiling($companies.Count / [double]$batchSize)
for ($offset = 0; $offset -lt $companies.Count; $offset += $batchSize) {
  $end = [Math]::Min($offset + $batchSize - 1, $companies.Count - 1)
  $batch = @($companies[$offset..$end])
  $jobs = @()

  foreach ($company in $batch) {
    $query = "q=$([uri]::EscapeDataString($company.nom_complet))&etat_administratif=A&include=matching_etablissements&limite_matching_etablissements=100&minimal=true&page=1&per_page=25"
    $jobs += [pscustomobject]@{
      company = $company
      task = $client.GetAsync("$apiRoot`?$query")
    }
  }

  foreach ($job in $jobs) {
    $response = $job.task.GetAwaiter().GetResult()
    try {
      if (-not $response.IsSuccessStatusCode) {
        throw "API establishment request failed with HTTP $([int]$response.StatusCode) for $($job.company.siren) ($($job.company.nom_complet))."
      }

      $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      $payload = ConvertFrom-Json -InputObject $json
      $record = $payload.results | Where-Object {
        [string]$_.siren -eq [string]$job.company.siren
      } | Select-Object -First 1
      if (-not $record) {
        continue
      }

      $matchedCompanyCount++
      foreach ($establishment in $record.matching_etablissements) {
        if (
          $establishment.etat_administratif -ne "A" -or
          $activityCodes -notcontains $establishment.activite_principale -or
          -not $establishment.siret
        ) {
          continue
        }

        $latitude = 0.0
        $longitude = 0.0
        if (
          -not [double]::TryParse(
            [string]$establishment.latitude,
            [Globalization.NumberStyles]::Float,
            [Globalization.CultureInfo]::InvariantCulture,
            [ref]$latitude
          ) -or
          -not [double]::TryParse(
            [string]$establishment.longitude,
            [Globalization.NumberStyles]::Float,
            [Globalization.CultureInfo]::InvariantCulture,
            [ref]$longitude
          ) -or
          [Math]::Abs($latitude) -gt 90 -or
          [Math]::Abs($longitude) -gt 180
        ) {
          continue
        }

        $siret = [string]$establishment.siret
        if (-not $sitesBySiret.ContainsKey($siret)) {
          $sitesBySiret[$siret] = [pscustomobject]@{
            siret = $siret
            companySiren = [string]$job.company.siren
            companyName = $job.company.nom_complet
            coordinates = @($latitude, $longitude)
            etablissement = [pscustomobject]@{
              adresse = $establishment.adresse
              libelle_commune = $establishment.libelle_commune
              activite_principale = $establishment.activite_principale
            }
          }
        }
      }
    }
    finally {
      $response.Dispose()
    }
  }

  $completed = [Math]::Min($offset + $batch.Count, $companies.Count)
  Write-Progress -Activity "Building the static pharmaceutical dataset" `
    -Status "$completed / $($companies.Count) companies; $($sitesBySiret.Count) sites" `
    -PercentComplete (($completed / [double]$companies.Count) * 100)
  Start-Sleep -Milliseconds 1100
}
Write-Progress -Activity "Building the static pharmaceutical dataset" -Completed

$outputDirectory = Join-Path $PSScriptRoot "..\data"
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$outputPath = Join-Path $outputDirectory "pharmaceutical-companies-fr.json"
$snapshot = [ordered]@{
  generatedAt = [DateTime]::UtcNow.ToString("o")
  source = $apiRoot
  activityTotals = $totalsByActivity
  companyCount = $companies.Count
  companySiteSearchCount = $matchedCompanyCount
  siteCount = $sitesBySiret.Count
  companies = $companies
  sites = @($sitesBySiret.Values | Sort-Object companyName, siret)
}
$json = $snapshot | ConvertTo-Json -Depth 8
[System.IO.File]::WriteAllText(
  $outputPath,
  $json,
  [System.Text.UTF8Encoding]::new($false)
)

Write-Output "Wrote $outputPath"
Write-Output "Companies: $($companies.Count); site searches matched: $matchedCompanyCount; sites: $($sitesBySiret.Count)"
