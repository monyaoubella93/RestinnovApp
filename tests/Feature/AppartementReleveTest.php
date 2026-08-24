<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\FraisMaintenance;
use App\Models\MissionMenage;
use App\Models\ProduitMenageCatalogue;
use App\Models\Proprietaire;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppartementReleveTest extends TestCase
{
    use RefreshDatabase;

    private function proprietaire(): Proprietaire
    {
        return Proprietaire::create(['nom' => 'Karim Alaoui']);
    }

    public function test_it_computes_the_releve_for_a_mandat_appartement(): void
    {
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'proprietaire_id' => $this->proprietaire()->id,
            'mode_gestion' => 'mandat',
            'taux_commission' => 20,
        ]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-10',
            'date_depart' => '2026-08-15',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);

        $mission = MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'conforme', 'frais_forfait' => 80]);
        $produit = ProduitMenageCatalogue::create(['nom' => 'Javel', 'prix' => 20, 'actif' => true]);
        $mission->produits()->attach($produit->id, ['type_utilisation' => 'rachete', 'prix_paye' => 20]);

        FraisMaintenance::create(['sejour_id' => $sejour->id, 'description' => 'Réparation robinet', 'prix' => 100]);

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08");

        $response->assertOk();
        $response->assertJsonPath('revenus_bruts', 1000);
        $response->assertJsonPath('frais_menage_total', 100); // 80 forfait + 20 produit
        $response->assertJsonPath('frais_maintenance_total', 100);
        $response->assertJsonPath('resultat_net', 800); // 1000 - 100 - 100
        $response->assertJsonPath('montant_proprietaire', 640); // 800 * (1 - 20/100)
        $response->assertJsonPath('commission_restinnov', 160); // 800 - 640
        $response->assertJsonPath('appartement.proprietaire.nom', 'Karim Alaoui');
        $response->assertJsonCount(1, 'sejours');
    }

    public function test_it_computes_the_releve_for_a_sous_location_appartement_regardless_of_resultat(): void
    {
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'mode_gestion' => 'sous_location',
            'loyer_fixe_mensuel' => 4000,
        ]);

        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-10',
            'date_depart' => '2026-08-15',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08");

        $response->assertOk();
        $response->assertJsonPath('revenus_bruts', 1000);
        $response->assertJsonPath('resultat_net', 1000);
        // The owner is paid the fixed rent, not a share of resultat_net.
        $response->assertJsonPath('montant_proprietaire', 4000);
        $response->assertJsonPath('commission_restinnov', -3000);
    }

    public function test_it_returns_zeroed_amounts_for_a_month_with_no_sejour(): void
    {
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'mode_gestion' => 'mandat',
            'taux_commission' => 20,
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08");

        $response->assertOk();
        $response->assertJsonPath('revenus_bruts', 0);
        $response->assertJsonPath('frais_menage_total', 0);
        $response->assertJsonPath('frais_maintenance_total', 0);
        $response->assertJsonPath('resultat_net', 0);
        $response->assertJsonPath('montant_proprietaire', 0);
        $response->assertJsonPath('sejours', []);
    }

    public function test_a_sous_location_appartement_still_pays_the_fixed_rent_in_a_month_with_no_sejour(): void
    {
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'mode_gestion' => 'sous_location',
            'loyer_fixe_mensuel' => 4000,
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08");

        $response->assertOk();
        $response->assertJsonPath('revenus_bruts', 0);
        $response->assertJsonPath('montant_proprietaire', 4000);
    }

    public function test_a_sejour_only_overlapping_the_month_boundary_is_included(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        // Starts in July, ends in August -- overlaps August.
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-07-28',
            'date_depart' => '2026-08-03',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 500,
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08");

        $response->assertOk();
        $response->assertJsonPath('revenus_bruts', 500);
    }

    public function test_a_sejour_entirely_in_another_month_is_excluded(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-01',
            'date_depart' => '2026-09-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
            'montant_mad' => 500,
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08");

        $response->assertOk();
        $response->assertJsonPath('revenus_bruts', 0);
        $response->assertJsonPath('sejours', []);
    }

    public function test_mois_must_be_provided_in_y_m_format(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08-01");

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('mois');
    }

    public function test_releve_is_forbidden_for_a_menage_account(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $this->actingAsMenage();

        $response = $this->getJson("/api/appartements/{$appartement->id}/releve?mois=2026-08");

        $response->assertStatus(403);
    }

    public function test_it_downloads_a_pdf_releve(): void
    {
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'proprietaire_id' => $this->proprietaire()->id,
            'mode_gestion' => 'mandat',
            'taux_commission' => 20,
        ]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-10',
            'date_depart' => '2026-08-15',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'conforme', 'frais_forfait' => 80]);

        $response = $this->get("/api/appartements/{$appartement->id}/releve/pdf?mois=2026-08");

        $response->assertOk();
        $response->assertHeader('content-type', 'application/pdf');
        $this->assertNotEmpty($response->getContent());
    }

    public function test_pdf_mois_must_be_provided_in_y_m_format(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->get("/api/appartements/{$appartement->id}/releve/pdf?mois=2026-08-01");

        $response->assertStatus(422);
    }

    public function test_pdf_is_forbidden_for_a_menage_account(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $this->actingAsMenage();

        $response = $this->get("/api/appartements/{$appartement->id}/releve/pdf?mois=2026-08");

        $response->assertStatus(403);
    }
}
