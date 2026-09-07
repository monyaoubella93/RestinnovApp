<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class UtilisateurManagementTest extends TestCase
{
    use RefreshDatabase;

    private function agent(array $overrides = []): Utilisateur
    {
        return Utilisateur::create(array_merge([
            'nom' => 'Fatima Z.',
            'role' => 'menage',
        ], $overrides));
    }

    private function appartement(): Appartement
    {
        return Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
    }

    private function sejour(Appartement $appartement): Sejour
    {
        return Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
        ]);
    }

    // --- index() ---

    public function test_index_filters_by_search_on_nom(): void
    {
        $this->agent(['nom' => 'Fatima Zahra']);
        $this->agent(['nom' => 'Karim Benali']);

        $response = $this->getJson('/api/utilisateurs?role=menage&search=Fatima');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.nom', 'Fatima Zahra');
    }

    public function test_index_includes_appartements_habituel_and_mission_menages_counts(): void
    {
        $agent = $this->agent();
        $appartement = $this->appartement();
        $appartement->update(['agent_habituel_id' => $agent->id]);
        $appartement2 = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible', 'agent_habituel_id' => $agent->id]);

        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);
        MissionMenage::create(['sejour_id' => $this->sejour($appartement2)->id, 'agent_id' => $agent->id, 'statut' => 'conforme']);

        $response = $this->getJson('/api/utilisateurs?role=menage');

        $response->assertOk();
        $response->assertJsonPath('0.appartements_habituel_count', 2);
        $response->assertJsonPath('0.mission_menages_count', 2);
    }

    public function test_index_excludes_inactive_agents_by_default(): void
    {
        $this->agent(['nom' => 'Actif']);
        $this->agent(['nom' => 'Inactif', 'actif' => false]);

        $response = $this->getJson('/api/utilisateurs?role=menage');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.nom', 'Actif');
    }

    public function test_index_includes_inactive_agents_when_requested(): void
    {
        $this->agent(['nom' => 'Actif']);
        $this->agent(['nom' => 'Inactif', 'actif' => false]);

        $response = $this->getJson('/api/utilisateurs?role=menage&inclure_inactifs=1');

        $response->assertOk();
        $response->assertJsonCount(2);
    }

    public function test_index_includes_tickets_maintenance_count_for_maintenance_agents(): void
    {
        $agent = $this->agent(['nom' => 'Karim', 'role' => 'maintenance']);
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'agent_id' => $agent->id, 'statut' => 'assigne']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'agent_id' => $agent->id, 'statut' => 'resolu']);

        $response = $this->getJson('/api/utilisateurs?role=maintenance');

        $response->assertOk();
        $response->assertJsonPath('0.tickets_maintenance_count', 2);
    }

    // --- update() ---

    public function test_update_changes_nom_telephone_and_adresse(): void
    {
        $agent = $this->agent(['telephone' => '0611111111']);

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}", [
            'nom' => 'Fatima Zahra B.',
            'telephone' => '0622222222',
            'adresse' => '5 rue des Fleurs, Casablanca',
        ]);

        $response->assertOk();
        $response->assertJsonPath('nom', 'Fatima Zahra B.');
        $this->assertDatabaseHas('utilisateurs', [
            'id' => $agent->id,
            'nom' => 'Fatima Zahra B.',
            'telephone' => '0622222222',
            'adresse' => '5 rue des Fleurs, Casablanca',
        ]);
    }

    public function test_update_leaves_password_unchanged_when_not_provided(): void
    {
        $agent = $this->agent(['password' => Hash::make('ancien-mdp')]);

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}", [
            'nom' => 'Fatima Zahra B.',
        ]);

        $response->assertOk();
        $this->assertTrue(Hash::check('ancien-mdp', $agent->fresh()->password));
    }

    public function test_update_changes_password_when_provided(): void
    {
        $agent = $this->agent(['password' => Hash::make('ancien-mdp')]);

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}", [
            'nom' => 'Fatima Zahra B.',
            'password' => 'nouveau-mdp',
        ]);

        $response->assertOk();
        $this->assertTrue(Hash::check('nouveau-mdp', $agent->fresh()->password));
    }

    public function test_update_changes_password_for_a_maintenance_agent_and_is_effective_on_next_login(): void
    {
        $agent = $this->agent(['role' => 'maintenance', 'telephone' => '0699999999', 'password' => Hash::make('ancien-mdp')]);

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}", [
            'nom' => 'Karim Benali',
            'password' => 'nouveau-mdp',
        ]);
        $response->assertOk();

        $this->postJson('/api/login', ['telephone' => '0699999999', 'password' => 'ancien-mdp'])
            ->assertStatus(401);

        $this->postJson('/api/login', ['telephone' => '0699999999', 'password' => 'nouveau-mdp'])
            ->assertOk()
            ->assertJsonPath('role', 'maintenance');
    }

    public function test_update_never_exposes_the_password(): void
    {
        $agent = $this->agent();

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}", ['nom' => 'Fatima Zahra B.']);

        $response->assertJsonMissing(['password']);
    }

    public function test_update_requires_nom(): void
    {
        $agent = $this->agent();

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}", ['nom' => '']);

        $response->assertStatus(422);
    }

    // --- desactiver() / reactiver() ---

    public function test_desactiver_sets_actif_false(): void
    {
        $agent = $this->agent();

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}/desactiver");

        $response->assertOk();
        $response->assertJsonPath('actif', false);
        $this->assertDatabaseHas('utilisateurs', ['id' => $agent->id, 'actif' => false]);
    }

    public function test_reactiver_sets_actif_true(): void
    {
        $agent = $this->agent(['actif' => false]);

        $response = $this->patchJson("/api/utilisateurs/{$agent->id}/reactiver");

        $response->assertOk();
        $response->assertJsonPath('actif', true);
        $this->assertDatabaseHas('utilisateurs', ['id' => $agent->id, 'actif' => true]);
    }

    public function test_a_deactivated_agent_can_no_longer_be_set_as_agent_habituel(): void
    {
        $agent = $this->agent(['actif' => false]);

        $response = $this->postJson('/api/appartements', [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'agent_habituel_id' => $agent->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('agent_habituel_id');
    }

    // --- destroy() ---

    public function test_destroy_deletes_an_agent_with_no_history(): void
    {
        $agent = $this->agent();

        $response = $this->deleteJson("/api/utilisateurs/{$agent->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('utilisateurs', ['id' => $agent->id]);
    }

    public function test_destroy_is_rejected_when_the_agent_has_a_mission_menage(): void
    {
        $agent = $this->agent();
        $appartement = $this->appartement();
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'conforme']);

        $response = $this->deleteJson("/api/utilisateurs/{$agent->id}");

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Cet agent a un historique (missions, appartements ou tickets assignés) et ne peut pas être supprimé. Désactivez-le à la place.');
        $this->assertDatabaseHas('utilisateurs', ['id' => $agent->id]);
    }

    public function test_destroy_is_rejected_when_the_agent_is_an_agent_habituel(): void
    {
        $agent = $this->agent();
        $this->appartement()->update(['agent_habituel_id' => $agent->id]);

        $response = $this->deleteJson("/api/utilisateurs/{$agent->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('utilisateurs', ['id' => $agent->id]);
    }

    public function test_destroy_is_rejected_when_the_maintenance_agent_has_a_ticket(): void
    {
        $agent = $this->agent(['nom' => 'Karim', 'role' => 'maintenance']);
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'agent_id' => $agent->id, 'statut' => 'assigne']);

        $response = $this->deleteJson("/api/utilisateurs/{$agent->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('utilisateurs', ['id' => $agent->id]);
    }

    public function test_destroy_deletes_a_maintenance_agent_with_no_ticket_history(): void
    {
        $agent = $this->agent(['nom' => 'Karim', 'role' => 'maintenance']);

        $response = $this->deleteJson("/api/utilisateurs/{$agent->id}");

        $response->assertNoContent();
        $this->assertDatabaseMissing('utilisateurs', ['id' => $agent->id]);
    }
}
