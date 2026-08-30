<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\AuditLog;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppartementDeletionTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(string $nom = 'Loft Bastille'): Appartement
    {
        return Appartement::create(['nom' => $nom, 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
    }

    public function test_manager_can_soft_delete_an_appartement_with_no_active_link(): void
    {
        $appartement = $this->appartement();

        $response = $this->deleteJson("/api/appartements/{$appartement->id}");

        $response->assertStatus(204);
        $this->assertSoftDeleted('appartements', ['id' => $appartement->id]);
    }

    public function test_a_deleted_appartement_disappears_from_the_listing(): void
    {
        $appartement = $this->appartement();
        $this->deleteJson("/api/appartements/{$appartement->id}")->assertStatus(204);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonMissing(['id' => $appartement->id]);
    }

    public function test_it_logs_who_did_it_when_and_which_appartement(): void
    {
        $manager = $this->actingAsManager();
        $appartement = $this->appartement('Zenith');

        $this->deleteJson("/api/appartements/{$appartement->id}")->assertStatus(204);

        $this->assertDatabaseCount('audit_logs', 1);
        $log = AuditLog::first();
        $this->assertSame($manager->id, $log->utilisateur_id);
        $this->assertSame('appartement.supprime', $log->action);
        $this->assertStringContainsString('Zenith', $log->cible);
        $this->assertStringContainsString((string) $appartement->id, $log->cible);
        $this->assertNotNull($log->created_at);
    }

    private function assertBlockedBySejourStatut(string $statut): void
    {
        $appartement = $this->appartement();
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-01',
            'date_depart' => '2026-09-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => $statut,
        ]);

        $response = $this->deleteJson("/api/appartements/{$appartement->id}");

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Impossible de supprimer : cet appartement a des séjours actifs ou à venir.');
        $this->assertDatabaseHas('appartements', ['id' => $appartement->id, 'deleted_at' => null]);
    }

    public function test_it_blocks_deletion_when_a_sejour_is_a_venir(): void
    {
        $this->assertBlockedBySejourStatut('a_venir');
    }

    public function test_it_blocks_deletion_when_a_sejour_is_en_cours(): void
    {
        $this->assertBlockedBySejourStatut('en_cours');
    }

    private function assertAllowedWithSejourStatut(string $statut): void
    {
        $appartement = $this->appartement();
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => $statut,
        ]);

        $response = $this->deleteJson("/api/appartements/{$appartement->id}");

        $response->assertStatus(204);
        $this->assertSoftDeleted('appartements', ['id' => $appartement->id]);
    }

    public function test_it_allows_deletion_when_every_sejour_is_termine(): void
    {
        $this->assertAllowedWithSejourStatut('termine');
    }

    public function test_it_allows_deletion_when_every_sejour_is_annule(): void
    {
        $this->assertAllowedWithSejourStatut('annule');
    }

    private function assertBlockedByTicketStatut(string $statut): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create([
            'appartement_id' => $appartement->id,
            'description' => 'Robinet qui fuit.',
            'statut' => $statut,
        ]);

        $response = $this->deleteJson("/api/appartements/{$appartement->id}");

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Impossible de supprimer : cet appartement a un ticket de maintenance non résolu.');
        $this->assertDatabaseHas('appartements', ['id' => $appartement->id, 'deleted_at' => null]);
    }

    public function test_it_blocks_deletion_when_a_ticket_is_ouvert(): void
    {
        $this->assertBlockedByTicketStatut('ouvert');
    }

    public function test_it_blocks_deletion_when_a_ticket_is_assigne(): void
    {
        $this->assertBlockedByTicketStatut('assigne');
    }

    public function test_it_blocks_deletion_when_a_ticket_is_resolu_en_attente_validation(): void
    {
        $this->assertBlockedByTicketStatut('resolu_en_attente_validation');
    }

    public function test_it_blocks_deletion_when_a_ticket_is_a_refaire(): void
    {
        $this->assertBlockedByTicketStatut('a_refaire');
    }

    public function test_it_allows_deletion_when_every_ticket_is_resolved(): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create([
            'appartement_id' => $appartement->id,
            'description' => 'Robinet qui fuit.',
            'statut' => 'resolu',
        ]);

        $response = $this->deleteJson("/api/appartements/{$appartement->id}");

        $response->assertStatus(204);
        $this->assertSoftDeleted('appartements', ['id' => $appartement->id]);
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $appartement = $this->appartement();
        $this->actingAsMenage();

        $response = $this->deleteJson("/api/appartements/{$appartement->id}");

        $response->assertStatus(403);
        $this->assertDatabaseHas('appartements', ['id' => $appartement->id, 'deleted_at' => null]);
    }

    public function test_it_is_forbidden_for_a_maintenance_account(): void
    {
        $appartement = $this->appartement();
        $this->actingAsMaintenance();

        $response = $this->deleteJson("/api/appartements/{$appartement->id}");

        $response->assertStatus(403);
        $this->assertDatabaseHas('appartements', ['id' => $appartement->id, 'deleted_at' => null]);
    }
}
