<?php

namespace Tests\Feature;

use App\Models\ChecklistModele;
use App\Models\Proprietaire;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AppartementCreationTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_creates_an_appartement_with_minimal_fields(): void
    {
        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('statut', 'disponible');
        $response->assertJsonPath('checklist_modeles', []);
        $this->assertDatabaseHas('appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'statut' => 'disponible',
            'agent_habituel_id' => null,
        ]);
    }

    public function test_it_creates_an_appartement_with_photo_checklist_and_agent_habituel(): void
    {
        Storage::fake('public');

        $checklist = ChecklistModele::create(['nom' => 'Checklist standard']);
        $agent = Utilisateur::create(['nom' => 'Fatima Z.', 'role' => 'menage']);

        $photo = UploadedFile::fake()->image('appartement.jpg');

        $response = $this->post('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'checklist_modele_ids' => [$checklist->id],
            'agent_habituel_id' => $agent->id,
            'photo' => $photo,
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonPath('checklist_modeles.0.nom', 'Checklist standard');
        $response->assertJsonPath('agent_habituel.nom', 'Fatima Z.');

        $appartement = $this->getJson('/api/appartements')->json()[0];
        $this->assertNotNull($appartement['photo_principale']);
        Storage::disk('public')->assertExists($appartement['photo_principale']);
    }

    public function test_it_creates_an_appartement_with_several_checklist_modeles(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        $fenetres = ChecklistModele::create(['nom' => 'Fenêtres']);

        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'checklist_modele_ids' => [$standard->id, $fenetres->id],
        ]);

        $response->assertCreated();
        $response->assertJsonCount(2, 'checklist_modeles');
        $response->assertJsonPath('checklist_modeles.0.nom', 'Standard');
        $response->assertJsonPath('checklist_modeles.1.nom', 'Fenêtres');
    }

    public function test_statut_cannot_be_set_manually_and_defaults_to_disponible(): void
    {
        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'statut' => 'occupe',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('statut', 'disponible');
    }

    public function test_agent_habituel_must_have_menage_role(): void
    {
        $manager = Utilisateur::create(['nom' => 'Nadia M.', 'role' => 'manager']);

        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'agent_habituel_id' => $manager->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('agent_habituel_id');
    }

    public function test_it_lists_and_creates_checklist_modeles(): void
    {
        ChecklistModele::create(['nom' => 'Checklist standard']);

        $response = $this->getJson('/api/checklist-modeles');
        $response->assertOk();
        $response->assertJsonCount(1);

        $createResponse = $this->postJson('/api/checklist-modeles', [
            'nom' => 'Checklist grand studio',
        ]);
        $createResponse->assertCreated();
        $createResponse->assertJsonPath('nom', 'Checklist grand studio');

        $this->assertDatabaseHas('checklist_modeles', ['nom' => 'Checklist grand studio']);
        $this->getJson('/api/checklist-modeles')->assertJsonCount(2);
    }

    public function test_it_lists_utilisateurs_filtered_by_role(): void
    {
        Utilisateur::create(['nom' => 'Fatima Z.', 'role' => 'menage']);
        Utilisateur::create(['nom' => 'Nadia M.', 'role' => 'manager']);

        $response = $this->getJson('/api/utilisateurs?role=menage');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.nom', 'Fatima Z.');
    }

    public function test_mode_gestion_defaults_to_mandat_when_not_specified(): void
    {
        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('mode_gestion', 'mandat');
    }

    public function test_it_creates_an_appartement_in_mandat_mode_with_an_existing_proprietaire_and_commission(): void
    {
        $proprietaire = Proprietaire::create(['nom' => 'Karim Alaoui', 'telephone' => '0600000001']);

        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'proprietaire_id' => $proprietaire->id,
            'mode_gestion' => 'mandat',
            'taux_commission' => 15,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('proprietaire.nom', 'Karim Alaoui');
        $response->assertJsonPath('mode_gestion', 'mandat');
        $response->assertJsonPath('taux_commission', '15.00');
        $this->assertDatabaseHas('appartements', [
            'nom' => 'Zenith 3ème étage',
            'proprietaire_id' => $proprietaire->id,
            'mode_gestion' => 'mandat',
        ]);
    }

    public function test_it_creates_an_appartement_in_sous_location_mode_with_a_loyer_fixe(): void
    {
        $proprietaire = Proprietaire::create(['nom' => 'Karim Alaoui']);

        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'proprietaire_id' => $proprietaire->id,
            'mode_gestion' => 'sous_location',
            'loyer_fixe_mensuel' => 4000,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('mode_gestion', 'sous_location');
        $response->assertJsonPath('loyer_fixe_mensuel', '4000.00');
    }

    public function test_proprietaire_id_must_exist(): void
    {
        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'proprietaire_id' => 999,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('proprietaire_id');
    }

    public function test_mode_gestion_must_be_mandat_or_sous_location(): void
    {
        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'mode_gestion' => 'autre',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('mode_gestion');
    }

    public function test_it_lists_and_creates_proprietaires(): void
    {
        Proprietaire::create(['nom' => 'Karim Alaoui']);

        $response = $this->getJson('/api/proprietaires');
        $response->assertOk();
        $response->assertJsonCount(1);

        $createResponse = $this->postJson('/api/proprietaires', [
            'nom' => 'Sara Bennani',
            'telephone' => '0611111111',
            'email' => 'sara.bennani@example.com',
        ]);
        $createResponse->assertCreated();
        $createResponse->assertJsonPath('nom', 'Sara Bennani');

        $this->assertDatabaseHas('proprietaires', ['nom' => 'Sara Bennani', 'email' => 'sara.bennani@example.com']);
        $this->getJson('/api/proprietaires')->assertJsonCount(2);
    }

    public function test_proprietaire_nom_is_required(): void
    {
        $response = $this->postJson('/api/proprietaires', ['telephone' => '0611111111']);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('nom');
    }

    public function test_it_creates_an_appartement_with_several_recurring_charges(): void
    {
        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'charges' => [
                ['nom_service' => 'WiFi', 'montant' => 149, 'frequence' => 'mensuel', 'a_charge_de' => 'restinnov'],
                ['nom_service' => 'Netflix', 'montant' => 80, 'frequence' => 'mensuel', 'a_charge_de' => 'proprietaire'],
            ],
        ]);

        $response->assertCreated();
        $response->assertJsonCount(2, 'charges_actives');
        $appartementId = $response->json('id');
        $this->assertDatabaseHas('charges_appartement', [
            'appartement_id' => $appartementId,
            'nom_service' => 'WiFi',
            'montant' => 149,
            'a_charge_de' => 'restinnov',
            'date_debut' => now()->toDateString(),
            'date_fin' => null,
        ]);
        $this->assertDatabaseHas('charges_appartement', [
            'appartement_id' => $appartementId,
            'nom_service' => 'Netflix',
            'a_charge_de' => 'proprietaire',
        ]);
    }

    public function test_charges_frequence_and_a_charge_de_are_validated_on_creation(): void
    {
        $response = $this->postJson('/api/appartements', [
            'nom' => 'Zenith 3ème étage',
            'adresse' => '10 avenue Hassan II, Casablanca',
            'charges' => [
                ['nom_service' => 'WiFi', 'montant' => 149, 'frequence' => 'hebdomadaire', 'a_charge_de' => 'locataire'],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['charges.0.frequence', 'charges.0.a_charge_de']);
    }
}
