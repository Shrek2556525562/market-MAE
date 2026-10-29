$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$downloadDirectory = Join-Path $root 'data\downloads'
$manifestPath = Join-Path $downloadDirectory 'manifest.json'
$collectedAt = Get-Date -Format 'yyyy-MM-dd'

$intercarifPath = Join-Path $downloadDirectory 'intercarif-pharma-training-offers.csv'
$campusFrancePath = Join-Path $downloadDirectory 'campus-france-pharma-programmes.csv'
$cpfPath = Join-Path $downloadDirectory 'cpf-pharma-training-offers.csv'

$intercarifUrl = 'https://catalogue-apprentissage.intercariforef.org/api/v1/es/search/formation/_msearch?'
$intercarifCatalogUrl = 'https://catalogue-apprentissage.intercariforef.org/recherche/formations'
$campusMasterUrl = 'https://cataloguelm.campusfrance.org/master/'
$campusLicenceUrl = 'https://cataloguelm.campusfrance.org/licence/'
$cpfApiUrl = 'https://opendata.caissedesdepots.fr/api/explore/v2.1/catalog/datasets/moncompteformation_catalogueformation/records'
$cpfCatalogUrl = 'https://www.moncompteformation.gouv.fr/espace-prive/html/#/formation/recherche'
$cpfDatasetUrl = 'https://opendata.caissedesdepots.fr/explore/dataset/moncompteformation_catalogueformation/'

$acute = [char]0x00e9
$transferrable = 'Transf' + $acute + 'rable'
$bioprocess = 'bioproc' + $acute + 'd' + $acute + 's'
$processEngineering = 'genie des proc' + $acute + 'd' + $acute + 's'
$intercarifQueries = @(
    'pharmacie', 'pharmaceutique', ('m' + $acute + 'dicament'),
    'biotechnologie', $bioprocess, 'bioanalyse', 'biochimie',
    'microbiologie', 'pharmacologie', 'chimie analytique',
    'formulation pharmaceutique', 'production pharmaceutique',
    'industrie pharmaceutique', 'controle qualite', ('qualit' + $acute + ' pharmaceutique'),
    $processEngineering, 'bonnes pratiques de fabrication',
    'conditionnement pharmaceutique', 'reglementation pharmaceutique'
)
$campusQueries = @(
    'pharmacie', 'pharmaceutique', ('m' + $acute + 'dicament'), 'biotechnologie',
    $bioprocess, 'microbiologie', 'pharmacologie', 'chimie',
    'biochimie', 'toxicologie', 'qualite'
)
$cpfQueries = @(
    'pharmacie', 'pharmaceutique', ('m' + $acute + 'dicament'), 'biotechnologie',
    'bioproduction', $bioprocess, 'microbiologie', 'bioanalyse',
    'biochimie', 'pharmacologie', 'formulation pharmaceutique',
    ('qualit' + $acute + ' pharmaceutique'), 'industrie pharmaceutique',
    'bonnes pratiques de fabrication', 'controle qualite pharmaceutique',
    'chimie analytique'
)

function Get-Text {
    param($Value)
    if ($null -eq $Value) {
        return ''
    }
    if ($Value -is [System.Array]) {
        return (($Value | ForEach-Object { [string]$_ }) -join ' ')
    }
    return [string]$Value
}

function Get-CoordinateDistanceMeters {
    param(
        [double]$LatitudeA,
        [double]$LongitudeA,
        [double]$LatitudeB,
        [double]$LongitudeB
    )

    $earthRadius = 6371000
    $latA = $LatitudeA * [math]::PI / 180
    $latB = $LatitudeB * [math]::PI / 180
    $deltaLat = ($LatitudeB - $LatitudeA) * [math]::PI / 180
    $deltaLon = ($LongitudeB - $LongitudeA) * [math]::PI / 180
    $a = [math]::Sin($deltaLat / 2) * [math]::Sin($deltaLat / 2) +
        [math]::Cos($latA) * [math]::Cos($latB) *
        [math]::Sin($deltaLon / 2) * [math]::Sin($deltaLon / 2)
    return 2 * $earthRadius * [math]::Atan2([math]::Sqrt($a), [math]::Sqrt(1 - $a))
}

