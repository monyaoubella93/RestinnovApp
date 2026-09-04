<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ReleveMensuelHistorique;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ImportRelevesHistoriquesTest extends TestCase
{
    use RefreshDatabase;

    private ?string $importDir = null;

    protected function tearDown(): void
    {
        if ($this->importDir && is_dir($this->importDir)) {
            array_map('unlink', glob($this->importDir.'/*'));
            rmdir($this->importDir);
        }

        parent::tearDown();
    }

    private function ecrireCsv(string $contenu): string
    {
        $this->importDir = sys_get_temp_dir().'/releves-historiques-test-'.uniqid();
        mkdir($this->importDir);
        file_put_contents($this->importDir.'/releves_mensuels_historiques.csv', $contenu);

        return $this->importDir;
    }

    private function csvDeBase(): string
    {
        return <<<CSV
        mois,code_appartement,ca,charges,revenu_proprietaire,notre_commission
        January 2025,ADRAR2,10987.02,2479.4,5650.99,2856.63
        January 2025,CODE_A_VERIFIER_20240301,2192.34,0.0,1797.72,394.62
        January 2025,INCONNU99,100,10,80,10
        February 2025,ISLGH25,,,0,
        CSV;
    }

    public function test_dry_run_does_not_write_to_the_database(): void
    {
        Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ADRAR2']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--dry-run' => true, '--path' => $path])
            ->assertExitCode(0);

        $this->assertDatabaseCount('releves_mensuels_historiques', 0);
    }

    public function test_real_import_creates_a_releve_row_for_a_matching_appartement(): void
    {
        $appartement = Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ADRAR2']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        $this->assertDatabaseHas('releves_mensuels_historiques', [
            'appartement_id' => $appartement->id,
            'mois' => '2025-01',
            'ca' => 10987.02,
            'charges' => 2479.40,
            'revenu_proprietaire' => 5650.99,
            'notre_commission' => 2856.63,
        ]);
    }

    public function test_import_matches_the_appartement_code_ignoring_space_and_case_differences(): void
    {
        // Source CSV says "ADRAR2" (no space); the appartement was created
        // with a space, same as "Adrar 2" vs "Adrar2" in the prompt example.
        $appartement = Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'Adrar 2']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        $this->assertDatabaseHas('releves_mensuels_historiques', [
            'appartement_id' => $appartement->id,
            'mois' => '2025-01',
        ]);
    }

    public function test_a_code_a_verifier_row_is_set_aside_and_never_imported(): void
    {
        Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ADRAR2']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        $this->assertDatabaseCount('releves_mensuels_historiques', 1);
        $this->assertDatabaseMissing('releves_mensuels_historiques', ['ca' => 2192.34]);
    }

    public function test_a_row_with_no_matching_appartement_is_set_aside(): void
    {
        Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ADRAR2']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        $this->assertDatabaseMissing('releves_mensuels_historiques', ['ca' => 100]);
    }

    public function test_blank_numeric_cells_are_imported_as_zero(): void
    {
        Appartement::create(['nom' => 'ISLGH25', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ISLGH25']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        $this->assertDatabaseHas('releves_mensuels_historiques', [
            'mois' => '2025-02',
            'ca' => 0,
            'charges' => 0,
            'revenu_proprietaire' => 0,
            'notre_commission' => 0,
        ]);
    }

    public function test_declining_the_confirmation_does_not_import_anything(): void
    {
        Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ADRAR2']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'no')
            ->assertExitCode(0);

        $this->assertDatabaseCount('releves_mensuels_historiques', 0);
    }

    public function test_re_running_the_import_updates_the_existing_row_instead_of_duplicating(): void
    {
        $appartement = Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ADRAR2']);
        $path = $this->ecrireCsv($this->csvDeBase());

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        // The source file is corrected and re-imported.
        file_put_contents($path.'/releves_mensuels_historiques.csv', <<<CSV
        mois,code_appartement,ca,charges,revenu_proprietaire,notre_commission
        January 2025,ADRAR2,11000.00,2500.00,5700.00,2800.00
        CSV);

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        $this->assertDatabaseCount('releves_mensuels_historiques', 1);
        $this->assertDatabaseHas('releves_mensuels_historiques', [
            'appartement_id' => $appartement->id,
            'mois' => '2025-01',
            'ca' => 11000.00,
        ]);
    }

    public function test_parses_the_full_month_name_and_year_into_y_m_format(): void
    {
        Appartement::create(['nom' => 'Adrar 2', 'adresse' => 'A', 'statut' => 'disponible', 'code_externe' => 'ADRAR2']);
        $path = $this->ecrireCsv(<<<CSV
        mois,code_appartement,ca,charges,revenu_proprietaire,notre_commission
        August 2025,ADRAR2,20622.63,1141.0,14119.75,5361.88
        CSV);

        $this->artisan('import:releves-historiques', ['--path' => $path])
            ->expectsConfirmation('Procéder à l\'import réel avec ces chiffres ?', 'yes')
            ->assertExitCode(0);

        $this->assertDatabaseHas('releves_mensuels_historiques', ['mois' => '2025-08']);
    }
}
