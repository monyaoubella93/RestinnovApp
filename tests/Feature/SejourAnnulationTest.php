<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SejourAnnulationTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(): Appartement
    {
        return Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
    }

    private function sejour(Appartement $appartement, array $overrides = []): Sejour
    {
        return Sejour::create(array_merge([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-10',
            'date_depart' => '2026-09-15',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
            'montant_mad' => 1000,
        ], $overrides));
    }

    public function test_it_cancels_an_a_venir_sejour(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/annuler");

        $response->assertOk();
        $response->assertJsonPath('statut', 'annule');
        $this->assertDatabaseHas('sejours', ['id' => $sejour->id, 'statut' => 'annule']);
    }

    public function test_it_rejects_cancelling_an_en_cours_sejour(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement, ['statut' => 'en_cours']);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/annuler");

        $response->assertStatus(422);
        $this->assertDatabaseHas('sejours', ['id' => $sejour->id, 'statut' => 'en_cours']);
    }

    public function test_it_rejects_cancelling_a_termine_sejour(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement, ['statut' => 'termine']);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/annuler");

        $response->assertStatus(422);
    }

    public function test_it_rejects_cancelling_an_already_cancelled_sejour(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement, ['statut' => 'annule']);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/annuler");

        $response->assertStatus(422);
    }

    public function test_cancelling_a_sejour_frees_its_dates_for_a_new_booking(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement, ['date_arrivee' => '2026-09-10', 'date_depart' => '2026-09-15']);

        $this->patchJson("/api/sejours/{$sejour->id}/annuler")->assertOk();

        $response = $this->postJson('/api/sejours', [
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-11',
            'date_depart' => '2026-09-13',
            'voyageurs' => [
                ['nom' => 'Marie Curie', 'est_principal' => true, 'type' => 'adulte'],
            ],
        ]);

        $response->assertCreated();
    }

    public function test_checkout_is_rejected_when_sejour_is_cancelled(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement, ['statut' => 'annule']);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/checkout");

        $response->assertStatus(422);
        $this->assertDatabaseCount('mission_menages', 0);
    }

    public function test_update_is_rejected_when_sejour_is_cancelled(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement, ['statut' => 'annule']);
        $sejour->voyageurs()->create(['nom' => 'Jean Dupont', 'est_principal' => true, 'type' => 'adulte']);

        $response = $this->patchJson("/api/sejours/{$sejour->id}", [
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-10',
            'date_depart' => '2026-09-16',
            'voyageurs' => [
                ['nom' => 'Jean Dupont', 'est_principal' => true, 'type' => 'adulte'],
            ],
        ]);

        $response->assertStatus(422);
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $appartement = $this->appartement();
        $sejour = $this->sejour($appartement);

        $this->actingAsMenage();

        $response = $this->patchJson("/api/sejours/{$sejour->id}/annuler");

        $response->assertForbidden();
    }
}
