<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChecklistModele;
use App\Models\ChecklistModeleItem;
use App\Models\MissionMenage;
use App\Models\ProduitMenageCatalogue;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class HistoriqueMenageManagerTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(array $overrides = []): Appartement
    {
        return Appartement::create(array_merge([
            'nom' => 'Loft Bastille',
            'adresse' => '12 rue de la Roquette',
            'statut' => 'disponible',
        ], $overrides));
    }

    private function conformeMission(Appartement $appartement, string $dateDepart, string $nomVoyageur = 'Jean Dupont'): MissionMenage
    {
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => date('Y-m-d', strtotime($dateDepart.' -4 days')),
            'date_depart' => $dateDepart,
            'nom_voyageur' => $nomVoyageur,
        ]);
        $this->patchJson("/api/sejours/{$sejour->id}/checkout")->assertOk();
        $mission = MissionMenage::where('sejour_id', $sejour->id)->firstOrFail();
        $mission->update(['statut' => MissionMenage::STATUT_CONFORME, 'frais_forfait' => 50]);

        return $mission;
    }

    public function test_it_lists_conforme_missions_across_every_appartement_most_recent_first(): void
    {
        $appartement1 = $this->appartement(['nom' => 'Loft Bastille']);
        $appartement2 = $this->appartement(['nom' => 'Zenith', 'adresse' => 'B']);

        $this->conformeMission($appartement1, '2026-01-05', 'Jean Dupont');
        $this->conformeMission($appartement2, '2026-02-05', 'Marie Curie');

        $response = $this->getJson('/api/mission-menages/historique');

        $response->assertOk();
        $response->assertJsonCount(2);
        $response->assertJsonPath('0.sejour.nom_voyageur', 'Marie Curie');
        $response->assertJsonPath('0.appartement.nom', 'Zenith');
        $response->assertJsonPath('1.sejour.nom_voyageur', 'Jean Dupont');
        $response->assertJsonPath('1.appartement.nom', 'Loft Bastille');
    }

    public function test_it_excludes_missions_not_yet_conforme(): void
    {
        $appartement = $this->appartement();
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        $this->patchJson("/api/sejours/{$sejour->id}/checkout")->assertOk();
        // Left as a_faire -- never marked conforme.

        $response = $this->getJson('/api/mission-menages/historique');

        $response->assertOk();
        $response->assertJsonCount(0);
    }

    public function test_it_filters_by_appartement_id(): void
    {
        $appartement1 = $this->appartement(['nom' => 'Loft Bastille']);
        $appartement2 = $this->appartement(['nom' => 'Zenith', 'adresse' => 'B']);

        $this->conformeMission($appartement1, '2026-01-05');
        $this->conformeMission($appartement2, '2026-02-05');

        $response = $this->getJson("/api/mission-menages/historique?appartement_id={$appartement1->id}");

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.appartement.nom', 'Loft Bastille');
    }

    public function test_it_filters_by_date_range_on_the_sejour_checkout_date(): void
    {
        $appartement = $this->appartement();
        $this->conformeMission($appartement, '2026-01-05', 'Ancien');
        $this->conformeMission($appartement, '2026-06-05', 'Recent');

        $response = $this->getJson('/api/mission-menages/historique?date_debut=2026-03-01&date_fin=2026-12-31');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.sejour.nom_voyageur', 'Recent');
    }

    public function test_it_includes_checklist_and_produit_detail_with_photos_and_frais_total(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create([
            'checklist_modele_id' => $standard->id,
            'libelle' => "Passer l'aspirateur",
            'photo_url' => 'checklist-modele-items/exemple.jpg',
            'ordre' => 0,
        ]);

        $appartement = $this->appartement();
        $appartement->checklistModeles()->sync([$standard->id]);

        $produit = ProduitMenageCatalogue::create([
            'nom' => 'Javel',
            'prix' => 12.5,
            'photo_url' => 'produits-catalogue/javel.jpg',
            'actif' => true,
        ]);

        $mission = $this->conformeMission($appartement, '2026-01-05');
        $mission->produits()->attach($produit->id, ['type_utilisation' => 'rachete', 'prix_paye' => 12.5]);

        $response = $this->getJson('/api/mission-menages/historique');

        $response->assertOk();
        $response->assertJsonPath('0.checklist_modeles_utilises', ['Standard']);
        $response->assertJsonPath('0.checklist_items.0.libelle', "Passer l'aspirateur");
        $response->assertJsonPath('0.checklist_items.0.photo_reference_url', 'checklist-modele-items/exemple.jpg');
        $response->assertJsonPath('0.produits.0.nom', 'Javel');
        $response->assertJsonPath('0.produits.0.photo_url', 'produits-catalogue/javel.jpg');
        $response->assertJsonPath('0.frais_forfait', 50);
        $response->assertJsonPath('0.frais_produits_total', 12.5);
        $response->assertJsonPath('0.frais_total', 62.5);
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $this->actingAsMenage();

        $response = $this->getJson('/api/mission-menages/historique');

        $response->assertStatus(403);
    }

    public function test_it_is_forbidden_for_a_maintenance_account(): void
    {
        $this->actingAsMaintenance();

        $response = $this->getJson('/api/mission-menages/historique');

        $response->assertStatus(403);
    }
}
