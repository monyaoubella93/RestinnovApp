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

class TicketMaintenanceManagementTest extends TestCase
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

    // --- index() ---

    public function test_index_lists_tickets_with_their_relations(): void
    {
        $this->ticket();

        $response = $this->getJson('/api/tickets-maintenance');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.description', 'Robinet qui fuit.');
        $response->assertJsonPath('0.appartement.nom', 'Loft Bastille');
    }

    public function test_index_filters_by_statut(): void
    {
        $this->ticket(['statut' => 'ouvert']);
        $this->ticket(['statut' => 'resolu']);

        $response = $this->getJson('/api/tickets-maintenance?statut=ouvert');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.statut', 'ouvert');
    }

    public function test_index_lists_ouverts_before_assignes_and_resolus(): void
    {
        $this->ticket(['statut' => 'resolu', 'description' => 'Ticket résolu']);
        $this->ticket(['statut' => 'assigne', 'description' => 'Ticket assigné']);
        $this->ticket(['statut' => 'ouvert', 'description' => 'Ticket ouvert']);

        $response = $this->getJson('/api/tickets-maintenance');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'ouvert');
        $response->assertJsonPath('1.statut', 'assigne');
        $response->assertJsonPath('2.statut', 'resolu');
    }

    public function test_index_is_forbidden_for_a_menage_account(): void
    {
        $this->ticket();
        $this->actingAsMenage();

        $response = $this->getJson('/api/tickets-maintenance');

        $response->assertStatus(403);
    }

    public function test_index_without_a_statut_filter_returns_every_ticket_regardless_of_statut(): void
    {
        $this->ticket(['statut' => 'ouvert']);
        $this->ticket(['statut' => 'assigne']);
        $this->ticket(['statut' => 'resolu_en_attente_validation']);
        $this->ticket(['statut' => 'a_refaire']);
        $this->ticket(['statut' => 'resolu']);

        $response = $this->getJson('/api/tickets-maintenance');

        $response->assertOk();
        $response->assertJsonCount(5);
    }

    public function test_index_filters_by_a_refaire(): void
    {
        $this->ticket(['statut' => 'ouvert']);
        $aRefaire = $this->ticket(['statut' => 'a_refaire']);

        $response = $this->getJson('/api/tickets-maintenance?statut=a_refaire');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $aRefaire->id);
    }

    public function test_index_lists_a_refaire_tickets_right_after_ouvert(): void
    {
        $this->ticket(['statut' => 'resolu', 'description' => 'Ticket résolu']);
        $this->ticket(['statut' => 'assigne', 'description' => 'Ticket assigné']);
        $this->ticket(['statut' => 'a_refaire', 'description' => 'Ticket à refaire']);
        $this->ticket(['statut' => 'ouvert', 'description' => 'Ticket ouvert']);

        $response = $this->getJson('/api/tickets-maintenance');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'ouvert');
        $response->assertJsonPath('1.statut', 'a_refaire');
        $response->assertJsonPath('2.statut', 'assigne');
        $response->assertJsonPath('3.statut', 'resolu');
    }

    public function test_index_filters_by_appartement_id(): void
    {
        $matching = $this->ticket();
        $this->ticket();

        $response = $this->getJson('/api/tickets-maintenance?appartement_id='.$matching->appartement_id);

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $matching->id);
    }

    public function test_index_filters_by_sejour_date_arrivee_range(): void
    {
        $appartement = $this->appartement();
        $sejourJanvier = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-10',
            'date_depart' => '2026-01-12',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        $missionJanvier = MissionMenage::create(['sejour_id' => $sejourJanvier->id, 'statut' => 'a_faire']);
        $ticketJanvier = $this->ticket(['mission_origine_id' => $missionJanvier->id, 'appartement_id' => $appartement->id]);

        $sejourMars = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-03-10',
            'date_depart' => '2026-03-12',
            'nom_voyageur' => 'Marie Curie',
        ]);
        $missionMars = MissionMenage::create(['sejour_id' => $sejourMars->id, 'statut' => 'a_faire']);
        $this->ticket(['mission_origine_id' => $missionMars->id, 'appartement_id' => $appartement->id]);

        $response = $this->getJson('/api/tickets-maintenance?date_debut=2026-01-01&date_fin=2026-01-31');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $ticketJanvier->id);
    }

    public function test_index_combines_statut_appartement_and_date_filters(): void
    {
        $appartement = $this->appartement();
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-10',
            'date_depart' => '2026-01-12',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        $mission = MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'a_faire']);
        $matching = $this->ticket(['mission_origine_id' => $mission->id, 'appartement_id' => $appartement->id, 'statut' => 'ouvert']);
        $this->ticket(['mission_origine_id' => $mission->id, 'appartement_id' => $appartement->id, 'statut' => 'resolu']);

        $response = $this->getJson(
            '/api/tickets-maintenance?statut=ouvert&appartement_id='.$appartement->id.'&date_debut=2026-01-01&date_fin=2026-01-31',
        );

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $matching->id);
    }

    public function test_index_searches_by_reference(): void
    {
        $ticket = $this->ticket();
        $this->ticket();

        $response = $this->getJson('/api/tickets-maintenance?search='.$ticket->reference);

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $ticket->id);
    }

    public function test_index_searches_by_appartement_nom(): void
    {
        $appartement = Appartement::create(['nom' => 'Zenith Suite', 'adresse' => 'A', 'statut' => 'disponible']);
        $matching = TicketMaintenance::create([
            'appartement_id' => $appartement->id,
            'mission_origine_id' => $this->mission($appartement)->id,
            'description' => 'Fuite.',
            'statut' => 'ouvert',
        ]);
        $this->ticket();

        $response = $this->getJson('/api/tickets-maintenance?search=zenith');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $matching->id);
    }

    public function test_ticket_creation_generates_a_sequential_reference(): void
    {
        $premier = $this->ticket();
        $second = $this->ticket();

        $this->assertSame('MNT-0001', $premier->reference);
        $this->assertSame('MNT-0002', $second->reference);
    }

    public function test_index_exposes_the_ticket_reference(): void
    {
        $this->ticket();

        $response = $this->getJson('/api/tickets-maintenance');

        $response->assertOk();
        $response->assertJsonPath('0.reference', 'MNT-0001');
    }

    // --- assigner() ---

    public function test_assigner_assigns_the_ticket_to_an_active_maintenance_agent(): void
    {
        $ticket = $this->ticket();
        $agent = $this->agentMaintenance();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
            'description_manager' => 'Changer le joint du robinet.',
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'assigne');
        $response->assertJsonPath('agent.id', $agent->id);
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'agent_id' => $agent->id,
            'statut' => 'assigne',
        ]);
    }

    public function test_assigner_is_rejected_when_the_ticket_is_already_assigned(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $autreAgent = $this->agentMaintenance(['nom' => 'Yassine T.']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $autreAgent->id,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('tickets_maintenance', ['id' => $ticket->id, 'agent_id' => $agent->id]);
    }

    public function test_assigner_is_rejected_when_the_ticket_is_already_resolu(): void
    {
        $ticket = $this->ticket(['statut' => 'resolu']);
        $agent = $this->agentMaintenance();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
        ]);

        $response->assertStatus(422);
    }

    public function test_assigner_rejects_an_agent_that_is_not_role_maintenance(): void
    {
        $ticket = $this->ticket();
        $menageAgent = Utilisateur::create(['nom' => 'Fatima Z.', 'role' => 'menage']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $menageAgent->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('agent_id');
    }

    public function test_assigner_rejects_a_deactivated_maintenance_agent(): void
    {
        $ticket = $this->ticket();
        $agent = $this->agentMaintenance(['actif' => false]);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('agent_id');
    }

    public function test_assigner_is_forbidden_for_a_menage_account(): void
    {
        $ticket = $this->ticket();
        $agent = $this->agentMaintenance();
        $this->actingAsMenage();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
        ]);

        $response->assertStatus(403);
    }

    public function test_assigner_persists_the_manager_description(): void
    {
        $ticket = $this->ticket();
        $agent = $this->agentMaintenance();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
            'description_manager' => 'Changer le joint du robinet dans la salle de bain.',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'description_manager' => 'Changer le joint du robinet dans la salle de bain.',
        ]);
    }

    public function test_assigner_requires_either_a_written_or_a_recorded_description(): void
    {
        $ticket = $this->ticket();
        $agent = $this->agentMaintenance();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('description_manager');
    }

    public function test_assigner_accepts_an_audio_description_alone(): void
    {
        Storage::fake('public');

        $ticket = $this->ticket();
        $agent = $this->agentMaintenance();

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/assigner", [
            '_method' => 'PATCH',
            'agent_id' => $agent->id,
            'description_manager_audio' => UploadedFile::fake()->create('note.mp3', 100, 'audio/mpeg'),
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'assigne');
        $this->assertNotNull($response->json('description_manager_audio_url'));
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'description_manager' => null,
        ]);
    }

    public function test_assigner_accepts_an_audio_description_up_to_the_5mb_limit(): void
    {
        Storage::fake('public');

        $ticket = $this->ticket();
        $agent = $this->agentMaintenance();

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/assigner", [
            '_method' => 'PATCH',
            'agent_id' => $agent->id,
            'description_manager_audio' => UploadedFile::fake()->create('note.mp3', 5120, 'audio/mpeg'),
        ]);

        $response->assertOk();
    }

    public function test_assigner_rejects_an_audio_description_over_the_5mb_limit_with_a_clear_message(): void
    {
        Storage::fake('public');

        $ticket = $this->ticket();
        $agent = $this->agentMaintenance();

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/assigner", [
            '_method' => 'PATCH',
            'agent_id' => $agent->id,
            'description_manager_audio' => UploadedFile::fake()->create('note.mp3', 5121, 'audio/mpeg'),
        ]);

        $response->assertStatus(422);
        $response->assertJsonFragment([
            'description_manager_audio' => ['Enregistrement audio trop lourd, recommencez un enregistrement plus court (5 Mo maximum, soit environ 2 minutes).'],
        ]);
        $this->assertDatabaseHas('tickets_maintenance', ['id' => $ticket->id, 'statut' => 'ouvert']);
    }

    public function test_assigner_persists_photo_transferee_when_true(): void
    {
        $ticket = $this->ticket(['photo_url' => 'signalements/photo.jpg']);
        $agent = $this->agentMaintenance();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
            'description_manager' => 'Voir photo jointe.',
            'photo_transferee' => true,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'photo_transferee' => true,
        ]);
    }

    public function test_assigner_defaults_photo_transferee_to_false(): void
    {
        $ticket = $this->ticket(['photo_url' => 'signalements/photo.jpg']);
        $agent = $this->agentMaintenance();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/assigner", [
            'agent_id' => $agent->id,
            'description_manager' => 'Voir photo jointe.',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'photo_transferee' => false,
        ]);
    }

    // --- mesTickets() ---

    public function test_mes_tickets_lists_only_tickets_assigned_to_the_authenticated_agent(): void
    {
        $agent = $this->agentMaintenance();
        $autreAgent = $this->agentMaintenance(['nom' => 'Yassine T.']);
        $monTicket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id, 'description_manager' => 'Réparer la fuite.']);
        $this->ticket(['statut' => 'assigne', 'agent_id' => $autreAgent->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $monTicket->id);
        $response->assertJsonPath('0.description_manager', 'Réparer la fuite.');
    }

    public function test_mes_tickets_includes_assigne_a_refaire_and_resolu_en_attente_validation_but_not_resolu(): void
    {
        $agent = $this->agentMaintenance();
        $this->ticket(['statut' => 'ouvert', 'agent_id' => null]);
        $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $this->ticket(['statut' => 'resolu_en_attente_validation', 'agent_id' => $agent->id]);
        $this->ticket(['statut' => 'resolu', 'agent_id' => $agent->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonCount(2);
        $statuts = collect($response->json())->pluck('statut')->all();
        $this->assertContains('assigne', $statuts);
        $this->assertContains('resolu_en_attente_validation', $statuts);
        $this->assertNotContains('resolu', $statuts);
    }

    public function test_mes_tickets_never_exposes_the_menage_agent_description_and_audio(): void
    {
        $agent = $this->agentMaintenance();
        $this->ticket([
            'statut' => 'assigne',
            'agent_id' => $agent->id,
            'description' => 'Description du signalement ménage.',
            'photo_url' => 'signalements/photo.jpg',
            'audio_url' => 'signalements/note.mp3',
            'photo_transferee' => false,
        ]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $ticketJson = $response->json('0');
        $this->assertArrayNotHasKey('description', $ticketJson);
        $this->assertArrayNotHasKey('audio_url', $ticketJson);
        $this->assertArrayHasKey('description_manager', $ticketJson);
        $this->assertArrayHasKey('description_manager_audio_url', $ticketJson);
        $this->assertArrayHasKey('urgence', $ticketJson);
        $this->assertArrayHasKey('appartement', $ticketJson);
        $this->assertArrayHasKey('nom', $ticketJson['appartement']);
        $this->assertArrayHasKey('adresse', $ticketJson['appartement']);
    }

    public function test_mes_tickets_hides_the_original_photo_when_not_transferred(): void
    {
        $agent = $this->agentMaintenance();
        $this->ticket([
            'statut' => 'assigne',
            'agent_id' => $agent->id,
            'photo_url' => 'signalements/photo.jpg',
            'photo_transferee' => false,
        ]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonPath('0.photo_url', null);
    }

    public function test_mes_tickets_exposes_the_original_photo_when_transferred(): void
    {
        $agent = $this->agentMaintenance();
        $this->ticket([
            'statut' => 'assigne',
            'agent_id' => $agent->id,
            'photo_url' => 'signalements/photo.jpg',
            'photo_transferee' => true,
        ]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonPath('0.photo_url', 'signalements/photo.jpg');
    }

    public function test_mes_tickets_exposes_the_manager_audio_url(): void
    {
        $agent = $this->agentMaintenance();
        $this->ticket([
            'statut' => 'assigne',
            'agent_id' => $agent->id,
            'description_manager_audio_url' => 'tickets-maintenance/manager-note.webm',
        ]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonPath('0.description_manager_audio_url', 'tickets-maintenance/manager-note.webm');
    }

    public function test_mes_tickets_includes_tickets_with_statut_a_refaire(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'a_refaire', 'agent_id' => $agent->id]);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $ticket->id);
        $response->assertJsonPath('0.statut', 'a_refaire');
    }

    public function test_mes_tickets_exposes_the_reference_and_refus_history(): void
    {
        $manager = $this->actingAsManager();
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'a_refaire', 'agent_id' => $agent->id]);
        $ticket->refus()->create(['manager_id' => $manager->id, 'motif' => 'Fuite toujours présente.']);

        Sanctum::actingAs($agent, ['*']);

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertOk();
        $response->assertJsonPath('0.reference', $ticket->reference);
        $response->assertJsonCount(1, '0.refus');
        $response->assertJsonPath('0.refus.0.motif', 'Fuite toujours présente.');
        $this->assertArrayNotHasKey('manager', $response->json('0.refus.0'));
    }

    public function test_mes_tickets_is_forbidden_for_a_menage_account(): void
    {
        $this->actingAsMenage();

        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');

        $response->assertStatus(403);
    }

    public function test_mes_tickets_route_requires_maintenance_role_not_just_manager(): void
    {
        $agent = $this->agentMaintenance();
        $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);

        // A manager may call it, but must supply agent_id explicitly.
        $response = $this->getJson('/api/tickets-maintenance/mes-tickets');
        $response->assertStatus(422);

        $response = $this->getJson("/api/tickets-maintenance/mes-tickets?agent_id={$agent->id}");
        $response->assertOk();
        $response->assertJsonCount(1);
    }

    // --- resoudre() ---

    public function test_resoudre_marks_the_ticket_resolu_en_attente_validation(): void
    {
        Storage::fake('public');

        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/resoudre", [
            '_method' => 'PATCH',
            'photo_apres' => UploadedFile::fake()->image('reparation.jpg'),
            'cout_reparation' => '45.50',
            'note' => 'Joint remplacé.',
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'resolu_en_attente_validation');
        $this->assertNotNull($response->json('photo_apres'));
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'statut' => 'resolu_en_attente_validation',
            'cout_reparation' => '45.50',
            'note_resolution' => 'Joint remplacé.',
        ]);
    }

    public function test_resoudre_marks_a_ticket_a_refaire_resolu_en_attente_validation_again(): void
    {
        Storage::fake('public');

        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'a_refaire', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/resoudre", [
            '_method' => 'PATCH',
            'photo_apres' => UploadedFile::fake()->image('reparation.jpg'),
            'cout_reparation' => '30',
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'resolu_en_attente_validation');
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'statut' => 'resolu_en_attente_validation',
        ]);
    }

    public function test_resoudre_accepts_a_photo_apres_up_to_the_10mb_limit(): void
    {
        Storage::fake('public');

        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/resoudre", [
            '_method' => 'PATCH',
            'photo_apres' => UploadedFile::fake()->image('reparation.jpg')->size(10240),
            'cout_reparation' => '45.50',
        ]);

        $response->assertOk();
    }

    public function test_resoudre_rejects_a_photo_apres_over_the_10mb_limit_with_a_clear_message(): void
    {
        Storage::fake('public');

        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/resoudre", [
            '_method' => 'PATCH',
            'photo_apres' => UploadedFile::fake()->image('reparation.jpg')->size(10241),
            'cout_reparation' => '45.50',
        ]);

        $response->assertStatus(422);
        $response->assertJsonFragment(['photo_apres' => ['Photo trop lourde, réessayez avec une photo plus légère (10 Mo maximum).']]);
        $this->assertDatabaseHas('tickets_maintenance', ['id' => $ticket->id, 'statut' => 'assigne']);
    }

    public function test_resoudre_requires_photo_apres_and_cout_reparation(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/resoudre", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['photo_apres', 'cout_reparation']);
    }

    public function test_resoudre_is_rejected_when_the_ticket_is_not_assigne(): void
    {
        Storage::fake('public');

        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/resoudre", [
            '_method' => 'PATCH',
            'photo_apres' => UploadedFile::fake()->image('reparation.jpg'),
            'cout_reparation' => '10',
        ]);

        $response->assertStatus(422);
    }

    public function test_an_agent_cannot_resoudre_a_ticket_assigned_to_another_agent(): void
    {
        Storage::fake('public');

        $agentA = $this->agentMaintenance(['nom' => 'Karim B.']);
        $agentB = $this->agentMaintenance(['nom' => 'Yassine T.']);
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agentB->id]);
        Sanctum::actingAs($agentA, ['*']);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/resoudre", [
            '_method' => 'PATCH',
            'photo_apres' => UploadedFile::fake()->image('reparation.jpg'),
            'cout_reparation' => '10',
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseHas('tickets_maintenance', ['id' => $ticket->id, 'statut' => 'assigne']);
    }

    public function test_resoudre_is_forbidden_for_a_menage_account(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);
        $this->actingAsMenage();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/resoudre", []);

        $response->assertStatus(403);
    }

    public function test_manager_can_resoudre_any_ticket(): void
    {
        Storage::fake('public');

        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'assigne', 'agent_id' => $agent->id]);

        $response = $this->post("/api/tickets-maintenance/{$ticket->id}/resoudre", [
            '_method' => 'PATCH',
            'photo_apres' => UploadedFile::fake()->image('reparation.jpg'),
            'cout_reparation' => '10',
        ]);

        $response->assertOk();
    }

    // --- validerResolution() ---

    public function test_valider_resolution_marks_the_ticket_resolu(): void
    {
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'photo_apres' => 'x.jpg', 'cout_reparation' => 20]);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/valider-resolution");

        $response->assertOk();
        $response->assertJsonPath('statut', 'resolu');
        $this->assertDatabaseHas('tickets_maintenance', ['id' => $ticket->id, 'statut' => 'resolu']);
    }

    public function test_valider_resolution_is_rejected_when_not_pending_validation(): void
    {
        $ticket = $this->ticket(['statut' => 'assigne']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/valider-resolution");

        $response->assertStatus(422);
    }

    public function test_valider_resolution_is_forbidden_for_a_maintenance_account(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/valider-resolution");

        $response->assertStatus(403);
    }

    public function test_valider_resolution_is_forbidden_for_a_menage_account(): void
    {
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation']);
        $this->actingAsMenage();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/valider-resolution");

        $response->assertStatus(403);
    }

    // --- refuserResolution() ---

    public function test_refuser_resolution_requires_a_motif(): void
    {
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'photo_apres' => 'x.jpg', 'cout_reparation' => 20]);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('motif');
        $this->assertDatabaseHas('tickets_maintenance', ['id' => $ticket->id, 'statut' => 'resolu_en_attente_validation']);
    }

    public function test_refuser_resolution_moves_the_ticket_to_a_refaire(): void
    {
        $manager = $this->actingAsManager();
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket([
            'statut' => 'resolu_en_attente_validation',
            'agent_id' => $agent->id,
            'photo_apres' => 'x.jpg',
            'cout_reparation' => 20,
            'note_resolution' => 'Fait.',
        ]);
        Sanctum::actingAs($manager, ['*']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", [
            'motif' => 'La fuite persiste, à refaire.',
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'a_refaire');
        $this->assertDatabaseHas('tickets_maintenance', [
            'id' => $ticket->id,
            'statut' => 'a_refaire',
            'agent_id' => $agent->id,
            'photo_apres' => null,
            'cout_reparation' => null,
            'note_resolution' => null,
        ]);
        $this->assertDatabaseHas('ticket_maintenance_refus', [
            'ticket_maintenance_id' => $ticket->id,
            'manager_id' => $manager->id,
            'motif' => 'La fuite persiste, à refaire.',
        ]);
    }

    public function test_refuser_resolution_is_rejected_when_not_pending_validation(): void
    {
        $ticket = $this->ticket(['statut' => 'assigne']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", [
            'motif' => 'Motif quelconque.',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('ticket_maintenance_refus', 0);
    }

    public function test_refuser_resolution_keeps_every_successive_refusal_in_history(): void
    {
        $manager = $this->actingAsManager();
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'agent_id' => $agent->id]);
        Sanctum::actingAs($manager, ['*']);

        $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", ['motif' => 'Premier refus.'])
            ->assertOk();

        $ticket->refresh()->update(['statut' => 'resolu_en_attente_validation']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", ['motif' => 'Second refus.']);

        $response->assertOk();
        $this->assertDatabaseCount('ticket_maintenance_refus', 2);
        $this->assertDatabaseHas('ticket_maintenance_refus', ['ticket_maintenance_id' => $ticket->id, 'motif' => 'Premier refus.']);
        $this->assertDatabaseHas('ticket_maintenance_refus', ['ticket_maintenance_id' => $ticket->id, 'motif' => 'Second refus.']);
    }

    public function test_refuser_resolution_is_forbidden_for_a_maintenance_account(): void
    {
        $agent = $this->agentMaintenance();
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation', 'agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", [
            'motif' => 'Motif quelconque.',
        ]);

        $response->assertStatus(403);
    }

    public function test_refuser_resolution_is_forbidden_for_a_menage_account(): void
    {
        $ticket = $this->ticket(['statut' => 'resolu_en_attente_validation']);
        $this->actingAsMenage();

        $response = $this->patchJson("/api/tickets-maintenance/{$ticket->id}/refuser-resolution", [
            'motif' => 'Motif quelconque.',
        ]);

        $response->assertStatus(403);
    }

    // --- index() with resolu_en_attente_validation ---

    public function test_index_filters_by_resolu_en_attente_validation(): void
    {
        $this->ticket(['statut' => 'assigne']);
        $enAttente = $this->ticket(['statut' => 'resolu_en_attente_validation']);

        $response = $this->getJson('/api/tickets-maintenance?statut=resolu_en_attente_validation');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $enAttente->id);
    }
}
