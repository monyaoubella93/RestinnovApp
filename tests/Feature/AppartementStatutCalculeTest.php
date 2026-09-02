<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppartementStatutCalculeTest extends TestCase
{
    use RefreshDatabase;

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

    public function test_appartement_is_occupe_while_it_has_an_en_cours_sejour(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'en_cours',
            'montant_mad' => 1000,
        ]);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'occupe');
    }

    public function test_appartement_is_disponible_when_its_sejours_are_a_venir_or_termine(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-01',
            'date_depart' => '2026-09-05',
            'nom_voyageur' => 'Marie Curie',
            'statut' => 'a_venir',
            'montant_mad' => 500,
        ]);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-07-01',
            'date_depart' => '2026-07-05',
            'nom_voyageur' => 'Paul Martin',
            'statut' => 'termine',
            'montant_mad' => 300,
        ]);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'disponible');
    }

    public function test_stored_statut_column_is_never_authoritative(): void
    {
        // Directly forced to "occupe" at the DB level, with no en_cours
        // sejour -- the API must still report "disponible".
        Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'occupe']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'disponible');
    }

    public function test_it_reflects_occupe_in_the_dashboard_appartements_list_too(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'en_cours',
            'montant_mad' => 1000,
        ]);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonPath('appartements.0.statut', 'occupe');
    }

    public function test_appartement_returns_to_disponible_once_its_sejour_is_checked_out(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'en_cours',
            'montant_mad' => 1000,
        ]);

        $this->assertSame('occupe', $this->getJson('/api/appartements')->json('0.statut'));

        $sejour->update(['statut' => 'termine']);

        $response = $this->getJson('/api/appartements');
        $response->assertJsonPath('0.statut', 'disponible');
    }

    // --- en_menage ---

    public function test_appartement_is_en_menage_while_its_mission_is_a_faire(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $sejour = $this->sejourTermine($appartement);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'a_faire']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'en_menage');
    }

    public function test_appartement_is_en_menage_while_its_mission_is_en_cours(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $sejour = $this->sejourTermine($appartement);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'en_cours']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'en_menage');
    }

    public function test_appartement_is_en_menage_while_its_mission_is_en_attente_validation(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $sejour = $this->sejourTermine($appartement);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'en_attente_validation']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'en_menage');
    }

    public function test_appartement_is_disponible_once_its_mission_is_conforme(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $sejour = $this->sejourTermine($appartement);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'conforme']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'disponible');
    }

    public function test_a_current_sejour_takes_priority_over_en_menage(): void
    {
        // The appartement's previous mission is still active, but a new
        // sejour has already checked in on it.
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $sejourPrecedent = $this->sejourTermine($appartement);
        MissionMenage::create(['sejour_id' => $sejourPrecedent->id, 'statut' => 'a_faire']);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-10',
            'date_depart' => '2026-08-15',
            'nom_voyageur' => 'Marie Curie',
            'statut' => 'en_cours',
            'montant_mad' => 800,
        ]);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'occupe');
    }

    public function test_it_filters_by_statut_en_menage(): void
    {
        $enMenage = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        MissionMenage::create(['sejour_id' => $this->sejourTermine($enMenage)->id, 'statut' => 'en_cours']);

        $disponible = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $response = $this->getJson('/api/appartements?statut=en_menage&page=1');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom', 'Loft Bastille');
    }

    public function test_en_menage_is_excluded_when_filtering_by_disponible(): void
    {
        $enMenage = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        MissionMenage::create(['sejour_id' => $this->sejourTermine($enMenage)->id, 'statut' => 'en_cours']);

        $disponible = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $response = $this->getJson('/api/appartements?statut=disponible&page=1');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom', 'Zenith');
    }

    public function test_it_reflects_en_menage_in_the_dashboard_too(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        MissionMenage::create(['sejour_id' => $this->sejourTermine($appartement)->id, 'statut' => 'en_cours']);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonPath('appartements.0.statut', 'en_menage');
    }

    // --- maintenance ---

    public function test_appartement_is_maintenance_while_it_has_an_ouvert_ticket(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'ouvert']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'maintenance');
    }

    public function test_appartement_is_maintenance_while_it_has_an_assigne_ticket(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'assigne']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'maintenance');
    }

    public function test_appartement_is_not_maintenance_once_its_only_ticket_is_resolu(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'disponible');
    }

    public function test_maintenance_takes_priority_over_occupe(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'en_cours',
            'montant_mad' => 1000,
        ]);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'ouvert']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'maintenance');
    }

    public function test_maintenance_takes_priority_over_en_menage(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        MissionMenage::create(['sejour_id' => $this->sejourTermine($appartement)->id, 'statut' => 'en_cours']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'assigne']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'maintenance');
    }

    public function test_it_filters_by_statut_maintenance(): void
    {
        $maintenance = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $maintenance->id, 'statut' => 'ouvert']);

        Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $response = $this->getJson('/api/appartements?statut=maintenance&page=1');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom', 'Loft Bastille');
    }

    public function test_maintenance_is_excluded_when_filtering_by_disponible(): void
    {
        $maintenance = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $maintenance->id, 'statut' => 'ouvert']);

        Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $response = $this->getJson('/api/appartements?statut=disponible&page=1');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom', 'Zenith');
    }

    public function test_maintenance_is_excluded_when_filtering_by_occupe_even_with_an_en_cours_sejour(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'en_cours',
            'montant_mad' => 1000,
        ]);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'ouvert']);

        $response = $this->getJson('/api/appartements?statut=occupe&page=1');

        $response->assertOk();
        $response->assertJsonCount(0, 'data');
    }

    public function test_it_reflects_maintenance_in_the_dashboard_too(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'ouvert']);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonPath('appartements.0.statut', 'maintenance');
    }

    public function test_appartement_is_maintenance_while_a_resolution_awaits_validation(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu_en_attente_validation']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'maintenance');
    }

    public function test_appartement_returns_to_disponible_only_once_the_manager_validates_the_resolution(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $ticket = TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu_en_attente_validation']);

        $this->assertSame('maintenance', $this->getJson('/api/appartements')->json('0.statut'));

        $ticket->update(['statut' => 'resolu']);

        $response = $this->getJson('/api/appartements');
        $response->assertJsonPath('0.statut', 'disponible');
    }

    public function test_appartement_is_maintenance_while_its_ticket_is_a_refaire(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'a_refaire']);

        $response = $this->getJson('/api/appartements');

        $response->assertOk();
        $response->assertJsonPath('0.statut', 'maintenance');
    }

    public function test_appartement_returns_to_disponible_only_once_the_manager_validates_after_a_refaire(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $ticket = TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'a_refaire']);

        $this->assertSame('maintenance', $this->getJson('/api/appartements')->json('0.statut'));

        $ticket->update(['statut' => 'resolu_en_attente_validation']);
        $this->assertSame('maintenance', $this->getJson('/api/appartements')->json('0.statut'));

        $ticket->update(['statut' => 'resolu']);

        $response = $this->getJson('/api/appartements');
        $response->assertJsonPath('0.statut', 'disponible');
    }

    public function test_it_filters_by_statut_maintenance_including_a_refaire(): void
    {
        $maintenance = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $maintenance->id, 'statut' => 'a_refaire']);

        Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $response = $this->getJson('/api/appartements?statut=maintenance&page=1');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom', 'Loft Bastille');
    }

    public function test_it_filters_by_statut_maintenance_including_en_cours(): void
    {
        $maintenance = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $maintenance->id, 'statut' => 'en_cours']);

        Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $response = $this->getJson('/api/appartements?statut=maintenance&page=1');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom', 'Loft Bastille');
    }

    public function test_it_filters_by_statut_maintenance_including_resolu_en_attente_validation(): void
    {
        $maintenance = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        TicketMaintenance::create(['appartement_id' => $maintenance->id, 'statut' => 'resolu_en_attente_validation']);

        Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $response = $this->getJson('/api/appartements?statut=maintenance&page=1');

        $response->assertOk();
        $response->assertJsonCount(1, 'data');
        $response->assertJsonPath('data.0.nom', 'Loft Bastille');
    }
}
