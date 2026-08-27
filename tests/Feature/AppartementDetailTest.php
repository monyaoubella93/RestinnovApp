<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChargeAppartement;
use App\Models\ChecklistModele;
use App\Models\MissionMenage;
use App\Models\Proprietaire;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppartementDetailTest extends TestCase
{
    use RefreshDatabase;

    private function ticket(Appartement $appartement, array $overrides = []): TicketMaintenance
    {
        return TicketMaintenance::create(array_merge([
            'appartement_id' => $appartement->id,
            'description' => 'Robinet qui fuit.',
            'statut' => 'ouvert',
        ], $overrides));
    }

    public function test_it_returns_404_for_an_unknown_appartement(): void
    {
        $this->getJson('/api/appartements/999')->assertNotFound();
    }

    public function test_it_gathers_checklists_agent_habituel_and_sejours_stats(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        $agent = Utilisateur::factory()->menage()->create(['nom' => 'Fatima']);

        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => '12 rue de la Roquette',
            'statut' => 'disponible',
            'photo_principale' => 'appartements/loft.jpg',
            'agent_habituel_id' => $agent->id,
        ]);
        $appartement->checklistModeles()->sync([$standard->id]);

        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
        ]);
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-02-01',
            'date_depart' => '2026-02-05',
            'nom_voyageur' => 'Marie Curie',
            'statut' => 'termine',
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonPath('appartement.nom', 'Loft Bastille');
        $response->assertJsonPath('appartement.photo_principale', 'appartements/loft.jpg');
        $response->assertJsonPath('appartement.statut', 'disponible');
        $response->assertJsonPath('appartement.checklist_modeles.0.nom', 'Standard');
        $response->assertJsonPath('appartement.agent_habituel.nom', 'Fatima');
        $response->assertJsonPath('appartement.sejours_count', 2);
        $response->assertJsonPath('appartement.dernier_sejour', '2026-02-05');
    }

    public function test_it_includes_the_proprietaire_and_active_charges(): void
    {
        $proprietaire = Proprietaire::create([
            'nom' => 'Karim Alaoui',
            'telephone' => '0600000000',
            'email' => 'karim@example.com',
        ]);

        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'proprietaire_id' => $proprietaire->id,
            'mode_gestion' => 'mandat',
            'taux_commission' => 20,
        ]);

        $appartement->chargesAppartement()->create([
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => ChargeAppartement::FREQUENCE_MENSUEL,
            'a_charge_de' => ChargeAppartement::A_CHARGE_RESTINNOV,
            'date_debut' => '2026-01-01',
        ]);
        // Closed before today -- must not appear among active charges.
        $appartement->chargesAppartement()->create([
            'nom_service' => 'Netflix',
            'montant' => 80,
            'frequence' => ChargeAppartement::FREQUENCE_MENSUEL,
            'a_charge_de' => ChargeAppartement::A_CHARGE_PROPRIETAIRE,
            'date_debut' => '2025-01-01',
            'date_fin' => '2025-06-01',
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonPath('appartement.proprietaire.nom', 'Karim Alaoui');
        $response->assertJsonPath('appartement.mode_gestion', 'mandat');
        $response->assertJsonPath('appartement.taux_commission', '20.00');
        $response->assertJsonCount(1, 'appartement.charges_actives');
        $response->assertJsonPath('appartement.charges_actives.0.nom_service', 'WiFi');
        $response->assertJsonPath('appartement.charges_actives.0.a_charge_de', 'restinnov');
    }

    public function test_it_reuses_the_releve_calculation_for_the_current_months_financial_summary(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $debutMois = now()->startOfMonth();

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => $debutMois->copy()->addDays(2)->toDateString(),
            'date_depart' => $debutMois->copy()->addDays(5)->toDateString(),
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'conforme', 'frais_forfait' => 80]);

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonPath('resume_financier.mois', now()->format('Y-m'));
        $response->assertJsonPath('resume_financier.revenus_bruts', 1000);
        $response->assertJsonPath('resume_financier.frais_menage_total', 80);
        $response->assertJsonPath('resume_financier.frais_maintenance_total', 0);
        $response->assertJsonPath('resume_financier.resultat_net', 920);
    }

    public function test_it_excludes_sejours_outside_the_current_month_from_the_financial_summary(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => now()->subMonths(2)->toDateString(),
            'date_depart' => now()->subMonths(2)->addDays(3)->toDateString(),
            'nom_voyageur' => 'Ancien voyageur',
            'statut' => 'termine',
            'montant_mad' => 5000,
        ]);

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonPath('resume_financier.revenus_bruts', 0);
    }

    public function test_it_lists_linked_maintenance_tickets_with_their_statut(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $this->ticket($appartement, ['statut' => 'ouvert']);
        $this->ticket($appartement, ['statut' => 'resolu', 'cout_reparation' => 45.5]);

        $autreAppartement = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);
        $this->ticket($autreAppartement, ['statut' => 'ouvert']);

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonCount(2, 'tickets_maintenance');
        $statuts = collect($response->json('tickets_maintenance'))->pluck('statut')->sort()->values();
        $this->assertSame(['ouvert', 'resolu'], $statuts->all());
    }

    public function test_it_flags_the_appartement_as_recurrent_with_three_or_more_recent_tickets(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $this->ticket($appartement);
        $this->ticket($appartement);
        $this->ticket($appartement);

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonPath('tickets_maintenance_recurrent', true);
    }

    public function test_it_does_not_flag_the_appartement_as_recurrent_with_fewer_than_three_recent_tickets(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $this->ticket($appartement);
        $this->ticket($appartement);

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonPath('tickets_maintenance_recurrent', false);
    }

    public function test_recurrent_ignores_tickets_older_than_the_recurrence_window(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $this->ticket($appartement)->forceFill(['created_at' => now()->subMonths(3)])->save();
        $this->ticket($appartement)->forceFill(['created_at' => now()->subMonths(3)])->save();
        $this->ticket($appartement)->forceFill(['created_at' => now()->subMonths(3)])->save();

        $response = $this->getJson("/api/appartements/{$appartement->id}");

        $response->assertOk();
        $response->assertJsonPath('tickets_maintenance_recurrent', false);
    }
}
