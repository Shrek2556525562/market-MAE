$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$outputPath = Join-Path $root 'data\downloads\lba-pharma-training-offers.csv'
$searchBase = 'https://labonnealternance.apprentissage.beta.gouv.fr/recherche'
$collectedAt = Get-Date -Format 'yyyy-MM-dd'
$acute = [char]0x00e9
$grave = [char]0x00e8
$transferable = 'Transf' + $acute + 'rable'
$pharmaCategory = 'Pharmacie et produits de sant' + $acute
$processCategory = 'Proc' + $acute + 'd' + $acute + 's, production et automatisme industriels'
$qualityCategory = 'Qualit' + $acute + ', m' + $acute + 'trologie, maintenance et conditionnement'
$lifeScienceCategory = 'Sciences de la vie et du vivant'

$queries = @(
    'pharmacie',
    'pharmaceutique',
    'preparateur en pharmacie',
    'biotechnologie',
    'bioprocedes',
    'bioanalyses',
    'laboratoire',
    'chimie',
    'production pharmaceutique',
    'qualite pharmaceutique',
    'microbiologie',
    'technicien laboratoire',
    'gene des procedes',
    'pilotage des procedes',
    'industrie pharmaceutique',
    'controle qualite',
    'maintenance systeme production',
    'formulation pharmaceutique',
    'sciences du medicament',
    'cosmetique pharmaceutique'
)

$results = @{}
$userAgent = 'Mozilla/5.0'

