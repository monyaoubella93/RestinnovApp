<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\ProduitMenageSignale;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProduitSignaleTest extends TestCase
{
    use RefreshDatabase;

    private function missionMenage(): MissionMenage
    {
        $appartement = Appartement::create(['nom' => 'Loft', 'adresse' => 'A', 'statut' => 'disponible']);
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-02',
            'nom_voyageur' => 'X',
        ]);

        return MissionMenage::create([
            'sejour_id' => $sejour->id,
            'statut' => 'a_faire',
        ]);
    }

    private function produitSignale(MissionMenage $mission, string $statut = 'en_attente'): ProduitMenageSignale
    {
        return ProduitMenageSignale::create([
            'mission_menage_id' => $mission->id,
            'photo_url' => 'produits-signales/fake.jpg',
            'note' => 'Trouvé sur le terrain',
            'statut' => $statut,
        ]);
    }

    public function test_it_lists_produits_signales_filtered_by_statut(): void
    {
        $mission = $this->missionMenage();
        $this->produitSignale($mission, 'en_attente');
        $this->produitSignale($mission, 'valide');

        $response = $this->getJson('/api/produits-signales?statut=en_attente');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.statut', 'en_attente');
    }

    public function test_it_lists_all_produits_signales_without_filter(): void
    {
        $mission = $this->missionMenage();
        $this->produitSignale($mission, 'en_attente');
        $this->produitSignale($mission, 'valide');

        $response = $this->getJson('/api/produits-signales');

        $response->assertOk();
        $response->assertJsonCount(2);
    }

    public function test_it_validates_a_produit_signale_and_attaches_it_to_the_mission(): void
    {
        $mission = $this->missionMenage();
        $signale = $this->produitSignale($mission);

        $response = $this->patchJson("/api/produits-signales/{$signale->id}/valider", [
            'nom' => 'Éponge magique',
            'prix' => 15,
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'valide');
        $response->assertJsonPath('produit_catalogue.nom', 'Éponge magique');
        $response->assertJsonPath('produit_catalogue.prix', '15.00');

        $this->assertDatabaseHas('produits_menage_catalogue', [
            'nom' => 'Éponge magique',
            'prix' => 15,
            'actif' => true,
        ]);

        $produitCatalogueId = $response->json('produit_catalogue.id');
        $this->assertDatabaseHas('mission_menage_produits', [
            'mission_menage_id' => $mission->id,
            'produit_catalogue_id' => $produitCatalogueId,
            'type_utilisation' => 'rachete',
            'prix_paye' => 15,
        ]);
        $this->assertDatabaseHas('produits_menage_signales', [
            'id' => $signale->id,
            'statut' => 'valide',
            'produit_catalogue_id' => $produitCatalogueId,
        ]);
    }

    public function test_validating_a_produit_signale_carries_its_photo_over_to_the_new_catalogue_entry(): void
    {
        $mission = $this->missionMenage();
        $signale = $this->produitSignale($mission);

        $response = $this->patchJson("/api/produits-signales/{$signale->id}/valider", [
            'nom' => 'Éponge magique',
            'prix' => 15,
        ]);

        $response->assertOk();
        $response->assertJsonPath('produit_catalogue.photo_url', 'produits-signales/fake.jpg');
        $this->assertDatabaseHas('produits_menage_catalogue', [
            'nom' => 'Éponge magique',
            'photo_url' => 'produits-signales/fake.jpg',
        ]);
    }

    public function test_it_rejects_a_produit_signale(): void
    {
        $mission = $this->missionMenage();
        $signale = $this->produitSignale($mission);

        $response = $this->patchJson("/api/produits-signales/{$signale->id}/rejeter");

        $response->assertOk();
        $response->assertJsonPath('statut', 'rejete');
        $this->assertDatabaseHas('produits_menage_signales', [
            'id' => $signale->id,
            'statut' => 'rejete',
        ]);
    }

    public function test_it_cannot_validate_an_already_processed_produit_signale(): void
    {
        $mission = $this->missionMenage();
        $signale = $this->produitSignale($mission, 'valide');

        $response = $this->patchJson("/api/produits-signales/{$signale->id}/valider", [
            'nom' => 'X',
            'prix' => 1,
        ]);

        $response->assertStatus(422);
    }

    public function test_it_cannot_reject_an_already_processed_produit_signale(): void
    {
        $mission = $this->missionMenage();
        $signale = $this->produitSignale($mission, 'rejete');

        $response = $this->patchJson("/api/produits-signales/{$signale->id}/rejeter");

        $response->assertStatus(422);
    }

    public function test_nom_and_prix_are_required_to_valider(): void
    {
        $mission = $this->missionMenage();
        $signale = $this->produitSignale($mission);

        $response = $this->patchJson("/api/produits-signales/{$signale->id}/valider", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['nom', 'prix']);
    }
}
