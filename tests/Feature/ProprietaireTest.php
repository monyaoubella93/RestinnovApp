<?php

namespace Tests\Feature;

use App\Models\Proprietaire;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProprietaireTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_a_proprietaire_with_adresse(): void
    {
        $response = $this->postJson('/api/proprietaires', [
            'nom' => 'Fatima Mimid',
            'telephone' => '00 352 691 690 441',
            'email' => 'fatima@example.com',
            'adresse' => '12 rue des Fleurs, Casablanca',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('adresse', '12 rue des Fleurs, Casablanca');
        $this->assertDatabaseHas('proprietaires', [
            'nom' => 'Fatima Mimid',
            'adresse' => '12 rue des Fleurs, Casablanca',
        ]);
    }

    public function test_nom_is_required_but_contact_fields_are_optional(): void
    {
        $response = $this->postJson('/api/proprietaires', ['nom' => 'Karim Alaoui']);

        $response->assertCreated();
        $response->assertJsonPath('telephone', null);
        $response->assertJsonPath('email', null);
        $response->assertJsonPath('adresse', null);
    }

    public function test_it_updates_an_existing_proprietaires_contact_details(): void
    {
        $proprietaire = Proprietaire::create(['nom' => 'Karim Alaoui']);

        $response = $this->patchJson("/api/proprietaires/{$proprietaire->id}", [
            'nom' => 'Karim Alaoui',
            'telephone' => '0600000000',
            'email' => 'karim@example.com',
            'adresse' => 'Rabat',
        ]);

        $response->assertOk();
        $response->assertJsonPath('telephone', '0600000000');
        $response->assertJsonPath('email', 'karim@example.com');
        $response->assertJsonPath('adresse', 'Rabat');
        $this->assertDatabaseHas('proprietaires', [
            'id' => $proprietaire->id,
            'telephone' => '0600000000',
            'email' => 'karim@example.com',
            'adresse' => 'Rabat',
        ]);
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $this->actingAsMenage();

        $response = $this->postJson('/api/proprietaires', ['nom' => 'Karim Alaoui']);

        $response->assertStatus(403);
    }
}
