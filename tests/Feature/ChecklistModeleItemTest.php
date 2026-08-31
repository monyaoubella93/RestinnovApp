<?php

namespace Tests\Feature;

use App\Models\ChecklistModele;
use App\Models\ChecklistModeleItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ChecklistModeleItemTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_adds_an_item_at_the_end_of_the_modele(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 1', 'ordre' => 0]);

        $response = $this->postJson("/api/checklist-modeles/{$checklistModele->id}/items", [
            'libelle' => 'Item 2',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('libelle', 'Item 2');
        $response->assertJsonPath('ordre', 1);
        $this->assertDatabaseHas('checklist_modele_items', [
            'checklist_modele_id' => $checklistModele->id,
            'libelle' => 'Item 2',
            'ordre' => 1,
        ]);
    }

    public function test_it_stores_an_optional_reference_photo_with_the_item(): void
    {
        Storage::fake('public');

        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);

        $response = $this->post("/api/checklist-modeles/{$checklistModele->id}/items", [
            'libelle' => 'Item 1',
            'photo' => UploadedFile::fake()->image('exemple.jpg'),
        ]);

        $response->assertCreated();
        $this->assertNotNull($response->json('photo_url'));
        Storage::disk('public')->assertExists($response->json('photo_url'));
    }

    public function test_it_adds_an_item_without_a_photo(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);

        $response = $this->postJson("/api/checklist-modeles/{$checklistModele->id}/items", [
            'libelle' => 'Item 1',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('photo_url', null);
    }

    public function test_it_stores_an_optional_arabic_libelle_with_the_item(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);

        $response = $this->postJson("/api/checklist-modeles/{$checklistModele->id}/items", [
            'libelle' => 'Passer l\'aspirateur',
            'libelle_ar' => 'تنظيف الأرضية بالمكنسة الكهربائية',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('libelle_ar', 'تنظيف الأرضية بالمكنسة الكهربائية');
        $this->assertDatabaseHas('checklist_modele_items', [
            'checklist_modele_id' => $checklistModele->id,
            'libelle_ar' => 'تنظيف الأرضية بالمكنسة الكهربائية',
        ]);
    }

    public function test_it_adds_an_item_without_an_arabic_libelle(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);

        $response = $this->postJson("/api/checklist-modeles/{$checklistModele->id}/items", [
            'libelle' => 'Item 1',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('libelle_ar', null);
    }

    public function test_libelle_is_required_to_add_an_item(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);

        $response = $this->postJson("/api/checklist-modeles/{$checklistModele->id}/items", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('libelle');
    }

    public function test_it_deletes_an_item(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        $item = ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 1', 'ordre' => 0]);

        $response = $this->deleteJson("/api/checklist-modele-items/{$item->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('checklist_modele_items', ['id' => $item->id]);
    }

    public function test_it_moves_an_item_up(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        $item1 = ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 1', 'ordre' => 0]);
        $item2 = ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 2', 'ordre' => 1]);

        $response = $this->patchJson("/api/checklist-modele-items/{$item2->id}/deplacer", ['direction' => 'haut']);

        $response->assertOk();
        $this->assertDatabaseHas('checklist_modele_items', ['id' => $item1->id, 'ordre' => 1]);
        $this->assertDatabaseHas('checklist_modele_items', ['id' => $item2->id, 'ordre' => 0]);
        $response->assertJsonPath('0.libelle', 'Item 2');
        $response->assertJsonPath('1.libelle', 'Item 1');
    }

    public function test_moving_the_first_item_up_is_a_no_op(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        $item1 = ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 1', 'ordre' => 0]);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 2', 'ordre' => 1]);

        $response = $this->patchJson("/api/checklist-modele-items/{$item1->id}/deplacer", ['direction' => 'haut']);

        $response->assertOk();
        $this->assertDatabaseHas('checklist_modele_items', ['id' => $item1->id, 'ordre' => 0]);
    }

    public function test_it_moves_an_item_down(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        $item1 = ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 1', 'ordre' => 0]);
        $item2 = ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 2', 'ordre' => 1]);

        $response = $this->patchJson("/api/checklist-modele-items/{$item1->id}/deplacer", ['direction' => 'bas']);

        $response->assertOk();
        $this->assertDatabaseHas('checklist_modele_items', ['id' => $item1->id, 'ordre' => 1]);
        $this->assertDatabaseHas('checklist_modele_items', ['id' => $item2->id, 'ordre' => 0]);
    }

    public function test_index_returns_checklist_modeles_with_their_items(): void
    {
        $checklistModele = ChecklistModele::create(['nom' => 'Standard']);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 1', 'ordre' => 0]);
        ChecklistModeleItem::create(['checklist_modele_id' => $checklistModele->id, 'libelle' => 'Item 2', 'ordre' => 1]);

        $response = $this->getJson('/api/checklist-modeles');

        $response->assertOk();
        $response->assertJsonCount(2, '0.items');
        $response->assertJsonPath('0.items.0.libelle', 'Item 1');
    }
}
