<?php

namespace App\Services;

use App\Models\Appartement;
use App\Models\Proprietaire;
use App\Models\Sejour;
use App\Models\Voyageur;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * One-off import of RestInnov's pre-digital historical bookings (three CSV
 * exports: proprietaires_import.csv, sejours_import.csv,
 * voyageurs_import.csv -- see storage/app/imports/historique/). Everything
 * here is idempotent: re-running the command after a partial or full import
 * never creates a duplicate, matched via the code_externe /
 * sejour_ref_externe columns added specifically for this.
 *
 * Three categories of sejour are deliberately never auto-imported (see
 * classifierSejours()): appartements with no owner/commission data at all
 * (code "7HM", absent from proprietaires_import.csv), and sejours whose
 * dates or appartement code are too unreliable to trust without a human
 * looking at the source booking first.
 */
class HistoriqueImportService
{
    public function __construct(private readonly string $importPath) {}

    /**
     * Parses the three CSVs and classifies every sejour, without touching
     * the database. Used by both --dry-run and the real import (the real
     * import runs this first, then only writes the "importables" bucket).
     */
    public function analyser(): array
    {
        $proprietaires = $this->lireProprietaires();
        $sejoursBruts = $this->lireSejours();
        $voyageursParSejour = $this->lireVoyageurs();

        $codesConnusNormalises = [];
        foreach ($proprietaires as $p) {
            $codesConnusNormalises[$this->normaliserCode($p['code_externe'])] = $p['code_externe'];
        }

        $importables = [];
        $appartementInconnu = [];
        $aVerifier = [];

        foreach ($sejoursBruts as $row) {
            $codeNorm = $this->normaliserCode($row['code_appartement']);

            if (! isset($codesConnusNormalises[$codeNorm])) {
                $appartementInconnu[] = $row;

                continue;
            }

            $raisons = $this->raisonsAVerifier($row);
            if (! empty($raisons)) {
                $aVerifier[] = ['row' => $row, 'raisons' => $raisons];

                continue;
            }

            $importables[] = $row + ['code_externe_resolu' => $codesConnusNormalises[$codeNorm]];
        }

        return [
            'proprietaires' => $proprietaires,
            'voyageurs_par_sejour' => $voyageursParSejour,
            'sejours_importables' => $importables,
            'sejours_appartement_inconnu' => $appartementInconnu,
            'sejours_a_verifier' => $aVerifier,
        ];
    }

    /**
     * Applies the import for real: creates missing appartements/
     * proprietaires, then every importable sejour and its voyageurs.
     * Returns counters distinguishing "created now" from "already existed"
     * so a re-run reports honestly instead of re-claiming credit.
     */
    public function importer(): array
    {
        $analyse = $this->analyser();

        $resultat = [
            'appartements_crees' => 0,
            'appartements_existants' => 0,
            'proprietaires_crees' => 0,
            'sejours_crees' => 0,
            'sejours_existants' => 0,
            'voyageurs_crees' => 0,
        ];

        $appartementIdParCode = [];

        foreach ($analyse['proprietaires'] as $p) {
            $proprietaireId = null;
            if ($p['nom_proprietaire'] !== null) {
                $proprietaire = Proprietaire::firstOrCreate(['nom' => $p['nom_proprietaire']]);
                if ($proprietaire->wasRecentlyCreated) {
                    $resultat['proprietaires_crees']++;
                }
                $proprietaireId = $proprietaire->id;
            }

            $appartement = Appartement::firstOrCreate(
                ['code_externe' => $p['code_externe']],
                [
                    'nom' => $p['code_externe'],
                    'adresse' => $p['adresse'],
                    'proprietaire_id' => $proprietaireId,
                    'mode_gestion' => Appartement::MODE_GESTION_MANDAT,
                    'taux_commission' => $p['taux_commission_pct'],
                    'statut' => Appartement::STATUT_DISPONIBLE,
                ],
            );

            if ($appartement->wasRecentlyCreated) {
                $resultat['appartements_crees']++;
            } else {
                $resultat['appartements_existants']++;
            }

            $appartementIdParCode[$p['code_externe']] = $appartement->id;
        }

        foreach ($analyse['sejours_importables'] as $row) {
            $appartementId = $appartementIdParCode[$row['code_externe_resolu']];
            $voyageurs = $analyse['voyageurs_par_sejour'][$row['sejour_ref']] ?? [];
            $principal = collect($voyageurs)->firstWhere('est_principal', true);

            DB::transaction(function () use ($row, $appartementId, $voyageurs, $principal, &$resultat) {
                $sejour = Sejour::firstOrCreate(
                    ['sejour_ref_externe' => $row['sejour_ref']],
                    [
                        'appartement_id' => $appartementId,
                        'date_arrivee' => $row['date_arrivee']->toDateString(),
                        'date_depart' => $row['date_depart']->toDateString(),
                        'nom_voyageur' => $principal['nom'] ?? 'Voyageur inconnu',
                        'statut' => Sejour::STATUT_TERMINE,
                        'plateforme_origine' => Sejour::PLATEFORME_AUTRE,
                        'montant_mad' => null,
                        'notes' => $this->construireNotes($row['issues_notes']),
                    ],
                );

                if (! $sejour->wasRecentlyCreated) {
                    $resultat['sejours_existants']++;

                    return;
                }

                $resultat['sejours_crees']++;

                foreach ($voyageurs as $v) {
                    Voyageur::create([
                        'sejour_id' => $sejour->id,
                        'nom' => $v['nom'],
                        'date_naissance' => $v['date_naissance']?->toDateString(),
                        'nationalite' => $v['nationalite'],
                        'numero_passeport' => $v['numero_passeport'],
                        'est_principal' => $v['est_principal'],
                        'type' => Voyageur::TYPE_ADULTE,
                    ]);
                    $resultat['voyageurs_crees']++;
                }
            });
        }

        return $resultat;
    }

