<?php

namespace App\Console\Commands;

use App\Services\ReleveHistoriqueImportService;
use Illuminate\Console\Command;

class ImportRelevesHistoriques extends Command
{
    /**
     * The name and signature of the console command.
     */
    protected $signature = 'import:releves-historiques
        {--dry-run : Analyse et affiche ce qui serait fait, sans écrire en base}
        {--path= : Dossier contenant releves_mensuels_historiques.csv (par défaut storage/app/imports/historique)}';

    /**
     * The console command description.
     */
    protected $description = 'Importe les totaux mensuels réels (CA, charges, revenu propriétaire, commission) depuis releves_mensuels_historiques.csv';

    public function handle(): int
    {
        $path = $this->option('path') ?: storage_path('app/imports/historique');
        $dryRun = (bool) $this->option('dry-run');

        $service = new ReleveHistoriqueImportService($path);

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
        $this->table(['', 'Créés', 'Mis à jour'], [
            ['Relevés mensuels', $resultat['releves_crees'], $resultat['releves_mis_a_jour']],
        ]);

        return self::SUCCESS;
    }

    private function apercu(array $analyse, bool $resume = true): void
    {
        $nbImportables = count($analyse['releves_importables']);
        $nbInconnu = count($analyse['releves_appartement_inconnu']);
        $nbAVerifier = count($analyse['releves_a_verifier']);

        $this->info($resume ? '=== Aperçu (dry-run) ===' : '=== Aperçu avant import réel ===');
        $this->newLine();
        $this->line("Relevés mensuels importables    : <fg=green>{$nbImportables}</>");
        $this->line("Appartement introuvable          : <fg=yellow>{$nbInconnu}</> -- mis de côté");
        $this->line("Lignes à vérifier manuellement    : <fg=yellow>{$nbAVerifier}</> -- non importées");
        $this->newLine();

        if ($nbImportables > 0) {
            $this->line('--- Détail : relevés importables (appartement, mois, CA, charges, revenu propriétaire, commission) ---');
            $rows = array_map(fn ($r) => [
                $r['appartement_nom'].' ('.$r['appartement_code'].')',
                $r['mois'],
                number_format($r['ca'], 2),
                number_format($r['charges'], 2),
                number_format($r['revenu_proprietaire'], 2),
                number_format($r['notre_commission'], 2),
            ], $analyse['releves_importables']);
            $this->table(['Appartement', 'Mois', 'CA', 'Charges', 'Revenu propriétaire', 'Commission'], $rows);
        }

        if ($nbInconnu > 0) {
            $this->newLine();
            $this->line('--- Mis de côté : appartement introuvable ---');
            $codes = array_unique(array_map(fn ($r) => $r['code_appartement'], $analyse['releves_appartement_inconnu']));
            $this->line('Code(s) concerné(s) : '.implode(', ', $codes));
        }

        if ($nbAVerifier > 0) {
            $this->newLine();
            $this->line('--- Lignes à vérifier manuellement ---');
            $rows = array_map(fn ($e) => [
                $e['row']['mois'] ?? '(vide)',
                $e['row']['code_appartement'] ?? '(vide)',
                implode('; ', $e['raisons']),
            ], $analyse['releves_a_verifier']);
            $this->table(['Mois', 'Code', 'Raison'], $rows);
        }
    }
}
