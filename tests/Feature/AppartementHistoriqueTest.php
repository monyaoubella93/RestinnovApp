<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChecklistModele;
use App\Models\ChecklistModeleItem;
use App\Models\MissionMenage;
use App\Models\ProduitMenageCatalogue;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppartementHistoriqueTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_returns_an_empty_history_when_the_appartement_has_no_past_mission(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->getJson("/api/appartements/{$appartement->id}/historique");

        $response->assertOk();
        $response->assertJson([]);
    }

    public function test_it_lists_past_missions_most_recent_first_with_checklist_produits_and_frais(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create(['checklist_modele_id' => $standard->id, 'libelle' => 'Passer l\'aspirateur', 'ordre' => 0]);

        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement->checklistModeles()->sync([$standard->id]);

        $produit = ProduitMenageCatalogue::create(['nom' => 'Javel', 'prix' => 12.5, 'actif' => true]);

        $sejour1 = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        $this->patchJson("/api/sejours/{$sejour1->id}/checkout")->assertOk();
        $mission1 = MissionMenage::where('sejour_id', $sejour1->id)->firstOrFail();
        $mission1->update(['frais_forfait' => 50, 'statut' => MissionMenage::STATUT_CONFORME]);
        $mission1->produits()->attach($produit->id, ['type_utilisation' => 'rachete', 'prix_paye' => 12.5]);
        $mission1->checklistItems()->update(['coche' => true]);

        $sejour2 = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-02-01',
            'date_depart' => '2026-02-05',
            'nom_voyageur' => 'Marie Curie',
        ]);
        $this->patchJson("/api/sejours/{$sejour2->id}/checkout")->assertOk();
        $mission2 = MissionMenage::where('sejour_id', $sejour2->id)->firstOrFail();

        $response = $this->getJson("/api/appartements/{$appartement->id}/historique");

        $response->assertOk();
        $response->assertJsonCount(2);

        // Most recent sejour (Marie Curie, February) comes first.
        $response->assertJsonPath('0.sejour.nom_voyageur', 'Marie Curie');
        $response->assertJsonPath('0.statut', MissionMenage::STATUT_A_FAIRE);
        $response->assertJsonPath('0.checklist_items.0.coche', false);

        $response->assertJsonPath('1.sejour.nom_voyageur', 'Jean Dupont');
        $response->assertJsonPath('1.id', $mission1->id);
        $response->assertJsonPath('1.statut', 'conforme');
        $response->assertJsonPath('1.checklist_modeles_utilises', ['Standard']);
        $response->assertJsonPath('1.checklist_items.0.libelle', "Passer l'aspirateur");
        $response->assertJsonPath('1.checklist_items.0.coche', true);
        $response->assertJsonPath('1.produits.0.nom', 'Javel');
        $response->assertJsonPath('1.produits.0.prix', 12.5);
        $response->assertJsonPath('1.frais_forfait', 50);
        $response->assertJsonPath('1.frais_produits_total', 12.5);
        $response->assertJsonPath('1.frais_total', 62.5);
    }

    public function test_it_exposes_the_checklist_reference_photo_and_the_produit_photo(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create([
            'checklist_modele_id' => $standard->id,
            'libelle' => 'Passer l\'aspirateur',
            'photo_url' => 'checklist-modele-items/exemple.jpg',
            'ordre' => 0,
        ]);

        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement->checklistModeles()->sync([$standard->id]);

        $produit = ProduitMenageCatalogue::create([
            'nom' => 'Javel',
            'prix' => 12.5,
            'photo_url' => 'produits-catalogue/javel.jpg',
            'actif' => true,
        ]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        $this->patchJson("/api/sejours/{$sejour->id}/checkout")->assertOk();
        $mission = MissionMenage::where('sejour_id', $sejour->id)->firstOrFail();
        $mission->produits()->attach($produit->id);

        $response = $this->getJson("/api/appartements/{$appartement->id}/historique");

        $response->assertOk();
        $response->assertJsonPath('0.checklist_items.0.photo_reference_url', 'checklist-modele-items/exemple.jpg');
        $response->assertJsonPath('0.produits.0.photo_url', 'produits-catalogue/javel.jpg');
    }

    public function test_it_only_returns_missions_for_the_requested_appartement(): void
    {
        $appartement1 = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement2 = Appartement::create(['nom' => 'Zenith', 'adresse' => 'B', 'statut' => 'disponible']);

        $sejour1 = Sejour::create([
            'appartement_id' => $appartement1->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        $this->patchJson("/api/sejours/{$sejour1->id}/checkout")->assertOk();

        $sejour2 = Sejour::create([
            'appartement_id' => $appartement2->id,
            'date_arrivee' => '2026-02-01',
            'date_depart' => '2026-02-05',
            'nom_voyageur' => 'Marie Curie',
        ]);
        $this->patchJson("/api/sejours/{$sejour2->id}/checkout")->assertOk();

        $response = $this->getJson("/api/appartements/{$appartement1->id}/historique");

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.sejour.nom_voyageur', 'Jean Dupont');
    }
}
