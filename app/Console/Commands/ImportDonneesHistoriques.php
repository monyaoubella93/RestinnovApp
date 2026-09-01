<?php

namespace App\Console\Commands;

use App\Services\HistoriqueImportService;
use Illuminate\Console\Command;

class ImportDonneesHistoriques extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'import:donnees-historiques
        {--dry-run : Analyse et affiche ce qui serait fait, sans écrire en base}
        {--path= : Dossier contenant les 3 CSV (par défaut storage/app/imports/historique)}';

    /**
     * The console command description.
     */
    protected $description = "Importe les séjours/voyageurs/appartements/propriétaires historiques depuis les 3 fichiers CSV (proprietaires_import.csv, sejours_import.csv, voyageurs_import.csv)";

    public function handle(): int
    {
        $path = $this->option('path') ?: storage_path('app/imports/historique');
        $dryRun = (bool) $this->option('dry-run');

        $service = new HistoriqueImportService($path);

        if ($dryRun) {
            $this->apercu($service->analyser());

            return self::SUCCESS;
        }

        $analyse = $service->analyser();
        $this->apercu($analyse, resume: false);

        if (! $this->confirm('Procéder à l\'import réel avec ces chiffres ?', false)) {
            $this->warn('Import annulé.');

            return self::SUCCESS;
        }

        $resultat = $service->importer();

        $this->newLine();
        $this->info('Import terminé.');
        $this->table(['', 'Créés', 'Déjà existants'], [
            ['Propriétaires', $resultat['proprietaires_crees'], '—'],
            ['Appartements', $resultat['appartements_crees'], $resultat['appartements_existants']],
            ['Séjours', $resultat['sejours_crees'], $resultat['sejours_existants']],
            ['Voyageurs', $resultat['voyageurs_crees'], '—'],
        ]);

        return self::SUCCESS;
    }

    private function apercu(array $analyse, bool $resume = true): void
    {
        $nbAppartements = count($analyse['proprietaires']);
        $nbImportables = count($analyse['sejours_importables']);
        $nbInconnu = count($analyse['sejours_appartement_inconnu']);
        $nbAVerifier = count($analyse['sejours_a_verifier']);
        $nbVoyageurs = 0;
        foreach ($analyse['sejours_importables'] as $s) {
            $nbVoyageurs += count($analyse['voyageurs_par_sejour'][$s['sejour_ref']] ?? []);
        }

        $this->info($resume ? '=== Aperçu (dry-run) ===' : '=== Aperçu avant import réel ===');
        $this->newLine();
        $this->line("Appartements (depuis proprietaires_import.csv) : <fg=green>{$nbAppartements}</> à créer/vérifier");
        $this->line("Séjours importables automatiquement           : <fg=green>{$nbImportables}</>");
        $this->line("Voyageurs liés à ces séjours importables      : <fg=green>{$nbVoyageurs}</>");
        $this->line("Séjours pour un appartement inconnu (7HM)     : <fg=yellow>{$nbInconnu}</> -- mis de côté, propriétaire à confirmer");
        $this->line("Séjours à vérifier manuellement                : <fg=yellow>{$nbAVerifier}</> -- non importés");
        $this->newLine();

        $this->line('--- Détail : appartements (code -> propriétaire, commission, adresse) ---');
        $rows = array_map(fn ($p) => [
            $p['code_externe'],
            $p['nom_proprietaire'] ?? '(aucun / inconnu)',
            $p['taux_commission_pct'].'%',
            $p['adresse'],
        ], $analyse['proprietaires']);
        $this->table(['Code', 'Propriétaire', 'Commission', 'Adresse'], $rows);

        if ($nbInconnu > 0) {
            $this->newLine();
            $this->line('--- Séjours mis de côté : appartement inconnu ---');
            $codes = array_unique(array_map(fn ($r) => $r['code_appartement'], $analyse['sejours_appartement_inconnu']));
            $this->line('Code(s) concerné(s) : '.implode(', ', $codes));
            $refs = array_map(fn ($r) => $r['sejour_ref'], $analyse['sejours_appartement_inconnu']);
            $this->line('Séjours (référence source) : '.implode(', ', $refs));
        }

        if ($nbAVerifier > 0) {
            $this->newLine();
            $this->line('--- Séjours à vérifier manuellement ---');
            $rows = array_map(fn ($e) => [
                $e['row']['sejour_ref'],
                $e['row']['code_appartement'],
                $e['row']['date_arrivee']?->toDateString() ?? '(vide)',
                $e['row']['date_depart']?->toDateString() ?? '(vide)',
                implode('; ', $e['raisons']),
            ], $analyse['sejours_a_verifier']);
            $this->table(['Réf.', 'Code', 'Arrivée', 'Départ', 'Raison'], $rows);
        }
    }
}
