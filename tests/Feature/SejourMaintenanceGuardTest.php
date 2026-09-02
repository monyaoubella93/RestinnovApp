<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\TicketMaintenance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SejourMaintenanceGuardTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(): Appartement
    {
        return Appartement::create(['nom' => 'Loft Bastille', 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
    }

    private function payload(Appartement $appartement): array
    {
        return [
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-01',
            'date_depart' => '2026-09-05',
            'voyageurs' => [
                ['nom' => 'Jean Dupont', 'est_principal' => true, 'type' => 'adulte'],
            ],
        ];
    }

    public function test_rejects_a_new_sejour_on_an_appartement_with_an_ouvert_ticket(): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'ouvert']);

        $response = $this->postJson('/api/sejours', $this->payload($appartement));

        $response->assertStatus(422);
        $this->assertDatabaseCount('sejours', 0);
    }

    public function test_rejects_a_new_sejour_on_an_appartement_with_an_assigne_ticket(): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'assigne']);

        $response = $this->postJson('/api/sejours', $this->payload($appartement));

        $response->assertStatus(422);
        $this->assertDatabaseCount('sejours', 0);
    }

    public function test_rejects_a_new_sejour_on_an_appartement_with_an_en_cours_ticket(): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'en_cours']);

        $response = $this->postJson('/api/sejours', $this->payload($appartement));

        $response->assertStatus(422);
        $this->assertDatabaseCount('sejours', 0);
    }

    public function test_allows_a_new_sejour_once_the_ticket_is_resolu(): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu']);

        $response = $this->postJson('/api/sejours', $this->payload($appartement));

        $response->assertCreated();
        $this->assertDatabaseCount('sejours', 1);
    }

    public function test_allows_a_new_sejour_on_an_appartement_with_no_ticket(): void
    {
        $appartement = $this->appartement();

        $response = $this->postJson('/api/sejours', $this->payload($appartement));

        $response->assertCreated();
        $this->assertDatabaseCount('sejours', 1);
    }
}