    // ------------------------------------------------------------------
    // Parsing
    // ------------------------------------------------------------------

    private function lireProprietaires(): array
    {
        $rows = $this->lireCsv('proprietaires_import.csv');
        $out = [];

        foreach ($rows as $row) {
            $code = trim($row['code_appartement']);
            if ($code === '') {
                continue;
            }

            $nom = trim($row['nom_proprietaire'] ?? '');
            $nomProprietaire = ($nom === '' || $nom === '-') ? null : $nom;

            $adresse = trim(preg_replace('/^address:\s*/i', '', trim($row['adresse_si_connue'] ?? '')));
            if ($adresse === '') {
                $adresse = 'Adresse non renseignée';
            }

            $tauxRaw = trim($row['taux_commission'] ?? '');
            $tauxPct = $tauxRaw === '' ? 0.0 : round(((float) $tauxRaw) * 100, 2);

            $out[] = [
                'code_externe' => $code,
                'nom_proprietaire' => $nomProprietaire,
                'taux_commission_pct' => $tauxPct,
                'adresse' => $adresse,
            ];
        }

        return $out;
    }

    private function lireSejours(): array
    {
        $rows = $this->lireCsv('sejours_import.csv');
        $out = [];

        foreach ($rows as $row) {
            $ref = trim($row['sejour_ref'] ?? '');
            if ($ref === '') {
                continue;
            }

            [$arrivee, $arriveeAmbigue] = $this->parserDateFlexible($row['date_arrivee'] ?? '');
            [$depart, $departAmbigu] = $this->parserDateFlexible($row['date_depart'] ?? '');

            $out[] = [
                'sejour_ref' => $ref,
                'code_appartement' => $row['code_appartement'] ?? '',
                'date_arrivee' => $arrivee,
                'date_depart' => $depart,
                'date_arrivee_ambigue' => $arriveeAmbigue,
                'date_depart_ambigue' => $departAmbigu,
                'issues_notes' => trim($row['issues_notes'] ?? ''),
            ];
        }

        return $out;
    }

    /** @return array<string, array<int, array>> voyageur rows grouped by sejour_ref */
    private function lireVoyageurs(): array
    {
        $rows = $this->lireCsv('voyageurs_import.csv');
        $out = [];

        foreach ($rows as $row) {
            $ref = trim($row['sejour_ref'] ?? '');
            if ($ref === '') {
                continue;
            }

            $passeport = trim($row['passeport'] ?? '');
            if ($passeport === '-' || $passeport === '' || preg_match('/^\d(\.\d+)?E[+-]?\d+$/i', $passeport)) {
                $passeport = null;
            }

            $nationalite = trim($row['nationalite'] ?? '');
            $nationalite = ($nationalite === '' || $nationalite === '-') ? null : $nationalite;

            [$naissance] = $this->parserDateFlexible($row['date_naissance'] ?? '');

            $out[$ref][] = [
                'nom' => trim(preg_replace('/\s+/', ' ', $row['nom'] ?? '')),
                'date_naissance' => $naissance,
                'nationalite' => $nationalite,
                'numero_passeport' => $passeport,
                'est_principal' => strtoupper(trim($row['est_principal'] ?? '')) === 'TRUE',
            ];
        }

        return $out;
    }

