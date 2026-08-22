<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TicketMaintenanceMessageAgentTest extends TestCase
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

    public function test_the_assigned_agent_can_send_a_note_only_message(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", [
            'note' => 'Je dois commander une pièce, ça prendra un jour de plus.',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('messages_agent_maintenance', [
            'ticket_maintenance_id' => $ticket->id,
            'note' => 'Je dois commander une pièce, ça prendra un jour de plus.',
        ]);
    }

    public function test_the_assigned_agent_can_send_a_photo_only_message(): void
    {
        Storage::fake('public');
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/message", [
            'photo' => UploadedFile::fake()->image('probleme-supplementaire.jpg'),
        ], ['Accept' => 'application/json']);

        $response->assertOk();
        $this->assertDatabaseCount('messages_agent_maintenance', 1);
        $this->assertNotNull(\App\Models\MessageAgentMaintenance::first()->photo_url);
    }

    public function test_the_assigned_agent_can_send_an_audio_only_message(): void
    {
        Storage::fake('public');
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/message", [
            'audio' => UploadedFile::fake()->create('question.mp3', 500, 'audio/mpeg'),
        ], ['Accept' => 'application/json']);

        $response->assertOk();
        $this->assertNotNull(\App\Models\MessageAgentMaintenance::first()->audio_url);
    }

    public function test_it_rejects_a_message_with_none_of_photo_audio_or_note(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", []);

        $response->assertStatus(422);
        $this->assertDatabaseCount('messages_agent_maintenance', 0);
    }

    public function test_it_rejects_a_message_when_the_ticket_is_not_yet_assigned(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'ouvert']);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", [
            'note' => 'Une question.',
        ]);

        $response->assertStatus(403);
    }

    public function test_it_rejects_a_message_when_the_ticket_is_already_resolved(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", [
            'note' => 'Une question.',
        ]);

        $response->assertStatus(422);
    }

    public function test_a_maintenance_agent_cannot_message_on_another_agents_ticket(): void
    {
        $autreAgent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $autreAgent->id]);
        Sanctum::actingAs($this->agentMaintenance(['nom' => 'Sami L.']), ['*']);

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", [
            'note' => 'Une question.',
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('messages_agent_maintenance', 0);
    }

    public function test_a_manager_cannot_send_an_agent_message_even_on_a_ticket_they_manage(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $this->actingAsManager();

        $response = $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", [
            'note' => 'Une question.',
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('messages_agent_maintenance', 0);
    }

    public function test_messages_are_returned_in_chronological_order_on_the_ticket(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", ['note' => 'Premier message.'])->assertOk();
        $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", ['note' => 'Deuxième message.'])->assertOk();

        $notes = $ticket->fresh()->messagesAgent->pluck('note')->all();
        $this->assertSame(['Premier message.', 'Deuxième message.'], $notes);
    }

    public function test_the_manager_sees_the_agents_messages_on_the_ticket_list(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);
        $this->postJson("/api/tickets-maintenance/{$ticket->id}/message", ['note' => 'Une précision pour vous.'])->assertOk();

        $this->actingAsManager();
        $response = $this->getJson('/api/tickets-maintenance');

        $response->assertOk();
        $response->assertJsonPath('0.messages_agent.0.note', 'Une précision pour vous.');
    }

    public function test_it_rejects_an_oversized_photo_with_a_clear_message(): void
    {
        Storage::fake('public');
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/message", [
            'photo' => UploadedFile::fake()->image('trop-grande.jpg')->size(10241),
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
        $response->assertJsonFragment(['photo' => ['Photo trop lourde, réessayez avec une photo plus légère (10 Mo maximum).']]);
    }
}
