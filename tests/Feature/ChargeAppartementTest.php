<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChargeAppartement;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChargeAppartementTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(): Appartement
    {
        return Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
    }

    public function test_it_creates_a_charge_for_an_appartement_and_month(): void
    {
        $appartement = $this->appartement();

        $response = $this->postJson("/api/appartements/{$appartement->id}/charges", [
            'mois' => '2026-08',
            'description' => 'WiFi Août',
            'quantite' => 1,
            'prix_unitaire' => 149,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('description', 'WiFi Août');
        $this->assertDatabaseHas('charges_appartement', [
            'appartement_id' => $appartement->id,
            'mois' => '2026-08',
            'description' => 'WiFi Août',
            'prix_unitaire' => 149,
        ]);
    }

    public function test_mois_description_quantite_and_prix_unitaire_are_required(): void
    {
        $appartement = $this->appartement();

        $response = $this->postJson("/api/appartements/{$appartement->id}/charges", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['mois', 'description', 'quantite', 'prix_unitaire']);
    }

    public function test_it_deletes_a_charge(): void
    {
        $appartement = $this->appartement();
        $charge = ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'mois' => '2026-08',
            'description' => 'Pressing',
            'quantite' => 6,
            'prix_unitaire' => 20,
        ]);

        $response = $this->delete("/api/charges-appartement/{$charge->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('charges_appartement', ['id' => $charge->id]);
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $appartement = $this->appartement();
        $this->actingAsMenage();

        $response = $this->postJson("/api/appartements/{$appartement->id}/charges", [
            'mois' => '2026-08',
            'description' => 'WiFi',
            'quantite' => 1,
            'prix_unitaire' => 149,
        ]);

        $response->assertStatus(403);
    }
}
