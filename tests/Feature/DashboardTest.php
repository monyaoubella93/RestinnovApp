<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\FraisMaintenance;
use App\Models\MissionMenage;
use App\Models\ProduitMenageCatalogue;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Voyageur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_zeroed_aggregates_when_there_is_no_data(): void
    {
        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonPath('revenus_totaux', 0);
        $response->assertJsonPath('frais_menage_totaux', 0);
        $response->assertJsonPath('frais_maintenance_totaux', 0);
        $response->assertJsonPath('resultat_net', 0);
        $response->assertJsonPath('appartements', []);
        $response->assertJsonPath('sejours_par_statut.a_venir', 0);
        $response->assertJsonPath('sejours_par_statut.en_cours', 0);
        $response->assertJsonPath('sejours_par_statut.termine', 0);
        $response->assertJsonPath('sejours_recents', []);
        $response->assertJsonPath('departs_aujourdhui', []);
        $response->assertJsonPath('problemes_signales', []);
        $response->assertJsonPath('menages_a_valider', []);
        $response->assertJsonPath('resolutions_a_valider', []);
    }

    public function test_it_aggregates_revenus_frais_and_resultat_net(): void
    {
        $appartement1 = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement2 = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'occupe']);

        $sejour1 = Sejour::create([
            'appartement_id' => $appartement1->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);
        Sejour::create([
            'appartement_id' => $appartement2->id,
            'date_arrivee' => '2026-02-01',
            'date_depart' => '2026-02-05',
            'nom_voyageur' => 'Marie Curie',
            'statut' => 'a_venir',
            'montant_mad' => 500,
        ]);
        Sejour::create([
            'appartement_id' => $appartement2->id,
            'date_arrivee' => '2026-03-01',
            'date_depart' => '2026-03-05',
            'nom_voyageur' => 'Paul Martin',
            'statut' => 'en_cours',
            'montant_mad' => 300,
        ]);

        $mission = MissionMenage::create([
            'sejour_id' => $sejour1->id,
            'statut' => 'a_faire',
            'frais_forfait' => 80,
        ]);
        $produit1 = ProduitMenageCatalogue::create(['nom' => 'Javel', 'prix' => 12.5, 'actif' => true]);
        $produit2 = ProduitMenageCatalogue::create(['nom' => 'Sac poubelle', 'prix' => 7.5, 'actif' => true]);
        $mission->produits()->attach([
            $produit1->id => ['type_utilisation' => 'rachete', 'prix_paye' => 12.5],
            $produit2->id => ['type_utilisation' => 'rachete', 'prix_paye' => 7.5],
        ]);

        FraisMaintenance::create(['sejour_id' => $sejour1->id, 'description' => 'Réparation robinet', 'prix' => 250]);
        FraisMaintenance::create(['sejour_id' => $sejour1->id, 'description' => 'Peinture', 'prix' => 100]);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        // revenus = 1000 + 500 + 300
        $response->assertJsonPath('revenus_totaux', 1800);
        // frais menage = forfait 80 + produits (12.5 + 7.5)
        $response->assertJsonPath('frais_menage_totaux', 100);
        // frais maintenance = 250 + 100
        $response->assertJsonPath('frais_maintenance_totaux', 350);
        // resultat net = 1800 - 100 - 350
        $response->assertJsonPath('resultat_net', 1350);

        $response->assertJsonCount(2, 'appartements');
        $response->assertJsonPath('sejours_par_statut.a_venir', 1);
        $response->assertJsonPath('sejours_par_statut.en_cours', 1);
        $response->assertJsonPath('sejours_par_statut.termine', 1);
    }

    public function test_it_lists_appartements_with_their_statut(): void
    {
        Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $zenith = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        // "occupe" is derived from a live en_cours sejour, never from the
        // stored statut column.
        Sejour::create([
            'appartement_id' => $zenith->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Paul Martin',
            'statut' => 'en_cours',
            'montant_mad' => 300,
        ]);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonFragment(['nom' => 'Loft Bastille', 'statut' => 'disponible']);
        $response->assertJsonFragment(['nom' => 'Zenith', 'statut' => 'occupe']);
    }

    public function test_it_reports_the_sejour_count_and_last_sejour_date_per_appartement(): void
    {
        $appartement1 = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement2 = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'occupe']);

        Sejour::create([
            'appartement_id' => $appartement1->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);
        Sejour::create([
            'appartement_id' => $appartement1->id,
            'date_arrivee' => '2026-03-01',
            'date_depart' => '2026-03-05',
            'nom_voyageur' => 'Paul Martin',
            'statut' => 'a_venir',
            'montant_mad' => 300,
        ]);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonFragment([
            'nom' => 'Loft Bastille',
            'sejours_count' => 2,
            'dernier_sejour' => '2026-03-05',
        ]);
        $response->assertJsonFragment([
            'nom' => 'Zenith',
            'sejours_count' => 0,
            'dernier_sejour' => null,
        ]);
    }

    public function test_it_lists_the_10_most_recently_created_sejours_with_their_appartement(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        for ($i = 1; $i <= 12; $i++) {
            Sejour::create([
                'appartement_id' => $appartement->id,
                'date_arrivee' => '2026-01-'.str_pad((string) $i, 2, '0', STR_PAD_LEFT),
                'date_depart' => '2026-01-'.str_pad((string) ($i + 1), 2, '0', STR_PAD_LEFT),
                'nom_voyageur' => "Voyageur {$i}",
                'statut' => 'a_venir',
                'montant_mad' => 100,
            ]);
        }

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonCount(10, 'sejours_recents');
        // The most recently created sejour (Voyageur 12) comes first.
        $response->assertJsonPath('sejours_recents.0.nom_voyageur', 'Voyageur 12');
        $response->assertJsonPath('sejours_recents.0.appartement.nom', 'Loft Bastille');
        $response->assertJsonPath('sejours_recents.0.date_arrivee', '2026-01-12');
        $response->assertJsonPath('sejours_recents.0.statut', 'a_venir');
        $response->assertJsonPath('sejours_recents.9.nom_voyageur', 'Voyageur 3');
    }

    public function test_it_lists_en_cours_sejours_departing_today_with_voyageur_principal_and_telephone(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        // Departs today, en_cours -- must appear.
        $departToday = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => now()->subDays(2)->toDateString(),
            'date_depart' => now()->toDateString(),
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'en_cours',
            'montant_mad' => 300,
        ]);
        Voyageur::create([
            'sejour_id' => $departToday->id,
            'nom' => 'Jean Dupont',
            'est_principal' => true,
            'type' => 'adulte',
            'telephone' => '+212600000000',
        ]);
        Voyageur::create([
            'sejour_id' => $departToday->id,
            'nom' => 'Petit Dupont',
            'est_principal' => false,
            'type' => 'enfant',
        ]);

        // Departs today but not en_cours -- must be excluded.
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => now()->subDays(2)->toDateString(),
            'date_depart' => now()->toDateString(),
            'nom_voyageur' => 'Marie Curie',
            'statut' => 'a_venir',
            'montant_mad' => 300,
        ]);

        // en_cours but departs tomorrow -- must be excluded.
        Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => now()->subDay()->toDateString(),
            'date_depart' => now()->addDay()->toDateString(),
            'nom_voyageur' => 'Paul Martin',
            'statut' => 'en_cours',
            'montant_mad' => 300,
        ]);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonCount(1, 'departs_aujourdhui');
        $response->assertJsonPath('departs_aujourdhui.0.reference', $departToday->reference);
        $response->assertJsonPath('departs_aujourdhui.0.voyageur_principal', 'Jean Dupont');
        $response->assertJsonPath('departs_aujourdhui.0.telephone_voyageur', '+212600000000');
        $response->assertJsonPath('departs_aujourdhui.0.appartement.nom', 'Loft Bastille');
    }

    public function test_it_lists_unresolved_tickets_as_problemes_signales(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
        TicketMaintenance::create([
            'appartement_id' => $appartement->id,
            'photo_url' => 'tickets-maintenance/photo.jpg',
            'description' => 'La chasse d\'eau ne fonctionne plus.',
            'urgence' => 'haute',
            'statut' => 'ouvert',
        ]);
        TicketMaintenance::create([
            'appartement_id' => $appartement->id,
            'statut' => 'assigne',
        ]);
        // Resolved tickets are not a problem to surface anymore.
        TicketMaintenance::create([
            'appartement_id' => $appartement->id,
            'statut' => 'resolu',
        ]);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonCount(2, 'problemes_signales');
        $response->assertJsonFragment([
            'photo_url' => 'tickets-maintenance/photo.jpg',
            'description' => 'La chasse d\'eau ne fonctionne plus.',
            'urgence' => 'haute',
            'statut' => 'ouvert',
        ]);
        $response->assertJsonPath('problemes_signales.0.appartement.adresse', '12 rue de la Roquette');
    }

    public function test_it_lists_en_attente_validation_missions_as_menages_a_valider(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
            'montant_mad' => 1000,
        ]);
        MissionMenage::create(['sejour_id' => $sejour->id, 'statut' => 'en_attente_validation']);
        // Missions in other statuts are not awaiting validation.
        $autreSejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-09-01',
            'date_depart' => '2026-09-05',
            'nom_voyageur' => 'Marie Curie',
            'statut' => 'termine',
            'montant_mad' => 500,
        ]);
        MissionMenage::create(['sejour_id' => $autreSejour->id, 'statut' => 'a_faire']);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonCount(1, 'menages_a_valider');
        $response->assertJsonPath('menages_a_valider.0.nom_voyageur', 'Jean Dupont');
        $response->assertJsonPath('menages_a_valider.0.appartement.adresse', '12 rue de la Roquette');
    }

    public function test_it_lists_resolutions_en_attente_validation_as_resolutions_a_valider(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
        TicketMaintenance::create([
            'appartement_id' => $appartement->id,
            'description_manager' => 'Changer le joint du robinet.',
            'photo_apres' => 'tickets-maintenance/apres.jpg',
            'cout_reparation' => 45.5,
            'statut' => 'resolu_en_attente_validation',
        ]);
        // Other statuts are not awaiting the Manager's validation.
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'assigne']);
        TicketMaintenance::create(['appartement_id' => $appartement->id, 'statut' => 'resolu']);

        $response = $this->getJson('/api/dashboard');

        $response->assertOk();
        $response->assertJsonCount(1, 'resolutions_a_valider');
        $response->assertJsonPath('resolutions_a_valider.0.description_manager', 'Changer le joint du robinet.');
        $response->assertJsonPath('resolutions_a_valider.0.photo_apres', 'tickets-maintenance/apres.jpg');
        $response->assertJsonPath('resolutions_a_valider.0.cout_reparation', '45.50');
        $response->assertJsonPath('resolutions_a_valider.0.appartement.adresse', '12 rue de la Roquette');
    }
}
