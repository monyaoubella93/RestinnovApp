<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\ProduitMenageCatalogue;
use App\Models\Sejour;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MissionMenageProduitsTest extends TestCase
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

    public function test_mission_menage_defaults_frais_forfait_to_80(): void
    {
        $mission = $this->missionMenage();

        $this->assertEquals(80, $mission->fresh()->frais_forfait);
    }

    public function test_it_updates_frais_forfait(): void
    {
        $mission = $this->missionMenage();

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/produits", [
            'frais_forfait' => 100,
        ]);

        $response->assertOk();
        $response->assertJsonPath('frais_forfait', '100.00');

        $this->assertDatabaseHas('mission_menages', [
            'id' => $mission->id,
            'frais_forfait' => 100,
        ]);
    }

    public function test_it_marks_a_produit_as_stock_existant_without_photo_or_prix(): void
    {
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::first();

        $response = $this->putJson("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            'type_utilisation' => 'stock_existant',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('mission_menage_produits', [
            'mission_menage_id' => $mission->id,
            'produit_catalogue_id' => $produit->id,
            'type_utilisation' => 'stock_existant',
            'photo_url' => null,
            'prix_paye' => null,
        ]);
    }

    public function test_stock_existant_does_not_count_in_the_frais_total(): void
    {
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::first();

        $this->putJson("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            'type_utilisation' => 'stock_existant',
        ])->assertOk();

        $this->assertEquals(0.0, $mission->fresh()->fraisProduitsTotal());
    }

    public function test_rachete_requires_a_photo_and_a_prix_paye(): void
    {
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::first();

        $response = $this->putJson("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            'type_utilisation' => 'rachete',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['photo', 'prix_paye']);
    }

    public function test_it_marks_a_produit_as_rachete_with_photo_and_real_prix_paye(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::first();
        $photo = UploadedFile::fake()->image('ticket-caisse.jpg');

        $response = $this->post("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            '_method' => 'PUT',
            'type_utilisation' => 'rachete',
            'photo' => $photo,
            'prix_paye' => 27.50,
        ], ['Accept' => 'application/json']);

        $response->assertOk();

        $photoUrl = $mission->fresh()->produits->firstWhere('id', $produit->id)->pivot->photo_url;
        $this->assertNotNull($photoUrl);
        Storage::disk('public')->assertExists($photoUrl);

        $this->assertDatabaseHas('mission_menage_produits', [
            'mission_menage_id' => $mission->id,
            'produit_catalogue_id' => $produit->id,
            'type_utilisation' => 'rachete',
            'prix_paye' => 27.50,
        ]);
    }

    public function test_rachete_counts_in_the_frais_total_with_its_real_prix_paye_not_the_catalogue_prix(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::create(['nom' => 'Nettoyant', 'prix' => 999, 'actif' => true]);

        $this->post("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            '_method' => 'PUT',
            'type_utilisation' => 'rachete',
            'photo' => UploadedFile::fake()->image('ticket-caisse.jpg'),
            'prix_paye' => 27.50,
        ], ['Accept' => 'application/json'])->assertOk();

        $this->assertEquals(27.50, $mission->fresh()->fraisProduitsTotal());
    }

    public function test_only_rachete_produits_count_when_mixed_with_stock_existant(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();
        $produitGratuit = ProduitMenageCatalogue::first();
        $produitPaye = ProduitMenageCatalogue::skip(1)->first();

        $this->putJson("/api/mission-menages/{$mission->id}/produits/{$produitGratuit->id}", [
            'type_utilisation' => 'stock_existant',
        ])->assertOk();

        $this->post("/api/mission-menages/{$mission->id}/produits/{$produitPaye->id}", [
            '_method' => 'PUT',
            'type_utilisation' => 'rachete',
            'photo' => UploadedFile::fake()->image('ticket-caisse.jpg'),
            'prix_paye' => 15,
        ], ['Accept' => 'application/json'])->assertOk();

        $this->assertEquals(15.0, $mission->fresh()->fraisProduitsTotal());
    }

    public function test_calling_it_again_for_the_same_produit_replaces_its_previous_usage(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::first();

        $this->post("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            '_method' => 'PUT',
            'type_utilisation' => 'rachete',
            'photo' => UploadedFile::fake()->image('ticket-caisse.jpg'),
            'prix_paye' => 15,
        ], ['Accept' => 'application/json'])->assertOk();

        $this->putJson("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            'type_utilisation' => 'stock_existant',
        ])->assertOk();

        $this->assertDatabaseHas('mission_menage_produits', [
            'mission_menage_id' => $mission->id,
            'produit_catalogue_id' => $produit->id,
            'type_utilisation' => 'stock_existant',
            'photo_url' => null,
            'prix_paye' => null,
        ]);
        $this->assertEquals(0.0, $mission->fresh()->fraisProduitsTotal());
    }

    public function test_type_utilisation_must_be_stock_existant_or_rachete(): void
    {
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::first();

        $response = $this->putJson("/api/mission-menages/{$mission->id}/produits/{$produit->id}", [
            'type_utilisation' => 'gratuit',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('type_utilisation');
    }

    public function test_detacher_produit_removes_it_from_the_mission_entirely(): void
    {
        $mission = $this->missionMenage();
        $produit = ProduitMenageCatalogue::first();
        $mission->produits()->attach($produit->id, ['type_utilisation' => 'stock_existant']);

        $response = $this->deleteJson("/api/mission-menages/{$mission->id}/produits/{$produit->id}");

        $response->assertOk();
        $this->assertDatabaseMissing('mission_menage_produits', [
            'mission_menage_id' => $mission->id,
            'produit_catalogue_id' => $produit->id,
        ]);
    }

    public function test_it_signals_a_product_with_photo_note_and_prix(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();
        $photo = UploadedFile::fake()->image('produit.jpg');

        $response = $this->post("/api/mission-menages/{$mission->id}/produits-signales", [
            'photo' => $photo,
            'note' => 'Trouvé sur le terrain',
            'prix' => 25.5,
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonPath('statut', 'en_attente');
        $response->assertJsonPath('note', 'Trouvé sur le terrain');
        $response->assertJsonPath('prix', '25.50');
        $response->assertJsonPath('photo_ticket_url', null);

        $photoUrl = $response->json('photo_url');
        $this->assertNotNull($photoUrl);
        Storage::disk('public')->assertExists($photoUrl);

        $this->assertDatabaseHas('produits_menage_signales', [
            'mission_menage_id' => $mission->id,
            'statut' => 'en_attente',
            'note' => 'Trouvé sur le terrain',
            'prix' => 25.5,
        ]);
    }

    public function test_it_signals_a_product_with_a_photo_ticket_instead_of_a_typed_prix(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();
        $photo = UploadedFile::fake()->image('produit.jpg');
        $photoTicket = UploadedFile::fake()->image('ticket-caisse.jpg');

        $response = $this->post("/api/mission-menages/{$mission->id}/produits-signales", [
            'photo' => $photo,
            'photo_ticket' => $photoTicket,
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonPath('prix', null);

        $photoTicketUrl = $response->json('photo_ticket_url');
        $this->assertNotNull($photoTicketUrl);
        Storage::disk('public')->assertExists($photoTicketUrl);
    }

    public function test_it_signals_a_product_without_note(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();
        $photo = UploadedFile::fake()->image('produit.jpg');

        $response = $this->post("/api/mission-menages/{$mission->id}/produits-signales", [
            'photo' => $photo,
            'prix' => 10,
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonPath('note', null);
    }

    public function test_photo_is_required_to_signal_a_product(): void
    {
        $mission = $this->missionMenage();

        $response = $this->postJson("/api/mission-menages/{$mission->id}/produits-signales", [
            'note' => 'Sans photo',
            'prix' => 10,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('photo');
    }

    public function test_prix_or_photo_ticket_is_required_to_signal_a_product(): void
    {
        Storage::fake('public');
        $mission = $this->missionMenage();

        $response = $this->post("/api/mission-menages/{$mission->id}/produits-signales", [
            'photo' => UploadedFile::fake()->image('produit.jpg'),
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('prix');
    }
}
