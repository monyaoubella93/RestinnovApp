<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MaintenanceAlerte;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class VerifierRetardsMaintenanceTest extends TestCase
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

    private function agentMaintenance(): Utilisateur
    {
        return Utilisateur::create(['nom' => 'Karim B.', 'role' => 'maintenance']);
    }

    private function ticket(Appartement $appartement, array $overrides = []): TicketMaintenance
    {
        return TicketMaintenance::create(array_merge([
            'appartement_id' => $appartement->id,
            'description' => 'Robinet qui fuit.',
            'statut' => 'assigne',
        ], $overrides));
    }

    public function test_it_sends_a_rappel_when_the_deadline_is_tomorrow_and_the_agent_has_not_started(): void
    {
        $appartement = $this->appartement();
        $ticket = $this->ticket($appartement, [
            'statut' => 'assigne',
            'agent_id' => $this->agentMaintenance()->id,
            'date_limite_intervention' => Carbon::tomorrow()->toDateString(),
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseHas('maintenance_alertes', [
            'ticket_maintenance_id' => $ticket->id,
            'niveau' => 'rappel',
            'message' => "Le ticket {$ticket->reference} arrive à échéance demain et l'agent n'a pas encore commencé.",
        ]);
    }

    public function test_it_does_not_send_a_rappel_once_the_agent_has_started(): void
    {
        $appartement = $this->appartement();
        $this->ticket($appartement, [
            'statut' => 'en_cours',
            'agent_id' => $this->agentMaintenance()->id,
            'date_limite_intervention' => Carbon::tomorrow()->toDateString(),
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseCount('maintenance_alertes', 0);
    }

    public function test_it_sends_an_urgente_alert_when_the_deadline_has_passed(): void
    {
        $agent = $this->agentMaintenance();
        $appartement = $this->appartement();
        $ticket = $this->ticket($appartement, [
            'statut' => 'assigne',
            'agent_id' => $agent->id,
            'date_limite_intervention' => Carbon::yesterday()->toDateString(),
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseHas('maintenance_alertes', [
            'ticket_maintenance_id' => $ticket->id,
            'niveau' => 'urgente',
            'message' => "Le ticket {$ticket->reference} est en retard, contactez l'agent {$agent->nom}.",
        ]);
    }

    public function test_it_does_not_send_an_urgente_alert_on_the_deadline_day_itself(): void
    {
        $appartement = $this->appartement();
        $this->ticket($appartement, [
            'statut' => 'assigne',
            'agent_id' => $this->agentMaintenance()->id,
            'date_limite_intervention' => Carbon::today()->toDateString(),
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseCount('maintenance_alertes', 0);
    }

    public function test_it_sends_a_critique_alert_when_a_sejour_is_arriving_soon_even_without_a_deadline(): void
    {
        $appartement = $this->appartement();
        $ticket = $this->ticket($appartement, ['statut' => 'ouvert', 'date_limite_intervention' => null]);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => Carbon::tomorrow()->toDateString(),
            'date_depart' => Carbon::tomorrow()->addDays(3)->toDateString(),
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseHas('maintenance_alertes', [
            'ticket_maintenance_id' => $ticket->id,
            'niveau' => 'critique',
        ]);
    }

    public function test_it_does_not_send_a_critique_alert_when_the_sejour_is_further_than_the_margin(): void
    {
        $appartement = $this->appartement();
        $this->ticket($appartement, ['statut' => 'ouvert']);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => Carbon::today()->addDays(5)->toDateString(),
            'date_depart' => Carbon::today()->addDays(8)->toDateString(),
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseCount('maintenance_alertes', 0);
    }

    public function test_critique_takes_priority_over_urgente_and_rappel_for_the_same_ticket(): void
    {
        $agent = $this->agentMaintenance();
        $appartement = $this->appartement();
        $ticket = $this->ticket($appartement, [
            'statut' => 'assigne',
            'agent_id' => $agent->id,
            // Also overdue, which alone would fire "urgente" -- critique
            // must win instead.
            'date_limite_intervention' => Carbon::yesterday()->toDateString(),
        ]);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => Carbon::today()->toDateString(),
            'date_depart' => Carbon::today()->addDays(2)->toDateString(),
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseCount('maintenance_alertes', 1);
        $this->assertDatabaseHas('maintenance_alertes', [
            'ticket_maintenance_id' => $ticket->id,
            'niveau' => 'critique',
        ]);
    }

    public function test_it_never_creates_more_than_one_alert_per_ticket_per_day_even_run_twice(): void
    {
        $appartement = $this->appartement();
        $this->ticket($appartement, [
            'statut' => 'assigne',
            'agent_id' => $this->agentMaintenance()->id,
            'date_limite_intervention' => Carbon::yesterday()->toDateString(),
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();
        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseCount('maintenance_alertes', 1);
    }

    public function test_it_skips_tickets_that_are_already_resolu(): void
    {
        $appartement = $this->appartement();
        $this->ticket($appartement, [
            'statut' => 'resolu',
            'agent_id' => $this->agentMaintenance()->id,
            'date_limite_intervention' => Carbon::yesterday()->toDateString(),
        ]);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => Carbon::today()->toDateString(),
            'date_depart' => Carbon::today()->addDays(2)->toDateString(),
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'a_venir',
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseCount('maintenance_alertes', 0);
    }

    public function test_it_does_nothing_when_no_condition_is_met(): void
    {
        $appartement = $this->appartement();
        $this->ticket($appartement, [
            'statut' => 'assigne',
            'agent_id' => $this->agentMaintenance()->id,
            'date_limite_intervention' => Carbon::today()->addDays(10)->toDateString(),
        ]);

        $this->artisan('maintenance:verifier-retards')->assertSuccessful();

        $this->assertDatabaseCount('maintenance_alertes', 0);
    }
}
