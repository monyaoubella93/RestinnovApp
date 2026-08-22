<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SejourListingTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(string $nom): Appartement
    {
        return Appartement::create(['nom' => $nom, 'adresse' => 'A', 'statut' => 'disponible']);
    }

    private function sejour(array $overrides = []): Sejour
    {
        return Sejour::create(array_merge([
            'appartement_id' => $this->appartement('Loft Bastille')->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
            'plateforme_origine' => 'airbnb',
            'montant_mad' => 1000,
        ], $overrides));
    }

    public function test_it_returns_a_paginated_response_by_default(): void
    {
        $this->sejour();
        $this->sejour(['nom_voyageur' => 'Marie Curie']);

        $response = $this->getJson('/api/sejours');

        $response->assertOk();
        $response->assertJsonStructure(['data', 'current_page', 'last_page', 'per_page', 'total']);
        $response->assertJsonCount(2, 'data');
        $response->assertJsonPath('total', 2);
    }

    public function test_it_reports_the_voyageurs_count_per_sejour(): void
    {
        $sejour = $this->sejour();
        $sejour->voyageurs()->create(['nom' => 'Jean Dupont', 'est_principal' => true, 'type' => 'adulte']);
        $sejour->voyageurs()->create(['nom' => 'Petit Dupont', 'est_principal' => false, 'type' => 'enfant']);

        $response = $this->getJson('/api/sejours');

        $response->assertOk();
        $response->assertJsonPath('data.0.voyageurs_count', 2);
    }

    public function test_it_filters_by_search_on_voyageur_or_appartement_name(): void
    {
        $this->sejour(['nom_voyageur' => 'Jean Dupont']);
        $this->sejour([
            'nom_voyageur' => 'Marie Curie',
            'appartement_id' => $this->appartement('Zenith')->id,
        ]);

        $byVoyageur = $this->getJson('/api/sejours?search=Curie');
        $byVoyageur->assertOk();
        $byVoyageur->assertJsonCount(1, 'data');
        $byVoyageur->assertJsonPath('data.0.nom_voyageur', 'Marie Curie');

        $byAppartement = $this->getJson('/api/sejours?search=Zenith');
        $byAppartement->assertOk();
        $byAppartement->assertJsonCount(1, 'data');
        $byAppartement->assertJsonPath('data.0.nom_voyageur', 'Marie Curie');
    }

    public function test_it_filters_by_search_on_reference(): void
    {
        $this->sejour(['nom_voyageur' => 'Jean Dupont']);
        $marie = $this->sejour(['nom_voyageur' => 'Marie Curie']);

        $response = $this->getJson("/api/sejours?search={$marie->reference}");

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom_voyageur', 'Marie Curie');
    }

    public function test_it_filters_by_statut(): void
    {
        $this->sejour(['statut' => 'a_venir']);
        $this->sejour(['statut' => 'termine']);

        $response = $this->getJson('/api/sejours?statut=termine');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.statut', 'termine');
    }

    public function test_it_filters_by_appartement_id(): void
    {
        $appartement1 = $this->appartement('Loft Bastille');
        $appartement2 = $this->appartement('Zenith');
        $this->sejour(['appartement_id' => $appartement1->id]);
        $this->sejour(['appartement_id' => $appartement2->id]);

        $response = $this->getJson("/api/sejours?appartement_id={$appartement2->id}");

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.appartement_id', $appartement2->id);
    }

    public function test_it_filters_by_date_range_on_date_arrivee(): void
    {
        $this->sejour(['date_arrivee' => '2026-01-01', 'date_depart' => '2026-01-05']);
        $this->sejour(['date_arrivee' => '2026-06-01', 'date_depart' => '2026-06-05']);

        $response = $this->getJson('/api/sejours?date_debut=2026-05-01&date_fin=2026-07-01');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.date_arrivee', '2026-06-01');
    }

    public function test_it_sorts_by_date_arrivee_ascending(): void
    {
        $this->sejour(['date_arrivee' => '2026-03-01', 'date_depart' => '2026-03-05', 'nom_voyageur' => 'B']);
        $this->sejour(['date_arrivee' => '2026-01-01', 'date_depart' => '2026-01-05', 'nom_voyageur' => 'A']);

        $response = $this->getJson('/api/sejours?sort_by=date_arrivee&sort_dir=asc');

        $response->assertOk();
        $response->assertJsonPath('data.0.nom_voyageur', 'A');
        $response->assertJsonPath('data.1.nom_voyageur', 'B');
    }

    public function test_it_sorts_by_date_depart_descending(): void
    {
        $this->sejour(['date_arrivee' => '2026-01-01', 'date_depart' => '2026-01-05', 'nom_voyageur' => 'Tôt']);
        $this->sejour(['date_arrivee' => '2026-03-01', 'date_depart' => '2026-03-05', 'nom_voyageur' => 'Tard']);

        $response = $this->getJson('/api/sejours?sort_by=date_depart&sort_dir=desc');

        $response->assertOk();
        $response->assertJsonPath('data.0.nom_voyageur', 'Tard');
        $response->assertJsonPath('data.1.nom_voyageur', 'Tôt');
    }

    public function test_it_paginates_results(): void
    {
        for ($i = 1; $i <= 12; $i++) {
            $this->sejour(['nom_voyageur' => "Voyageur {$i}"]);
        }

        $page1 = $this->getJson('/api/sejours?per_page=5&page=1');
        $page1->assertOk();
        $page1->assertJsonCount(5, 'data');
        $page1->assertJsonPath('current_page', 1);
        $page1->assertJsonPath('last_page', 3);
        $page1->assertJsonPath('total', 12);

        $page3 = $this->getJson('/api/sejours?per_page=5&page=3');
        $page3->assertOk();
        $page3->assertJsonCount(2, 'data');
        $page3->assertJsonPath('current_page', 3);
    }

    public function test_it_rejects_an_invalid_statut_filter(): void
    {
        $response = $this->getJson('/api/sejours?statut=inconnu');

        $response->assertStatus(422);
    }

    public function test_it_shows_a_single_sejour_with_its_full_detail(): void
    {
        $sejour = $this->sejour(['nom_voyageur' => 'Jean Dupont']);
        $sejour->voyageurs()->create(['nom' => 'Jean Dupont', 'est_principal' => true, 'type' => 'adulte']);

        $response = $this->getJson("/api/sejours/{$sejour->id}");

        $response->assertOk();
        $response->assertJsonPath('id', $sejour->id);
        $response->assertJsonPath('nom_voyageur', 'Jean Dupont');
        $response->assertJsonPath('appartement.nom', 'Loft Bastille');
        $response->assertJsonPath('voyageurs_count', 1);
        $response->assertJsonCount(1, 'voyageurs');
    }

    public function test_it_returns_404_for_a_nonexistent_sejour(): void
    {
        $response = $this->getJson('/api/sejours/999999');

        $response->assertStatus(404);
    }

    private function missionAvecRefusEtPreuve(): MissionMenage
    {
        $sejour = $this->sejour(['statut' => 'termine']);
        $mission = MissionMenage::create([
            'sejour_id' => $sejour->id,
            'statut' => 'non_conforme',
        ]);
        $mission->refus()->create(['motif' => 'Salle de bain pas nettoyée.']);
        $mission->photosPreuve()->create(['photo_url' => 'missions-menage-photos-preuve/preuve.jpg', 'note' => 'Corrigé']);

        return $mission;
    }

    public function test_the_sejours_list_includes_the_mission_menage_refus_history_and_proof_photos(): void
    {
        $mission = $this->missionAvecRefusEtPreuve();

        $response = $this->getJson('/api/sejours');

        $response->assertOk();
        $response->assertJsonPath('data.0.mission_menage.id', $mission->id);
        $response->assertJsonCount(1, 'data.0.mission_menage.refus');
        $response->assertJsonPath('data.0.mission_menage.refus.0.motif', 'Salle de bain pas nettoyée.');
        $response->assertJsonCount(1, 'data.0.mission_menage.photos_preuve');
        $response->assertJsonPath('data.0.mission_menage.photos_preuve.0.note', 'Corrigé');
    }

    public function test_a_single_sejour_includes_the_mission_menage_refus_history_and_proof_photos(): void
    {
        $mission = $this->missionAvecRefusEtPreuve();

        $response = $this->getJson("/api/sejours/{$mission->sejour_id}");

        $response->assertOk();
        $response->assertJsonCount(1, 'mission_menage.refus');
        $response->assertJsonPath('mission_menage.refus.0.motif', 'Salle de bain pas nettoyée.');
        $response->assertJsonCount(1, 'mission_menage.photos_preuve');
        $response->assertJsonPath('mission_menage.photos_preuve.0.note', 'Corrigé');
    }
}
