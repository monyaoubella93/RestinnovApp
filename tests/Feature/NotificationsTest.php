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
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'urgence' => 'basse', 'statut' => 'en_cours']);
        // Not surfaced: already resolved, or awaiting the Manager's own validation.
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu_en_attente_validation']);

        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('problemes_signales_count', 3);
        $response->assertJsonCount(3, 'problemes_signales');
        $response->assertJsonPath('problemes_signales.0.appartement.nom', 'Loft Bastille');
        $response->assertJsonPath('problemes_signales.0.appartement.adresse', '12 rue de la Roquette');
        $response->assertJsonPath('problemes_signales.0.urgence', 'basse');
    }

    public function test_it_counts_and_lists_unresolved_ticket_alertes_as_alertes_maintenance(): void
    {
        $appartement = $this->appartement(['nom' => 'Zenith', 'adresse' => '5 avenue de la Paix']);
        $ticketNonResolu = TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'en_cours']);
        $ticketResolu = TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu']);

        MaintenanceAlerte::create([
            'ticket_maintenance_id' => $ticketNonResolu->id,
            'niveau' => 'urgente',
            'message' => "Le ticket {$ticketNonResolu->reference} est en retard, contactez l'agent.",
        ]);
        // Not surfaced: its ticket is already "resolu".
        MaintenanceAlerte::create([
            'ticket_maintenance_id' => $ticketResolu->id,
            'niveau' => 'rappel',
            'message' => 'Alerte obsolète.',
        ]);

        $response = $this->getJson('/api/notifications');

        $response->assertOk();
        $response->assertJsonPath('alertes_maintenance_count', 1);
        $response->assertJsonCount(1, 'alertes_maintenance');
        $response->assertJsonPath('alertes_maintenance.0.niveau', 'urgente');
        $response->assertJsonPath('alertes_maintenance.0.ticket_maintenance_id', $ticketNonResolu->id);
        $response->assertJsonPath('alertes_maintenance.0.appartement.nom', 'Zenith');
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