function Get-Classification {
    param([string]$Text)

    $excluded = '(?i)professorat|professeur|enseignement|kin[\u00e9]|ecologie|g[\u00e9]ologie|g[\u00e9]oscience|v[\u00e9]t[\u00e9]rinaire|sciences de l.?environnement|environnement et [e\u00e9]cotechnologies|di[e\u00e9]t[e\u00e9]tique|nutrition|staps|sciences du sport|parcours agro|agronomie|agronomique|agroalimentaire'
    $isPharma = $Text -match '(?i)pharmaceut|pharmac|pharmacie|m[\u00e9]dicament|produits? de sant[\u00e9]'
    if ($Text -match $excluded -and -not $isPharma) {
        return $null
    }

    if ($isPharma) {
        return [pscustomobject]@{
            categorie = 'Pharmacie et produits de santé'
            pertinence_pharma = 'Directe'
        }
    }
    if ($Text -match '(?i)biotechn|bioproc[\u00e9]d|bioanal|bioqual|biochim|biologie m[\u00e9]dicale|biologie mol[\u00e9]culaire|microbiolog|g[\u00e9]nie biologique|g[\u00e9]nie biotechnolog|bioproduction') {
        return [pscustomobject]@{
            categorie = 'Biotechnologies et analyses biologiques'
            pertinence_pharma = 'Directe'
        }
    }
    if ($Text -match '(?i)\bchimie\b|chimie analytique|formulation|chimie[- ]biologie') {
        return [pscustomobject]@{
            categorie = 'Chimie et sciences analytiques'
            pertinence_pharma = $transferrable
        }
    }
    if ($Text -match '(?i)pilotage des proc[\u00e9]d[\u00e9]s|g[\u00e9]nie des proc[\u00e9]d[\u00e9]s|production industrielle|contr[\u00f4]le industriel|r[\u00e9]gulation automatique|g[\u00e9]nie industriel|maintenance des syst[\u00e8]mes|conditionnement') {
        return [pscustomobject]@{
            categorie = 'Procédés, production et automatisme industriels'
            pertinence_pharma = 'Transférable'
        }
    }
    if ($Text -match '(?i)qualit[\u00e9]|contr[\u00f4]le|m[\u00e9]trologie|bonnes pratiques|BPF|GMP|assurance qualit[\u00e9]|laboratoire') {
        return [pscustomobject]@{
            categorie = 'Qualité, métrologie, maintenance et conditionnement'
            pertinence_pharma = 'Transférable'
        }
    }
    if ($Text -match '(?i)sciences de la vie|sciences du vivant|biologie cellulaire|biologie g[\u00e9]n[\u00e9]rale|biologie[- ]sant[\u00e9]|biosant[\u00e9]') {
        return [pscustomobject]@{
            categorie = 'Sciences de la vie et du vivant'
            pertinence_pharma = 'Transférable'
        }
    }
    return $null
}

function New-TrainingRecord {
    param(
        [string]$Type,
        [string]$Id,
        [string]$Modality,
        [pscustomobject]$Classification,
        [string]$Title,
        [string]$AdmissionTitle,
        [string]$Description,
        [string]$Field,
        [string]$Provider,
        [string]$City,
        [string]$DepartmentCode,
        [string]$Department,
        [string]$Region,
        [string]$Address,
        [string]$Latitude,
        [string]$Longitude,
        [string]$CoordinateSource,
        [string]$GeoScore,
        [string]$Year,
        [string]$Url,
        [string]$SourceName,
        [string]$SourceUrl
    )

    return [pscustomobject][ordered]@{
        annee = $Year
        type_offre = $Type
        identifiant_source = $Id
        modalite_formation = $Modality
        categorie = $Classification.categorie
        pertinence_pharma = $Classification.pertinence_pharma
        formation = $Title
        intitule_admission = $AdmissionTitle
        parcours = $Description
        filiere = $Field
        etablissement = $Provider
        code_uai = ''
        ville = $City
        code_departement = $DepartmentCode
        departement = $Department
        region = $Region
        adresse = $Address
        latitude = $Latitude
        longitude = $Longitude
        score_geocodage = $GeoScore
        source_coordonnees = $CoordinateSource
        url_source_coordonnees = ''
        code_offre_parcoursup = ''
        statut_etablissement = ''
        date_collecte = $collectedAt
        url_formation = $Url
        source = $SourceName
        url_source = $SourceUrl
    }
}

