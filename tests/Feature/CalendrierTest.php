<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CalendrierTest extends TestCase
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
            'date_arrivee' => '2026-08-10',
            'date_depart' => '2026-08-15',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
            'plateforme_origine' => 'airbnb',
            'montant_mad' => 1000,
        ], $overrides));
    }

    public function test_it_returns_every_day_of_the_month(): void
    {
        $response = $this->getJson('/api/calendrier?mois=2026-08');

        $response->assertOk();
        $response->assertJsonPath('mois', '2026-08');
        $response->assertJsonCount(31, 'jours');
        $response->assertJsonPath('jours.0.date', '2026-08-01');
        $response->assertJsonPath('jours.30.date', '2026-08-31');
    }

    public function test_it_marks_days_covered_by_a_sejour_arrivee_inclusive_depart_exclusive(): void
    {
        $this->sejour(['date_arrivee' => '2026-08-10', 'date_depart' => '2026-08-15']);

        $response = $this->getJson('/api/calendrier?mois=2026-08');

        $response->assertOk();
        $response->assertJsonCount(0, 'jours.8.sejours'); // 2026-08-09, before arrivée
        $response->assertJsonCount(1, 'jours.9.sejours'); // 2026-08-10, arrivée
        $response->assertJsonCount(1, 'jours.13.sejours'); // 2026-08-14, night before départ
        $response->assertJsonCount(0, 'jours.14.sejours'); // 2026-08-15, départ (checkout day, not occupied)
    }

    public function test_it_includes_the_sejour_reference_statut_and_appartement(): void
    {
        $appartement = $this->appartement('Zenith');
        $this->sejour([
            'appartement_id' => $appartement->id,
            'nom_voyageur' => 'Marie Curie',
            'statut' => 'en_cours',
            'date_arrivee' => '2026-08-05',
            'date_depart' => '2026-08-08',
        ]);

        $response = $this->getJson('/api/calendrier?mois=2026-08');

        $response->assertOk();
        $response->assertJsonPath('jours.4.sejours.0.nom_voyageur', 'Marie Curie');
        $response->assertJsonPath('jours.4.sejours.0.statut', 'en_cours');
        $response->assertJsonPath('jours.4.sejours.0.appartement.nom', 'Zenith');
        $response->assertJsonPath('jours.4.sejours.0.reference', fn ($reference) => str_starts_with($reference, 'SEJ-'));
    }

    public function test_it_lists_multiple_sejours_on_the_same_day_when_viewing_all_appartements(): void
    {
        $this->sejour([
            'appartement_id' => $this->appartement('Loft A')->id,
            'date_arrivee' => '2026-08-10',
            'date_depart' => '2026-08-12',
        ]);
        $this->sejour([
            'appartement_id' => $this->appartement('Loft B')->id,
            'date_arrivee' => '2026-08-10',
            'date_depart' => '2026-08-12',
        ]);

        $response = $this->getJson('/api/calendrier?mois=2026-08');

        $response->assertOk();
        $response->assertJsonCount(2, 'jours.9.sejours');
    }

    public function test_it_filters_by_appartement_id(): void
    {
        $appartementA = $this->appartement('Loft A');
        $appartementB = $this->appartement('Loft B');
        $this->sejour(['appartement_id' => $appartementA->id, 'date_arrivee' => '2026-08-10', 'date_depart' => '2026-08-12']);
        $this->sejour(['appartement_id' => $appartementB->id, 'date_arrivee' => '2026-08-10', 'date_depart' => '2026-08-12']);

        $response = $this->getJson("/api/calendrier?mois=2026-08&appartement_id={$appartementA->id}");

        $response->assertOk();
        $response->assertJsonCount(1, 'jours.9.sejours');
        $response->assertJsonPath('jours.9.sejours.0.appartement.nom', 'Loft A');
    }

    public function test_it_excludes_sejours_from_other_months(): void
    {
        $this->sejour(['date_arrivee' => '2026-07-25', 'date_depart' => '2026-07-31']);
        $this->sejour(['date_arrivee' => '2026-09-01', 'date_depart' => '2026-09-05']);

        $response = $this->getJson('/api/calendrier?mois=2026-08');

        $response->assertOk();
        foreach (range(0, 30) as $index) {
            $response->assertJsonCount(0, "jours.{$index}.sejours");
        }
    }

    public function test_it_excludes_cancelled_sejours_so_their_dates_appear_free(): void
    {
        $this->sejour(['date_arrivee' => '2026-08-10', 'date_depart' => '2026-08-15', 'statut' => 'annule']);

        $response = $this->getJson('/api/calendrier?mois=2026-08');

        $response->assertOk();
        $response->assertJsonCount(0, 'jours.9.sejours');
    }

    public function test_mois_must_be_provided_in_y_m_format(): void
    {
        $response = $this->getJson('/api/calendrier?mois=2026-08-01');

        $response->assertStatus(422);
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $this->actingAsMenage();

        $response = $this->getJson('/api/calendrier?mois=2026-08');

        $response->assertForbidden();
    }
}
