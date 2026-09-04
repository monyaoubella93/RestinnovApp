<?php

namespace App\Services;

use App\Models\Appartement;
use App\Models\ReleveMensuelHistorique;
use App\Services\Concerns\NormaliseCodeAppartement;
use Carbon\Carbon;

/**
 * Import of releves_mensuels_historiques.csv -- the real monthly CA/
 * charges/revenu_proprietaire/notre_commission totals per appartement,
 * extracted from the pre-app era's "Summaries" spreadsheet. Distinct from
 * HistoriqueImportService (séjours/voyageurs/propriétaires): this file
 * carries aggregated monthly totals, not individual bookings, and it's
 * imported *after* the appartements already exist -- codes are matched
 * against Appartement::code_externe already in the database, not against
 * a proprietaires CSV.
 *
 * Idempotent via updateOrCreate keyed on (appartement_id, mois): re-running
 * the command (e.g. after a correction in the source file) updates the
 * figures in place rather than creating duplicates or silently skipping.
 */
class ReleveHistoriqueImportService
{
    use NormaliseCodeAppartement;

    public function __construct(private readonly string $importPath) {}

    /**
     * Parses the CSV and classifies every row, without touching the
     * database. Used by both --dry-run and the real import.
     */
    public function analyser(): array
    {
        $rows = $this->lireCsv('releves_mensuels_historiques.csv');

        $appartementsParCode = [];
        foreach (Appartement::query()->whereNotNull('code_externe')->get(['id', 'nom', 'code_externe']) as $appartement) {
            $appartementsParCode[$this->normaliserCode($appartement->code_externe)] = $appartement;
        }

        $importables = [];
        $appartementInconnu = [];
        $aVerifier = [];

        foreach ($rows as $row) {
            $codeBrut = trim($row['code_appartement'] ?? '');
            $mois = $this->parserMois($row['mois'] ?? '');

            if ($codeBrut === '' || $mois === null) {
                $aVerifier[] = ['row' => $row, 'raisons' => ['mois ou code appartement manquant/illisible']];

                continue;
            }

            if (str_starts_with(strtoupper($codeBrut), 'CODE_A_VERIFIER')) {
                $aVerifier[] = ['row' => $row, 'raisons' => ['code appartement marqué "CODE_A_VERIFIER_..." dans la source']];

                continue;
            }

            $codeNorm = $this->normaliserCode($codeBrut);
            if (! isset($appartementsParCode[$codeNorm])) {
                $appartementInconnu[] = $row;

                continue;
            }

            $appartement = $appartementsParCode[$codeNorm];

            $importables[] = [
                'appartement_id' => $appartement->id,
                'appartement_nom' => $appartement->nom,
                'appartement_code' => $appartement->code_externe,
                'mois' => $mois,
                'ca' => $this->parserMontant($row['ca'] ?? ''),
                'charges' => $this->parserMontant($row['charges'] ?? ''),
                'revenu_proprietaire' => $this->parserMontant($row['revenu_proprietaire'] ?? ''),
                'notre_commission' => $this->parserMontant($row['notre_commission'] ?? ''),
            ];
        }

        return [
            'releves_importables' => $importables,
            'releves_appartement_inconnu' => $appartementInconnu,
            'releves_a_verifier' => $aVerifier,
        ];
    }

    /**
     * Applies the import for real: one ReleveMensuelHistorique row per
     * importable (appartement, mois) pair, created or updated in place.
     */
    public function importer(): array
    {
        $analyse = $this->analyser();

        $resultat = ['releves_crees' => 0, 'releves_mis_a_jour' => 0];

        foreach ($analyse['releves_importables'] as $row) {
            $releve = ReleveMensuelHistorique::updateOrCreate(
                ['appartement_id' => $row['appartement_id'], 'mois' => $row['mois']],
                [
                    'ca' => $row['ca'],
                    'charges' => $row['charges'],
                    'revenu_proprietaire' => $row['revenu_proprietaire'],
                    'notre_commission' => $row['notre_commission'],
                ],
            );

            if ($releve->wasRecentlyCreated) {
                $resultat['releves_crees']++;
            } else {
                $resultat['releves_mis_a_jour']++;
            }
        }

        return $resultat;
    }

    // ------------------------------------------------------------------
    // Parsing
    // ------------------------------------------------------------------

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

    /**
     * "January 2025" -> "2025-01". Returns null when the value doesn't
     * parse as a full month name + year, so the row is set aside for
     * manual review rather than silently dropped or misdated.
     */
    private function parserMois(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        try {
            return Carbon::createFromFormat('F Y', $value)->format('Y-m');
        } catch (\Throwable) {
            return null;
        }
    }

    /** Blank/unparseable cells (several rows in the source have empty ca/charges/commission columns) count as 0, never null. */
    private function parserMontant(string $value): float
    {
        $value = trim($value);

        return $value === '' ? 0.0 : (float) $value;
    }
}
