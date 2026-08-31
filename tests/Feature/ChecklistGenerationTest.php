<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChecklistModele;
use App\Models\ChecklistModeleItem;
use App\Models\Sejour;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChecklistGenerationTest extends TestCase
{
    use RefreshDatabase;

    public function test_checkout_copies_the_appartements_checklist_modele_items_onto_the_mission(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Passer l\'aspirateur', 'ordre' => 0]);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Changer les draps', 'ordre' => 1]);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Nettoyer la salle de bain', 'ordre' => 2]);

        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
        ]);
        $appartement->checklistModeles()->sync([$checklistModele->id]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/checkout");

        $response->assertOk();
        $response->assertJsonCount(3, 'mission_menage.checklist_items');
        $response->assertJsonPath('mission_menage.checklist_items.0.libelle', "Passer l'aspirateur");
        $response->assertJsonPath('mission_menage.checklist_items.0.coche', false);
        $response->assertJsonPath('mission_menage.checklist_items.0.checklist_modele_nom', 'Standard');
        $response->assertJsonPath('mission_menage.checklist_items.1.libelle', 'Changer les draps');
        $response->assertJsonPath('mission_menage.checklist_items.2.libelle', 'Nettoyer la salle de bain');

        $missionId = $response->json('mission_menage.id');
        $this->assertDatabaseCount('checklist_items', 3);
        $this->assertDatabaseHas('checklist_items', [
            'mission_menage_id' => $missionId,
            'libelle' => "Passer l'aspirateur",
            'coche' => false,
        ]);
    }

    public function test_checkout_combines_items_from_several_checklist_modeles_assigned_to_the_appartement(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create(['checklist_modele_id' => $standard->id, 'libelle' => 'Passer l\'aspirateur', 'ordre' => 0]);
        ChecklistModeleItem::create(['checklist_modele_id' => $standard->id, 'libelle' => 'Changer les draps', 'ordre' => 1]);

        $fenetres = ChecklistModele::create(['nom' => 'Fenêtres']);
        ChecklistModeleItem::create(['checklist_modele_id' => $fenetres->id, 'libelle' => 'Laver les vitres', 'ordre' => 0]);

        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement->checklistModeles()->sync([$standard->id, $fenetres->id]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/checkout");

        $response->assertOk();
        $response->assertJsonCount(3, 'mission_menage.checklist_items');
        $response->assertJsonPath('mission_menage.checklist_items.0.libelle', "Passer l'aspirateur");
        $response->assertJsonPath('mission_menage.checklist_items.0.checklist_modele_nom', 'Standard');
        $response->assertJsonPath('mission_menage.checklist_items.1.libelle', 'Changer les draps');
        $response->assertJsonPath('mission_menage.checklist_items.1.checklist_modele_nom', 'Standard');
        $response->assertJsonPath('mission_menage.checklist_items.2.libelle', 'Laver les vitres');
        $response->assertJsonPath('mission_menage.checklist_items.2.checklist_modele_nom', 'Fenêtres');
    }

    public function test_checkout_copies_the_modele_items_reference_photo_onto_the_generated_checklist_item(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create([
            'checklist_modele_id' => $checklistModele->id,
            'libelle' => 'Passer l\'aspirateur',
            'photo_url' => 'checklist-modele-items/exemple.jpg',
            'ordre' => 0,
        ]);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Changer les draps', 'ordre' => 1]);

        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement->checklistModeles()->sync([$checklistModele->id]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/checkout");

        $response->assertOk();
        $response->assertJsonPath('mission_menage.checklist_items.0.photo_reference_url', 'checklist-modele-items/exemple.jpg');
        $response->assertJsonPath('mission_menage.checklist_items.1.photo_reference_url', null);
        $this->assertDatabaseHas('checklist_items', [
            'libelle' => "Passer l'aspirateur",
            'photo_reference_url' => 'checklist-modele-items/exemple.jpg',
        ]);
    }

    public function test_checkout_copies_the_modele_items_arabic_libelle_onto_the_generated_checklist_item(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create([
            'checklist_modele_id' => $checklistModele->id,
            'libelle' => 'Passer l\'aspirateur',
            'libelle_ar' => 'تنظيف الأرضية بالمكنسة الكهربائية',
            'ordre' => 0,
        ]);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Changer les draps', 'ordre' => 1]);

        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement->checklistModeles()->sync([$checklistModele->id]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/checkout");

        $response->assertOk();
        $response->assertJsonPath('mission_menage.checklist_items.0.libelle_ar', 'تنظيف الأرضية بالمكنسة الكهربائية');
        $response->assertJsonPath('mission_menage.checklist_items.1.libelle_ar', null);
        $this->assertDatabaseHas('checklist_items', [
            'libelle' => "Passer l'aspirateur",
            'libelle_ar' => 'تنظيف الأرضية بالمكنسة الكهربائية',
        ]);
    }

    public function test_checkout_creates_no_items_when_the_appartement_has_no_checklist_modele(): void
    {
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
        ]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        $response = $this->patchJson("/api/sejours/{$sejour->id}/checkout");

        $response->assertOk();
        $response->assertJsonCount(0, 'mission_menage.checklist_items');
        $this->assertDatabaseCount('checklist_items', 0);
    }

    public function test_editing_the_checklist_modele_later_does_not_change_an_already_generated_mission(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        $item = ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Passer l\'aspirateur', 'ordre' => 0]);

        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
        ]);
        $appartement->checklistModeles()->sync([$checklistModele->id]);

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        $this->patchJson("/api/sejours/{$sejour->id}/checkout")->assertOk();

        // Edit the template after the mission was created.
        $item->update(['libelle' => 'Passer l\'aspirateur partout, y compris sous le lit']);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Nouvel item ajouté après coup', 'ordre' => 1]);

        $this->assertDatabaseHas('checklist_items', ['libelle' => "Passer l'aspirateur"]);
        $this->assertDatabaseMissing('checklist_items', ['libelle' => 'Nouvel item ajouté après coup']);
        $this->assertDatabaseCount('checklist_items', 1);
    }
}
