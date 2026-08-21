<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TicketMaintenanceRefusHistoriqueTest extends TestCase
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

    // --- refuserResolution() with audio/photo ---

    public function test_refuser_resolution_accepts_audio_only(): void
    {
        $this->actingAsManager();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation']);

        $response = $this->patch("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", [
            'motif_audio' => UploadedFile::fake()->create('motif.mp3', 100, 'audio/mpeg'),
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'a_refaire');
        $refus = $ticket->refus()->first();
        $this->assertNotNull($refus->motif_audio_url);
        $this->assertNull($refus->motif);
    }

    public function test_refuser_resolution_accepts_photo_only(): void
    {
        $this->actingAsManager();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation']);

        $response = $this->patch("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", [
            'motif_photo' => UploadedFile::fake()->image('motif.jpg'),
        ]);

        $response->assertOk();
        $refus = $ticket->refus()->first();
        $this->assertNotNull($refus->motif_photo_url);
    }

    public function test_refuser_resolution_never_reassigns_the_ticket(): void
    {
        $this->actingAsManager();
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'agent_id' => $agent->id]);

        $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", ['motif' => 'Motif.'])->assertOk();

        $this->assertDatabaseHas('tickets_maintenance', ['id' => $ticket->id, 'agent_id' => $agent->id, 'statut' => 'a_refaire']);
    }

    // --- refus-vu ---

    public function test_refus_vu_marks_every_unread_refus_as_seen(): void
    {
        $this->actingAsManager();
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'a_refaire', 'agent_id' => $agent->id]);
        $ticket->refus()->create(['manager_id' => $this->actingAsManager()->id, 'motif' => 'Motif.']);

        Sanctum::actingAs($agent, ['*']);

        $this->assertFalse($ticket->refus()->first()->vu);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refus-vu");

        $response->assertOk();
        $this->assertTrue($ticket->refus()->first()->fresh()->vu);
    }

    public function test_refus_vu_is_forbidden_for_another_maintenance_agent(): void
    {
        $ticket = $this->ticket(['statut' => 'a_refaire']);
        $other = $this->agentMaintenance(['nom' => 'Autre Agent']);
        Sanctum::actingAs($other, ['*']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refus-vu");

        $response->assertStatus(403);
    }

    // --- mesTickets() refus payload ---

    public function test_mes_tickets_exposes_refus_audio_photo_and_vu_without_manager_identity(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'a_refaire', 'agent_id' => $agent->id]);
        $ticket->refus()->create([
            'manager_id' => $this->actingAsManager()->id,
            'motif' => 'Motif texte.',
            'motif_audio_url' => 'tickets-maintenance/audio.mp3',
            'motif_photo_url' => 'tickets-maintenance/photo.jpg',
        ]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonPath('0.refus.0.motif', 'Motif texte.');
        $response->assertJsonPath('0.refus.0.motif_audio_url', 'tickets-maintenance/audio.mp3');
        $response->assertJsonPath('0.refus.0.motif_photo_url', 'tickets-maintenance/photo.jpg');
        $response->assertJsonPath('0.refus.0.vu', false);
        $this->assertArrayNotHasKey('manager', $response->json('0.refus.0'));
    }

    // --- mesTicketsHistorique() ---

    public function test_mes_tickets_historique_returns_only_resolu_tickets_for_the_agent(): void
    {
        $agent = $this->agentMaintenance();
        $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $resolu = $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id, 'cout_reparation' => 50, 'photo_apres' => 'x.jpg']);
        $otherAgentTicket = $this->ticket(['statut' => 'resolu', 'agent_id' => $this->agentMaintenance(['nom' => 'Autre'])->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets/historique');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $resolu->id);
        $response->assertJsonPath('0.cout_reparation', 50);
    }

    public function test_mes_tickets_historique_sorted_most_recent_first(): void
    {
        $agent = $this->agentMaintenance();
        $older = $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id]);
        $older->forceFill(['created_at' => now()->subDays(2)])->save();
        $newer = $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets/historique');

        $response->assertOk();
        $response->assertJsonPath('0.id', $newer->id);
        $response->assertJsonPath('1.id', $older->id);
    }

    public function test_mes_tickets_historique_filters_by_appartement(): void
    {
        $agent = $this->agentMaintenance();
        $bastille = $this->appartement();
        $marais = Appartement::create(['nom' => 'Studio Marais', 'adresse' => '3 rue des Rosiers', 'statut' => 'disponible']);

        $ticketBastille = $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id, 'appartement_id' => $bastille->id]);
        $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id, 'appartement_id' => $marais->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets/historique?appartement_id='.$bastille->id);

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $ticketBastille->id);
    }

    public function test_mes_tickets_historique_filters_by_sejour_date_arrivee_range(): void
    {
        $agent = $this->agentMaintenance();
        $appartement = $this->appartement();

        $sejourJanvier = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-10',
            'date_depart' => '2026-01-12',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        $missionJanvier = MissionMenage::create(['sejour_id' => $sejourJanvier->id, 'statut' => 'a_faire']);
        $ticketJanvier = $this->ticket([
            'mission_origine_id' => $missionJanvier->id,
            'appartement_id' => $appartement->id,
            'statut' => 'resolu',
            'agent_id' => $agent->id,
        ]);

        $sejourMars = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-03-10',
            'date_depart' => '2026-03-12',
            'nom_voyageur' => 'Marie Curie',
        ]);
        $missionMars = MissionMenage::create(['sejour_id' => $sejourMars->id, 'statut' => 'a_faire']);
        $this->ticket([
            'mission_origine_id' => $missionMars->id,
            'appartement_id' => $appartement->id,
            'statut' => 'resolu',
            'agent_id' => $agent->id,
        ]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets/historique?date_debut=2026-01-01&date_fin=2026-01-31');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $ticketJanvier->id);
    }

    public function test_mes_tickets_historique_searches_by_reference_or_appartement_nom(): void
    {
        $agent = $this->agentMaintenance();
        $bastille = $this->appartement();
        $marais = Appartement::create(['nom' => 'Studio Marais', 'adresse' => '3 rue des Rosiers', 'statut' => 'disponible']);

        $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id, 'appartement_id' => $bastille->id]);
        $ticketMarais = $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id, 'appartement_id' => $marais->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets/historique?search=Marais');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $ticketMarais->id);
    }

    public function test_mes_tickets_historique_never_returns_another_agents_ticket_even_when_it_matches_a_filter(): void
    {
        $agent = $this->agentMaintenance();
        $autreAgent = $this->agentMaintenance(['nom' => 'Autre']);
        $appartement = $this->appartement();
        $this->ticket(['statut' => 'resolu', 'agent_id' => $autreAgent->id, 'appartement_id' => $appartement->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets/historique?appartement_id='.$appartement->id);

        $response->assertOk();
        $response->assertJsonCount(0);
    }
}