foreach ($query in $queries) {
    $searchUrl = $searchBase + '?q=' + [uri]::EscapeDataString($query) + '&mode=formations&hitsPerPage=100'
    $response = Invoke-WebRequest -Uri $searchUrl -TimeoutSec 60 -UseBasicParsing -Headers @{ 'User-Agent' = $userAgent }
    $links = [regex]::Matches(
        $response.Content,
        '<a\b[^>]*href="(?<href>/formation/[^"]+)"[^>]*>(?<label>.*?)</a>',
        [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )

    foreach ($link in $links) {
        $href = $link.Groups['href'].Value.Split('?')[0]
        $label = [System.Net.WebUtility]::HtmlDecode(($link.Groups['label'].Value -replace '<[^>]+>', '')).Trim()
        if (-not $results.ContainsKey($href)) {
            $results[$href] = [pscustomobject]@{
                href = $href
                label = $label
                search_url = $searchUrl
            }
        }
    }

    Write-Output "LBA query '$query': $($links.Count) results, $($results.Count) distinct offers collected."
}

$records = [System.Collections.Generic.List[object]]::new()
$geocodedAddresses = @{}

foreach ($result in $results.Values) {
    $parts = [regex]::Match(
        $result.label,
        '^(?<formation>.*?)\s+\u2014\s+(?<provider>.*?)\s+\u2014\s+(?<address>.+)$'
    )
    if (-not $parts.Success) {
        Write-Warning "Skipping unparseable LBA result label: $($result.label)"
        continue
    }

    $formation = $parts.Groups['formation'].Value.Trim()
    $provider = $parts.Groups['provider'].Value.Trim()
    $address = $parts.Groups['address'].Value.Trim()
    $searchText = "$formation $provider"

    $category = $null
    $relevance = $transferable
    if ($searchText -match '(?i)pharmaceut|pharmac|m[\u00e9]dicament|pharmacie') {
        $category = $pharmaCategory
        $relevance = 'Directe'
    }
    elseif ($searchText -match '(?i)biotechn|bioanal|biochim|microbiolog|biologie m[\u00e9]dicale|bioproc[\u00e9]d|g[\u00e9]nie biotechnolog') {
        $category = 'Biotechnologies et analyses biologiques'
        $relevance = 'Directe'
    }
    elseif ($searchText -match '(?i)\bchimie\b|chimie analytique|formulation') {
        $category = 'Chimie et sciences analytiques'
        $relevance = 'Directe'
    }
    elseif ($searchText -match '(?i)pilotage des proc[\u00e9]d[\u00e9]s|g[\u00e9]nie des proc[\u00e9]d[\u00e9]s|production en industries|g[\u00e9]nie industriel|contr[\u00f4]le industriel|maintenance des syst[\u00e8]mes') {
        $category = $processCategory
        if ($searchText -match '(?i)pharmaceut|pharmac|pharmacie|m[\u00e9]dicament') {
            $relevance = 'Directe'
        }
    }
    elseif ($searchText -match '(?i)qualit[\u00e9]|mesures physiques|packaging|conditionnement|m[\u00e9]trologie') {
        $category = $qualityCategory
        if ($searchText -match '(?i)pharmaceut|pharmac|pharmacie|m[\u00e9]dicament') {
            $relevance = 'Directe'
        }
    }
    elseif ($searchText -match '(?i)biologie|sciences du vivant') {
        $category = $lifeScienceCategory
    }

    if (-not $category) {
        continue
    }
    if ($searchText -match '(?i)agroalimentaire|alimentaire|agronomie|environnement|v[\u00e9]t[\u00e9]rinaire|professorat|enseignement' -and
        $searchText -notmatch '(?i)pharmaceut|pharmac|pharmacie|m[\u00e9]dicament') {
        continue
    }

    $city = ''
    $departmentCode = ''
    $department = ''
    $region = ''
    $latitude = ''
    $longitude = ''
    $geocodeScore = ''
    $coordinateSource = ''

    if ($address -match '(?<postal>\b\d{5}\b)\s+(?<city>.+)$') {
        $city = $Matches['city'].Trim()
    }
    if ($address -match '\b(?<postal>\d{5})\b') {
        $postalCode = $Matches['postal']
        if ($postalCode.Length -ge 2) {
            $departmentCode = $postalCode.Substring(0, 2)
        }
        if ($postalCode.StartsWith('97') -or $postalCode.StartsWith('98')) {
            $departmentCode = $postalCode.Substring(0, 3)
        }
    }

    if (-not $geocodedAddresses.ContainsKey($address)) {
        $geocodeUrl = 'https://api-adresse.data.gouv.fr/search/?q=' + [uri]::EscapeDataString($address) + '&limit=1'
        try {
            Start-Sleep -Milliseconds 300
            $geocode = Invoke-RestMethod -Uri $geocodeUrl -TimeoutSec 30
            $feature = $geocode.features | Select-Object -First 1
            if ($feature -and $feature.geometry.coordinates.Count -eq 2 -and $feature.properties.score -ge 0.55) {
                $context = @($feature.properties.context -split ',\s*')
                $geocodedAddresses[$address] = [pscustomobject]@{
                    latitude = ([double]$feature.geometry.coordinates[1]).ToString([cultureinfo]::InvariantCulture)
                    longitude = ([double]$feature.geometry.coordinates[0]).ToString([cultureinfo]::InvariantCulture)
                    score = ([double]$feature.properties.score).ToString([cultureinfo]::InvariantCulture)
                    city = $feature.properties.city
                    department_code = if ($context.Count -gt 0) { $context[0] } else { '' }
                    department = if ($context.Count -gt 1) { $context[1] } else { '' }
                    region = if ($context.Count -gt 2) { $context[2] } else { '' }
                }
            }
            else {
                $geocodedAddresses[$address] = $null
                Write-Warning "No reliable BAN coordinate match for LBA address: $address"
            }
        }
        catch {
            Write-Warning "BAN geocoding failed for '$address': $($_.Exception.Message)"
            $geocodedAddresses[$address] = $null
        }
    }

    $location = $geocodedAddresses[$address]
    if ($location) {
        $latitude = $location.latitude
        $longitude = $location.longitude
        $geocodeScore = $location.score
        $city = $location.city
        $departmentCode = $location.department_code
        $department = $location.department
        $region = $location.region
        $coordinateSource = 'Base Adresse Nationale (BAN)'
    }

    $urlFormation = 'https://labonnealternance.apprentissage.beta.gouv.fr' + $result.href
    $records.Add([pscustomobject][ordered]@{
        categorie = $category
        pertinence_pharma = $relevance
        formation = $formation
        etablissement = $provider
        adresse = $address
        ville = $city
        code_departement = $departmentCode
        departement = $department
        region = $region
        latitude = $latitude
        longitude = $longitude
        precision_geocodage = $geocodeScore
        source_coordonnees = $coordinateSource
        identifiant_source = ($result.href -split '/')[2]
        date_collecte = $collectedAt
        url_formation = $urlFormation
        url_source = $result.search_url
        source = 'La bonne alternance; Base Adresse Nationale'
    })
}

$records |
    Sort-Object region, departement, ville, formation, etablissement |
    Export-Csv -LiteralPath $outputPath -Delimiter ';' -NoTypeInformation -Encoding UTF8

$located = @($records | Where-Object { $_.latitude -and $_.longitude }).Count
Write-Output "Wrote $($records.Count) relevant LBA offers to $outputPath; $located have geocoded locations."