function Invoke-JsonRequest {
    param(
        [string]$Uri,
        [string]$Method = 'Get',
        [string]$Body,
        [hashtable]$Headers
    )

    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            if ($Method -eq 'Post') {
                return Invoke-RestMethod -Method Post -Uri $Uri -Headers $Headers `
                    -ContentType 'application/x-ndjson; charset=utf-8' `
                    -Body ([System.Text.Encoding]::UTF8.GetBytes($Body)) -TimeoutSec 60
            }
            return Invoke-RestMethod -Uri $Uri -TimeoutSec 60
        }
        catch {
            if ($attempt -eq 3) {
                throw "Request failed for $Uri after $attempt attempts: $($_.Exception.Message)"
            }
            Start-Sleep -Seconds (2 * $attempt)
        }
    }
}

function Update-ManifestDataset {
    param(
        [string]$Source,
        [string]$File,
        [string]$CatalogUrl,
        [int]$Rows,
        [string[]]$Queries,
        [string]$Coverage
    )

    $filePath = Join-Path $downloadDirectory $File
    $entry = [pscustomobject][ordered]@{
        source = $Source
        status = 'generated'
        file = $File
        catalog_url = $CatalogUrl
        download_url = $CatalogUrl
        bytes = (Get-Item -LiteralPath $filePath).Length
        sha256 = (Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
        data_rows = $Rows
        queries = $Queries
        coverage = $Coverage
        collected_at = $collectedAt
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $remaining = @($manifest.datasets | Where-Object { $_.source -ne $Source })
    $manifest.datasets = @($remaining) + @($entry)
    $manifest.generated_at = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
}

Write-Output 'Collecting relevant current offers from InterCarif-Oref...'
$intercarifById = @{}
$intercarifHeaders = @{}
foreach ($term in $intercarifQueries) {
    $offset = 0
    $total = $null
    do {
        $requestHeader = @{ index = 'formation' } | ConvertTo-Json -Compress
        $requestQuery = @{
            size = 500
            from = $offset
            track_total_hits = $true
            query = @{
                bool = @{
                    filter = @(
                        @{ term = @{ catalogue_published = $true } },
                        @{ term = @{ published = $true } }
                    )
                    must = @(
                        @{
                            multi_match = @{
                                query = $term
                                type = 'cross_fields'
                                fields = @(
                                    'intitule_long', 'intitule_court', 'intitule_rco',
                                    'rncp_intitule'
                                )
                                operator = 'and'
                            }
                        }
                    )
                }
            }
        } | ConvertTo-Json -Depth 20 -Compress
        $body = $requestHeader + "`n" + $requestQuery + "`n"
        $response = Invoke-JsonRequest -Uri $intercarifUrl -Method Post -Body $body -Headers $intercarifHeaders
        $result = $response.responses | Select-Object -First 1
        if (-not $result -or $result.error) {
            throw "InterCarif-Oref search failed for '$term'."
        }
        $hits = @($result.hits.hits)
        if ($null -eq $total) {
            if ($result.hits.total.value) {
                $total = [int]$result.hits.total.value
            }
            else {
                $total = [int]$result.hits.total
            }
            if ($total -gt 10000) {
                throw "InterCarif-Oref query '$term' exceeds the 10,000-result API window; refusing to silently truncate it."
            }
        }
        foreach ($hit in $hits) {
            if ($hit._id -and -not $intercarifById.ContainsKey([string]$hit._id)) {
                $intercarifById[[string]$hit._id] = $hit._source
            }
        }
        if ($hits.Count -eq 0 -and $offset -lt $total) {
            throw "InterCarif-Oref returned an empty page for '$term' at offset $offset of $total."
        }
        $offset += $hits.Count
    } while ($offset -lt $total)

    Write-Output "  '$term': $total matches; $($intercarifById.Count) unique offers collected."
}

$intercarifRecords = [System.Collections.Generic.List[object]]::new()
$intercarifGeocodes = @{}
foreach ($offer in $intercarifById.Values) {
    $classificationText = @(
        $offer.intitule_long, $offer.intitule_court, $offer.intitule_rco,
        $offer.rncp_intitule
    ) -join ' '
    $classification = Get-Classification -Text $classificationText
    if (-not $classification) {
        continue
    }

    $address = Get-Text $offer.lieu_formation_adresse
    $sourceCoordinates = Get-Text $offer.lieu_formation_geo_coordonnees
    $coordinates = ''
    $coordinateSource = ''
    $geocodeScore = ''
    if ($address -and $address.Trim() -ne '-') {
        $city = Get-Text $offer.localite
        $departmentName = Get-Text $offer.nom_departement
        $addressKey = @($address, $city, $departmentName) -join '|'
        $addressKey = $addressKey.Trim().ToLowerInvariant()
        if (-not $intercarifGeocodes.ContainsKey($addressKey)) {
            try {
                Start-Sleep -Milliseconds 300
                $geocodeQuery = @($address, $city, $departmentName) | Where-Object { $_ }
                $geocodeUrl = 'https://api-adresse.data.gouv.fr/search/?q=' +
                    [uri]::EscapeDataString(($geocodeQuery -join ', ')) + '&limit=1'
                $geocode = Invoke-JsonRequest -Uri $geocodeUrl
                $feature = $geocode.features | Select-Object -First 1
                $sourceDepartment = Get-Text $offer.num_departement
                $banContext = @()
                if ($feature) {
                    $banContext = @($feature.properties.context -split ',\s*')
                }
                $departmentMatches = -not $sourceDepartment -or
                    ($banContext.Count -gt 0 -and $banContext[0] -eq $sourceDepartment)
                if ($feature -and $feature.properties.score -ge 0.65 -and $departmentMatches) {
                    $intercarifGeocodes[$addressKey] = [pscustomobject]@{
                        coordinates = ([double]$feature.geometry.coordinates[1]).ToString([cultureinfo]::InvariantCulture) + ',' +
                            ([double]$feature.geometry.coordinates[0]).ToString([cultureinfo]::InvariantCulture)
                        score = ([double]$feature.properties.score).ToString([cultureinfo]::InvariantCulture)
                        city = Get-Text $feature.properties.city
                        department_code = if ($banContext.Count -gt 0) { $banContext[0] } else { '' }
                        department = if ($banContext.Count -gt 1) { $banContext[1] } else { '' }
                        region = if ($banContext.Count -gt 2) { $banContext[2] } else { '' }
                    }
                }
                else {
                    $intercarifGeocodes[$addressKey] = $null
                    Write-Warning "No reliable BAN coordinate match for InterCarif-Oref address: $address"
                }
            }
            catch {
                $intercarifGeocodes[$addressKey] = $null
                Write-Warning "BAN geocoding failed for '$address': $($_.Exception.Message)"
            }
        }
        $geocodedLocation = $intercarifGeocodes[$addressKey]
        if ($geocodedLocation) {
            $coordinates = $geocodedLocation.coordinates
            $geocodeScore = $geocodedLocation.score
            $coordinateSource = 'Base Adresse Nationale (BAN)'
            if ($sourceCoordinates -match '^\s*(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)\s*$') {
                $sourceLatitude = [double]::Parse($Matches[1].Replace(',', '.'), [cultureinfo]::InvariantCulture)
                $sourceLongitude = [double]::Parse($Matches[2].Replace(',', '.'), [cultureinfo]::InvariantCulture)
                $banLatitudeLongitude = $geocodedLocation.coordinates -split ','
                $banLatitude = [double]::Parse($banLatitudeLongitude[0], [cultureinfo]::InvariantCulture)
                $banLongitude = [double]::Parse($banLatitudeLongitude[1], [cultureinfo]::InvariantCulture)
                if ((Get-CoordinateDistanceMeters -LatitudeA $sourceLatitude -LongitudeA $sourceLongitude `
                    -LatitudeB $banLatitude -LongitudeB $banLongitude) -le 2000) {
                    $coordinates = $sourceCoordinates
                    $coordinateSource = 'InterCarif-Oref (lieu recoupé avec la BAN)'
                }
            }
        }
    }
    $latitude = ''
    $longitude = ''
    if ($coordinates -match '^\s*(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)\s*$') {
        $latitude = $Matches[1].Replace(',', '.')
        $longitude = $Matches[2].Replace(',', '.')
    }
    else {
        $coordinates = ''
        $coordinateSource = ''
    }

    $departmentCode = Get-Text $offer.num_departement
    $department = Get-Text $offer.nom_departement
    $city = Get-Text $offer.localite
    $region = Get-Text $offer.region
    if ($coordinateSource -eq 'Base Adresse Nationale (BAN)') {
        $geocodedLocation = $intercarifGeocodes[$address.Trim().ToLowerInvariant()]
        if ($geocodedLocation.city) { $city = $geocodedLocation.city }
        if ($geocodedLocation.department_code) { $departmentCode = $geocodedLocation.department_code }
        if ($geocodedLocation.department) { $department = $geocodedLocation.department }
        if ($geocodedLocation.region) { $region = $geocodedLocation.region }
    }
    $provider = Get-Text $offer.etablissement_formateur_entreprise_raison_sociale
    if (-not $provider) {
        $provider = Get-Text $offer.etablissement_gestionnaire_entreprise_raison_sociale
    }
    if (-not $provider) {
        $provider = Get-Text $offer.nom
    }
    $title = Get-Text $offer.intitule_long
    if (-not $title) {
        $title = Get-Text $offer.intitule_rco
    }
    $description = @((Get-Text $offer.objectif), (Get-Text $offer.contenu)) |
        Where-Object { $_ } | Select-Object -First 1
    $offerId = Get-Text $offer.id_rco_formation
    if (-not $offerId) {
        $offerId = Get-Text $offer.id_formation
    }
    $intercarifRecords.Add((New-TrainingRecord `
        -Type 'InterCarif-Oref' `
        -Id $offerId `
        -Modality 'Apprentissage' `
        -Classification $classification `
        -Title $title `
        -AdmissionTitle $title `
        -Description $description `
        -Field (Get-Text $offer.niveau) `
        -Provider $provider `
        -City $city `
        -DepartmentCode $departmentCode `
        -Department $department `
        -Region $region `
        -Address $address `
        -Latitude $latitude `
        -Longitude $longitude `
        -CoordinateSource $coordinateSource `
        -GeoScore $geocodeScore `
        -Year '' `
        -Url '' `
        -SourceName 'InterCarif-Oref; apprenticeship catalogue' `
        -SourceUrl $intercarifCatalogUrl))
}
if ($intercarifRecords.Count -eq 0) {
    throw 'No relevant InterCarif-Oref offers were collected; refusing to overwrite the prior snapshot.'
}
$intercarifRecords |
    Sort-Object region, departement, ville, formation, etablissement, identifiant_source |
    Export-Csv -LiteralPath $intercarifPath -Delimiter ';' -NoTypeInformation -Encoding UTF8
Update-ManifestDataset -Source 'InterCarif-Oref apprenticeship catalogue' -File (Split-Path -Leaf $intercarifPath) `
    -CatalogUrl $intercarifCatalogUrl -Rows $intercarifRecords.Count -Queries $intercarifQueries `
    -Coverage 'Keyword-search union; active published offers; mapped coordinates are retained only when corroborated against the training address and department through BAN.'
Write-Output "  Wrote $($intercarifRecords.Count) relevant InterCarif-Oref offers."

Write-Output 'Collecting current Licence and Master programmes from Campus France...'
$campusPrograms = @{}
foreach ($catalogue in @(
    [pscustomobject]@{ level = 'Master'; base = 'https://cataloguelm.campusfrance.org/master/ws/'; search = 'getmasterwkwjson.php'; detail = 'getmasterformjson.php'; url = $campusMasterUrl },
    [pscustomobject]@{ level = 'Licence'; base = 'https://cataloguelm.campusfrance.org/licence/ws/'; search = 'getlicwkwjson.php'; detail = 'getlicformjson.php'; url = $campusLicenceUrl }
)) {
    foreach ($term in $campusQueries) {
        $escapedTerm = [uri]::EscapeDataString($term)
        $uri = $catalogue.base + $catalogue.search + '?listkeys=' + $escapedTerm + '&otherkeys=&levelkeys=&refkey='
        $response = Invoke-JsonRequest -Uri $uri
        if ($response.op -ne 1 -or @($response.programs).Count -lt [int]$response.total) {
            throw "Campus France $($catalogue.level) search was incomplete for '$term'."
        }
        foreach ($program in $response.programs) {
            $classification = Get-Classification -Text (Get-Text $program.fla)
            if (-not $classification) {
                continue
            }
            $key = "$($catalogue.level)-$($program.id)"
            if (-not $campusPrograms.ContainsKey($key)) {
                $campusPrograms[$key] = [pscustomobject]@{
                    level = $catalogue.level
                    base = $catalogue.base
                    detail = $catalogue.detail
                    catalogue_url = $catalogue.url
                    program = $program
                    classification = $classification
                }
            }
        }
        Write-Output "  $($catalogue.level) '$term': $($response.total) matches; $($campusPrograms.Count) relevant unique programmes."
    }
}

$campusRecords = [System.Collections.Generic.List[object]]::new()
$campusDetailFailures = 0
foreach ($entry in $campusPrograms.Values) {
    $program = $entry.program
    $detailsUri = $entry.base + $entry.detail + '?id=' + [uri]::EscapeDataString([string]$program.id)
    $details = Invoke-JsonRequest -Uri $detailsUri
    $institution = $details.etab
    $form = $details.form
    if ($details.op -ne 1) {
        $campusDetailFailures++
        Write-Warning "Campus France detail unavailable for programme $($program.id): $($details.errmsg)"
    }

    $latitude = ''
    $longitude = ''
    $coordinateSource = ''
    if ($null -ne $institution.gx -and $null -ne $institution.gy) {
        $latitude = [string]$institution.gx
        $longitude = [string]$institution.gy
        $coordinateSource = 'Campus France (campus de formation)'
    }
    $departmentCode = ''
    $department = ''
    if ((Get-Text $institution.ld) -match '^\s*(\d{2,3})\s*-\s*(.+)$') {
        $departmentCode = $Matches[1]
        $department = $Matches[2].Trim()
    }
    $address = @(
        (Get-Text $institution.lad1),
        (Get-Text $institution.lad2),
        (Get-Text $institution.cp),
        (Get-Text $institution.lv)
    ) | Where-Object { $_ }
    $url = Get-Text $form.fu
    $sourceName = "Campus France $($entry.level)"
    $sourceUrl = $entry.catalogue_url

    $campusRecords.Add((New-TrainingRecord `
        -Type 'Campus France' `
        -Id "$($entry.level)-$($program.id)" `
        -Modality 'Formation diplômante' `
        -Classification $entry.classification `
        -Title (Get-Text $program.fla) `
        -AdmissionTitle (Get-Text $program.fla) `
        -Description (Get-Text $program.fle) `
        -Field (Get-Text $program.fle) `
        -Provider (Get-Text $institution.lo) `
        -City (Get-Text $institution.lv) `
        -DepartmentCode $departmentCode `
        -Department $department `
        -Region (Get-Text $institution.lr) `
        -Address ($address -join ', ') `
        -Latitude $latitude `
        -Longitude $longitude `
        -CoordinateSource $coordinateSource `
        -GeoScore '' `
        -Year '' `
        -Url $url `
        -SourceName $sourceName `
        -SourceUrl $sourceUrl))
}
if ($campusRecords.Count -eq 0) {
    throw 'No relevant Campus France programmes were collected; refusing to overwrite the prior snapshot.'
}
$campusRecords |
    Sort-Object region, departement, ville, formation, etablissement, identifiant_source |
    Export-Csv -LiteralPath $campusFrancePath -Delimiter ';' -NoTypeInformation -Encoding UTF8
Update-ManifestDataset -Source 'Campus France Licence and Master catalogues' -File (Split-Path -Leaf $campusFrancePath) `
    -CatalogUrl 'https://cataloguelm.campusfrance.org/' -Rows $campusRecords.Count -Queries $campusQueries `
    -Coverage "Current searchable Licence/Master catalogues; $campusDetailFailures detail records lacked a successful detail response; intended for international applicants, not a complete national register."
Write-Output "  Wrote $($campusRecords.Count) Campus France programmes; $campusDetailFailures detail lookups failed."

Write-Output 'Collecting relevant Mon Compte Formation catalogue records...'
$cpfById = @{}
$cpfFields = @(
    'date_extract', 'nom_of', 'nom_departement', 'nom_region', 'type_referentiel',
    'code_rncp', 'intitule_certification', 'libelle_niveau_sortie_formation',
    'libelle_code_formacode_principal', 'siret', 'numero_formation',
    'intitule_formation', 'points_forts', 'objectif_formation',
    'contenu_formation', 'code_departement', 'code_region'
) -join ','
foreach ($term in $cpfQueries) {
    $where = [uri]::EscapeDataString('search("' + $term + '")')
    $select = [uri]::EscapeDataString($cpfFields)
    $offset = 0
    $total = $null
    do {
        $uri = $cpfApiUrl + '?limit=100&offset=' + $offset + '&where=' + $where + '&select=' + $select
        $response = Invoke-JsonRequest -Uri $uri
        if ($null -eq $total) {
            $total = [int]$response.total_count
            if ($total -gt 100000) {
                throw "CPF query '$term' unexpectedly exceeds 100,000 records; refusing an unbounded collection."
            }
        }
        $results = @($response.results)
        foreach ($record in $results) {
            $key = Get-Text $record.numero_formation
            if (-not $key) {
                $key = (Get-Text $record.siret) + '|' + (Get-Text $record.intitule_formation)
            }
            if ($key -and -not $cpfById.ContainsKey($key)) {
                $cpfById[$key] = $record
            }
        }
        if ($results.Count -eq 0 -and $offset -lt $total) {
            throw "CPF returned an empty page for '$term' at offset $offset of $total."
        }
        $offset += $results.Count
    } while ($offset -lt $total)

    Write-Output "  '$term': $total matches; $($cpfById.Count) unique records collected."
}

$cpfRecords = [System.Collections.Generic.List[object]]::new()
foreach ($record in $cpfById.Values) {
    $classificationText = @(
        $record.intitule_formation, $record.intitule_certification
    ) -join ' '
    $classification = Get-Classification -Text $classificationText
    if (-not $classification) {
        continue
    }
    $title = Get-Text $record.intitule_formation
    if (-not $title) {
        $title = Get-Text $record.intitule_certification
    }
    $description = @(
        (Get-Text $record.points_forts),
        (Get-Text $record.objectif_formation),
        (Get-Text $record.contenu_formation)
    ) | Where-Object { $_ } | Select-Object -First 2

    $cpfRecords.Add((New-TrainingRecord `
        -Type 'Mon Compte Formation (CPF)' `
        -Id (Get-Text $record.numero_formation) `
        -Modality 'Formation continue · CPF' `
        -Classification $classification `
        -Title $title `
        -AdmissionTitle (Get-Text $record.intitule_certification) `
        -Description ($description -join ' ') `
        -Field (Get-Text $record.libelle_niveau_sortie_formation) `
        -Provider (Get-Text $record.nom_of) `
        -City '' `
        -DepartmentCode (Get-Text $record.code_departement) `
        -Department (Get-Text $record.nom_departement) `
        -Region (Get-Text $record.nom_region) `
        -Address '' `
        -Latitude '' `
        -Longitude '' `
        -CoordinateSource '' `
        -GeoScore '' `
        -Year '' `
        -Url '' `
        -SourceName 'Mon Compte Formation · Caisse des Dépôts' `
        -SourceUrl $cpfDatasetUrl))
}
if ($cpfRecords.Count -eq 0) {
    throw 'No relevant CPF offers were collected; refusing to overwrite the prior snapshot.'
}
$cpfRecords |
    Sort-Object region, departement, ville, formation, etablissement, identifiant_source |
    Export-Csv -LiteralPath $cpfPath -Delimiter ';' -NoTypeInformation -Encoding UTF8
Update-ManifestDataset -Source 'Mon Compte Formation catalogue' -File (Split-Path -Leaf $cpfPath) `
    -CatalogUrl $cpfDatasetUrl -Rows $cpfRecords.Count -Queries $cpfQueries `
    -Coverage 'Filtered official catalogue records; the source has provider department/region but no verified course-site coordinates, so rows are retained but not plotted.'
Write-Output "  Wrote $($cpfRecords.Count) CPF offers without inventing venue coordinates."

Write-Output 'Official-source snapshots refreshed. Run scripts\build-pharma-training-csv.ps1 to rebuild the map inventory.'
