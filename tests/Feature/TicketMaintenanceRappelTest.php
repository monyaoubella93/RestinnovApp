<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TicketMaintenanceRappelTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(): Appartement
    {
        return Appartement::create(['nom' => 'Loft Bastille', 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
    }

    private function mission(Appartement $appartement): MissionMenage
    {
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-02',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        return MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'a_faire']);
    }

    private function ticket(array $overrides = []): TicketMaintenance
    {
        $appartement = $this->appartement();

        return TicketMaintenance::create(array_merge([
            'appartement_id' => $appartement->id,
            'mission_origine_id' => $this->mission($appartement)->id,
            'description' => 'Robinet qui fuit.',
            'statut' => 'ouvert',
        ], $overrides));
    }

    private function agentMaintenance(array $overrides = []): Utilisateur
    {
        return Utilisateur::create(array_merge([
            'nom' => 'Karim B.',
            'role' => 'maintenance',
        ], $overrides));
    }

    public function test_manager_sends_a_rappel_on_an_assigne_ticket(): void
    {
        $manager = $this->actingAsManager();
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => 'Merci de faire avancer ce ticket rapidement.',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('ticket_maintenance_rappels', [
            'ticket_maintenance_id' => $ticket->id,
            'manager_id' => $manager->id,
            'message' => 'Merci de faire avancer ce ticket rapidement.',
        ]);
    }

    public function test_manager_sends_a_rappel_on_an_en_cours_ticket(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'en_cours', 'agent_id' => $agent->id]);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => "Où en êtes-vous ?",
        ]);

        $response->assertOk();
        $this->assertDatabaseCount('ticket_maintenance_rappels', 1);
    }

    public function test_manager_sends_a_rappel_on_an_a_refaire_ticket(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'a_refaire', 'agent_id' => $agent->id]);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => 'Cette fois-ci, vérifiez bien le joint.',
        ]);

        $response->assertOk();
        $this->assertDatabaseCount('ticket_maintenance_rappels', 1);
    }

    public function test_rappel_requires_a_message(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('message');
        $this->assertDatabaseCount('ticket_maintenance_rappels', 0);
    }

    public function test_rappel_is_rejected_when_the_ticket_has_no_agent_assigned(): void
    {
        $ticket = $this->ticket(['statut' => 'ouvert']);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => 'Un rappel quelconque.',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('ticket_maintenance_rappels', 0);
    }

    public function test_rappel_is_rejected_once_the_ticket_is_pending_validation(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'agent_id' => $agent->id]);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => 'Un rappel quelconque.',
        ]);

        $response->assertStatus(422);
    }

    public function test_rappel_is_rejected_once_the_ticket_is_resolu(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id]);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => 'Un rappel quelconque.',
        ]);

        $response->assertStatus(422);
    }

    public function test_rappel_is_forbidden_for_a_maintenance_account(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => 'Un rappel quelconque.',
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('ticket_maintenance_rappels', 0);
    }

    public function test_rappel_is_forbidden_for_a_menage_account(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $this->actingAsMenage();

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", [
            'message' => 'Un rappel quelconque.',
        ]);

        $response->assertStatus(403);
    }

    public function test_rappels_are_returned_in_chronological_order_on_the_ticket(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);

        $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", ['message' => 'Premier rappel.'])->assertOk();
        $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", ['message' => 'Second rappel.'])->assertOk();

        $messages = $ticket->fresh()->rappels->pluck('message')->all();
        $this->assertSame(['Premier rappel.', 'Second rappel.'], $messages);
    }

    public function test_the_agent_sees_the_managers_rappel_on_their_own_ticket(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", ['message' => 'Merci de vous en occuper vite.'])
            ->assertOk();

        Sanctum::actingAs($agent, ['*']);
        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonPath('0.rappels.0.message', 'Merci de vous en occuper vite.');
    }

    public function test_rappel_is_not_leaked_to_a_different_agent(): void
    {
        $agent = $this->agentMaintenance();
        $autreAgent = $this->agentMaintenance(['nom' => 'Yassine T.']);
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $this->postJson("/api/tickets-maintenance/{$ticket->id}/rappel", ['message' => 'Pour Karim seulement.'])
            ->assertOk();
        $this->ticket(['statut' => 'assigne', 'agent_id' => $autreAgent->id]);

        Sanctum::actingAs($autreAgent, ['*']);
        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonPath('0.rappels', []);
    }
}
