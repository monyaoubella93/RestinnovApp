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

    public function test_it_creates_a_recurring_charge_starting_today_by_default(): void
    {
        $appartement = $this->appartement();

        $response = $this->postJson("/api/appartements/{$appartement->id}/charges", [
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('nom_service', 'WiFi');
        $response->assertJsonPath('date_debut', now()->toDateString());
        $this->assertDatabaseHas('charges_appartement', [
            'appartement_id' => $appartement->id,
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
            'date_fin' => null,
        ]);
    }

    public function test_nom_service_montant_frequence_and_a_charge_de_are_required(): void
    {
        $appartement = $this->appartement();

        $response = $this->postJson("/api/appartements/{$appartement->id}/charges", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['nom_service', 'montant', 'frequence', 'a_charge_de']);
    }

    public function test_frequence_and_a_charge_de_are_restricted_to_known_values(): void
    {
        $appartement = $this->appartement();

        $response = $this->postJson("/api/appartements/{$appartement->id}/charges", [
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'hebdomadaire',
            'a_charge_de' => 'locataire',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['frequence', 'a_charge_de']);
    }

    public function test_it_updates_a_charge_in_place(): void
    {
        $appartement = $this->appartement();
        $charge = ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
            'date_debut' => '2026-01-01',
        ]);

        $response = $this->patchJson("/api/charges-appartement/{$charge->id}", [
            'montant' => 199,
        ]);

        $response->assertOk();
        $response->assertJsonPath('montant', '199.00');
        $this->assertDatabaseHas('charges_appartement', ['id' => $charge->id, 'montant' => 199]);
    }

    public function test_it_closes_a_charge_by_setting_date_fin(): void
    {
        $appartement = $this->appartement();
        $charge = ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'Netflix',
            'montant' => 80,
            'frequence' => 'mensuel',
            'a_charge_de' => 'proprietaire',
            'date_debut' => '2026-01-01',
        ]);

        $response = $this->patchJson("/api/charges-appartement/{$charge->id}", [
            'date_fin' => '2026-06-30',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('charges_appartement', ['id' => $charge->id, 'date_fin' => '2026-06-30']);
    }

    public function test_it_deletes_a_charge(): void
    {
        $appartement = $this->appartement();
        $charge = ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'Pressing',
            'montant' => 20,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
            'date_debut' => '2026-01-01',
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
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
        ]);

        $response->assertStatus(403);
    }
}