    /** @return array<int, array<string, string>> */
    private function lireCsv(string $filename): array
    {
        $path = rtrim($this->importPath, '/').'/'.$filename;
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw new \RuntimeException("Impossible de lire le fichier : {$path}");
        }

        $header = fgetcsv($handle);
        $rows = [];
        while (($data = fgetcsv($handle)) !== false) {
            if (count($data) === 1 && $data[0] === null) {
                continue; // trailing blank line
            }
            $row = [];
            foreach ($header as $i => $col) {
                $row[$col] = $data[$i] ?? '';
            }
            $rows[] = $row;
        }
        fclose($handle);

        return $rows;
    }

    // ------------------------------------------------------------------
    // Classification / helpers
    // ------------------------------------------------------------------

    private function normaliserCode(string $code): string
    {
        return preg_replace('/\s+/', '', strtoupper(trim($code)));
    }

    /**
     * @return string[] empty when the sejour is safe to import automatically
     */
    private function raisonsAVerifier(array $row): array
    {
        $raisons = [];

        if (str_starts_with(strtoupper(trim($row['code_appartement'])), 'CODE_A_VERIFIER')) {
            $raisons[] = 'code appartement marqué "CODE_A_VERIFIER_..." dans la source';
        }

        if ($row['date_arrivee'] === null) {
            $raisons[] = 'date_arrivee manquante ou illisible';
        }
        if ($row['date_depart'] === null) {
            $raisons[] = 'date_depart manquante ou illisible';
        }
        if ($row['date_arrivee'] && $row['date_depart'] && $row['date_depart']->lte($row['date_arrivee'])) {
            $raisons[] = 'date_depart antérieure ou égale à date_arrivee';
        }
        if ($row['date_arrivee_ambigue'] || $row['date_depart_ambigue']) {
            $raisons[] = 'format de date ambigu (jour/mois mélangés dans le fichier source)';
        }

        return $raisons;
    }

    /**
     * Tries M/D/Y first (the format used by the vast majority of rows in
     * this export), falling back to D/M/Y only when the month position is
     * impossible (>12) -- flags the row as ambiguous whenever that fallback
     * actually had to fire, since it signals the source mixed formats.
     *
     * @return array{0: ?Carbon, 1: bool} [date, was_ambiguous]
     */
    private function parserDateFlexible(string $value): array
    {
        $value = trim($value);
        if ($value === '' || $value === '-') {
            return [null, false];
        }

        if (! preg_match('#^(\d{1,2})/(\d{1,2})/(\d{2,4})$#', $value, $m)) {
            return [null, false];
        }

        $a = (int) $m[1];
        $b = (int) $m[2];
        $y = (int) $m[3];
        if ($y < 100) {
            $y += 2000;
        }

        if ($a <= 12) {
            try {
                return [Carbon::createFromDate($y, $a, $b)->startOfDay(), false];
            } catch (\Throwable) {
                // fall through to D/M/Y attempt below
            }
        }

        if ($b <= 12) {
            try {
                return [Carbon::createFromDate($y, $b, $a)->startOfDay(), true];
            } catch (\Throwable) {
                // unparseable either way
            }
        }

        return [null, false];
    }

    /**
     * The source notes are stored as "text | text" where both halves are
     * usually identical (the export duplicated the same free-text column
     * twice) -- collapse that duplication rather than storing it twice.
     * Always appends a fixed note that the true booking platform is
     * unknown for this historical import (plateforme_origine defaults to
     * "autre").
     */
    private function construireNotes(string $issuesNotes): string
    {
        $note = 'Import historique : plateforme d\'origine réelle inconnue.';

        if ($issuesNotes === '') {
            return $note;
        }

        $parts = array_map('trim', explode('|', $issuesNotes));
        $unique = array_values(array_unique($parts));
        $texte = implode(' | ', $unique);

        return $texte."\n\n".$note;
    }
}
