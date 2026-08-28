<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MaintenanceAlerte;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationsTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(array $overrides = []): Appartement
    {
        return Appartement::create(array_merge([
            'nom' => 'Loft Bastille',
            'adresse' => '12 rue de la Roquette',
            'statut' => 'disponible',
        ], $overrides));
    }

    private function sejourTermine(Appartement $appartement): Sejour
    {
        return Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);
    }

    public function test_it_returns_zeroed_counts_and_empty_lists_when_there_is_no_data(): void
    {
        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('problemes_signales_count', 0);
        $response->assertJsonPath('menages_a_valider_count', 0);
        $response->assertJsonPath('alertes_maintenance_count', 0);
        $response->assertJsonPath('problemes_signales', []);
        $response->assertJsonPath('menages_a_valider', []);
        $response->assertJsonPath('alertes_maintenance', []);
    }

    public function test_it_counts_and_lists_unresolved_tickets_as_problemes_signales(): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'urgence' => 'haute', 'statut' => 'ouvert']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'urgence' => 'normale', 'statut' => 'assigne']);
        // Not surfaced: already resolved, or awaiting the Manager's own validation.
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu_en_attente_validation']);

        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('problemes_signales_count', 2);
        $response->assertJsonCount(2, 'problemes_signales');
        $response->assertJsonPath('problemes_signales.0.appartement.nom', 'Loft Bastille');
        $response->assertJsonPath('problemes_signales.0.appartement.adresse', '12 rue de la Roquette');
        $response->assertJsonPath('problemes_signales.0.urgence', 'normale');
    }

    public function test_a_ticket_en_cours_is_still_counted_as_a_probleme_signale(): void
    {
        $appartement = $this->appartement();
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'urgence' => 'normale', 'statut' => 'en_cours']);

        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('problemes_signales_count', 1);
    }

    public function test_it_counts_and_lists_maintenance_alertes_for_unresolved_tickets(): void
    {
        $appartement = $this->appartement(['nom' => 'Zenith', 'adresse' => '5 avenue de la Paix']);
        $ticket = TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'en_cours']);
        MaintenanceAlerte::create([
            'ticket_maintenance_id' => $ticket->id,
            'niveau' => 'urgente',
            'message' => "Le ticket {$ticket->reference} est en retard, contactez l'agent Karim B.",
        ]);

        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('alertes_maintenance_count', 1);
        $response->assertJsonPath('alertes_maintenance.0.niveau', 'urgente');
        $response->assertJsonPath('alertes_maintenance.0.appartement.nom', 'Zenith');
    }

    public function test_maintenance_alertes_disappear_once_their_ticket_is_resolu(): void
    {
        $appartement = $this->appartement();
        $ticket = TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu']);
        MaintenanceAlerte::create([
            'ticket_maintenance_id' => $ticket->id,
            'niveau' => 'urgente',
            'message' => 'Ancienne alerte.',
        ]);

        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('alertes_maintenance_count', 0);
    }

    public function test_it_counts_and_lists_en_attente_validation_missions_as_menages_a_valider(): void
    {
        $appartement = $this->appartement(['nom' => 'Zenith', 'adresse' => '5 avenue de la Paix']);
        $sejour = $this->sejourTermine($appartement);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'en_attente_validation']);
        // Not surfaced: not awaiting validation.
        $autreSejour = $this->sejourTermine($appartement);
        MissionMenage::create(['sejour_id' => $autreSejour->id, 'statut' => 'a_faire']);

        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('menages_a_valider_count', 1);
        $response->assertJsonCount(1, 'menages_a_valider');
        $response->assertJsonPath('menages_a_valider.0.nom_voyageur', 'Jean Dupont');
        $response->assertJsonPath('menages_a_valider.0.appartement.nom', 'Zenith');
        $response->assertJsonPath('menages_a_valider.0.appartement.adresse', '5 avenue de la Paix');
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $this->actingAsMenage();

        $response = $this->getJson('/api/notifications');

        $response->assertStatus(403);
    }

    public function test_it_is_forbidden_for_a_maintenance_account(): void
    {
        $this->actingAsMaintenance();

        $response = $this->getJson('/api/notifications');

        $response->assertStatus(403);
    }
}
