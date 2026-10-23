$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$parcoursupPath = Join-Path $root 'data\downloads\parcoursup-2025-applications-and-admission-responses.csv'
$directoryPath = Join-Path $root 'data\downloads\sies-directory-of-principal-higher-education-institutions.csv'
$outputPath = Join-Path $root 'data\formations-pharma-fr.csv'

foreach ($path in @($parcoursupPath, $directoryPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Source file not found: $path"
    }
}

$directoryByUai = @{}
$acute = [char]0x00e9
$grave = [char]0x00e8
$transferable = 'Transf' + $acute + 'rable'
$pharmaCategory = 'Pharmacie et produits de sant' + $acute
$processCategory = 'Proc' + $acute + 'd' + $acute + 's, production et automatisme industriels'
$qualityCategory = 'Qualit' + $acute + ', m' + $acute + 'trologie, maintenance et conditionnement'
$lifeScienceCategory = 'Sciences de la vie et du vivant'
$accessCategory = 'Acc' + $grave + 's aux ' + $acute + 'tudes de pharmacie et de sant' + $acute
foreach ($institution in (Import-Csv -LiteralPath $directoryPath -Delimiter ';')) {
    if ($institution.uai -and $institution.coordonnees) {
        $directoryByUai[$institution.uai] = $institution.coordonnees
    }
}

$rules = @(
    [pscustomobject]@{
        Category = $pharmaCategory
        Relevance = 'Directe'
        Pattern = '(?i)pharmaceut|pharmac|m[\u00e9]dicament|produits? de sant[\u00e9]'
    },
    [pscustomobject]@{
        Category = 'Biotechnologies et analyses biologiques'
        Relevance = 'Directe'
        Pattern = '(?i)biotechn|bioanal|bioqual|biochim|biologie m[\u00e9]dicale|biologie mol[\u00e9]culaire|microbiolog|g[\u00e9]nie biologique|g[\u00e9]nie biotechnolog'
    },
    [pscustomobject]@{
        Category = 'Chimie et sciences analytiques'
        Relevance = 'Directe'
        Pattern = '(?i)\bchimie\b|chimie analytique|formulation'
    },
    [pscustomobject]@{
        Category = $processCategory
        Relevance = 'Directe'
        Pattern = '(?i)pilotage des proc[\u00e9]d[\u00e9]s|g[\u00e9]nie chimique|contr[\u00f4]le industriel|r[\u00e9]gulation automatique|g[\u00e9]nie industriel et maintenance|maintenance des syst[\u00e8]mes - option a'
    },
    [pscustomobject]@{
        Category = $qualityCategory
        Relevance = $transferable
        Pattern = '(?i)bioqualit[\u00e9]|qualit[\u00e9], logistique industrielle|packaging, emballage|mesures physiques|hygi[\u00e8]ne s[\u00e9]curit[\u00e9]|hse'
    },
    [pscustomobject]@{
        Category = $accessCategory
        Relevance = $transferable
        Pattern = '(?i)\bpass\b|parcours d['']acc[\u00e8]s sp[\u00e9]cifique sant[\u00e9]|\blas\b|acc[\u00e8]s sant[\u00e9]'
    },
    [pscustomobject]@{
        Category = $lifeScienceCategory
        Relevance = $transferable
        Pattern = '(?i)sciences de la vie|sciences du vivant|biologie cellulaire|biologie g[\u00e9]n[\u00e9]rale|biologie et ing[\u00e9]nierie|biologie-sant[\u00e9]|biologie sant[\u00e9]|biosant[\u00e9]'
    }
)

$excludePattern = '(?i)professorat|professeur|enseignement|kin[\u00e9]|ecologie|g[\u00e9]ologie|g[\u00e9]oscience|v[\u00e9]t[\u00e9]rinaire|sciences de l['']environnement|environnement et [e\u00e9]cotechnologies|di[e\u00e9]t[e\u00e9]tique|nutrition|staps|sciences du sport|parcours agro|agronomie|agronomique'
$records = [System.Collections.Generic.List[object]]::new()

foreach ($offer in (Import-Csv -LiteralPath $parcoursupPath -Delimiter ';')) {
    $searchText = @(
        $offer.lib_for_voe_ins,
        $offer.form_lib_voe_acc,
        $offer.fil_lib_voe_acc,
        $offer.detail_forma,
        $offer.detail_forma2
    ) -join ' '

    $matchedRule = $null
    foreach ($rule in $rules) {
        if ($searchText -match $rule.Pattern) {
            $matchedRule = $rule
            break
        }
    }
    if (-not $matchedRule) {
        continue
    }

    if ($searchText -match $excludePattern -and $matchedRule.Category -in @($lifeScienceCategory, $accessCategory)) {
        continue
    }

    $coordinates = $offer.g_olocalisation_des_formations
    $coordinatesSource = 'Parcoursup 2025'
    if (-not $coordinates -and $offer.cod_uai -and $directoryByUai.ContainsKey($offer.cod_uai)) {
        $coordinates = $directoryByUai[$offer.cod_uai]
        $coordinatesSource = 'Repertoire SIES des etablissements'
    }

    $latitude = ''
    $longitude = ''
    if ($coordinates -match '^\s*(-?\d+(?:[.,]\d+)?)\s*,\s*(-?\d+(?:[.,]\d+)?)\s*$') {
        $latitude = $Matches[1].Replace(',', '.')
        $longitude = $Matches[2].Replace(',', '.')
    }
    else {
        $coordinatesSource = ''
    }

    $relevance = $matchedRule.Relevance
    if ($offer.lib_for_voe_ins -match '(?i)^BTS - Agricole') {
        $relevance = $transferable
    }

    $records.Add([pscustomobject][ordered]@{
        annee = $offer.session
        categorie = $matchedRule.Category
        pertinence_pharma = $relevance
        formation = $offer.lib_for_voe_ins
        intitule_admission = $offer.form_lib_voe_acc
        parcours = $offer.detail_forma
        filiere = $offer.fili
        etablissement = $offer.g_ea_lib_vx
        code_uai = $offer.cod_uai
        ville = $offer.ville_etab
        code_departement = $offer.dep
        departement = $offer.dep_lib
        region = $offer.region_etab_aff
        latitude = $latitude
        longitude = $longitude
        source_coordonnees = $coordinatesSource
        url_source_coordonnees = if ($coordinatesSource -eq 'Parcoursup 2025') {
            'https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/'
        }
        elseif ($coordinatesSource) {
            'https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-principaux-etablissements-enseignement-superieur/'
        }
        else {
            ''
        }
        code_offre_parcoursup = $offer.cod_aff_form
        statut_etablissement = $offer.contrat_etab
        source = 'Parcoursup 2025; repertoire SIES des etablissements'
        url_source = 'https://data.enseignementsup-recherche.gouv.fr/explore/dataset/fr-esr-parcoursup/'
    })
}

if ($records.Count -eq 0) {
    throw 'No relevant Parcoursup offers matched the configured training categories.'
}

$records |
    Sort-Object region, departement, ville, formation, etablissement, code_offre_parcoursup |
    Export-Csv -LiteralPath $outputPath -Delimiter ';' -NoTypeInformation -Encoding UTF8

$located = @($records | Where-Object { $_.latitude -and $_.longitude }).Count
Write-Output "Wrote $($records.Count) training offers to $outputPath; $located have map coordinates."
