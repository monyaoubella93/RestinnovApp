<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ProduitCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_lists_the_seeded_catalogue_products(): void
    {
        $response = $this->getJson('/api/produits-catalogue');

        $response->assertOk();
        $response->assertJsonCount(7);
        $noms = collect($response->json())->pluck('nom');
        foreach ([
            'Nettoyant de sol',
            'Javel',
            'Sac poubelle',
            'ONI liquide vaisselle',
            'Savon pour les mains',
            'Liquide machine à laver',
            'Air fraîcheur',
        ] as $nom) {
            $this->assertTrue($noms->contains($nom), "Missing seeded product: {$nom}");
        }
    }

    public function test_seeded_products_default_to_price_zero_and_active(): void
    {
        $this->assertDatabaseHas('produits_menage_catalogue', [
            'nom' => 'Javel',
            'prix' => 0,
            'actif' => true,
        ]);
    }

    public function test_it_creates_a_catalogue_product(): void
    {
        $response = $this->postJson('/api/produits-catalogue', [
            'nom' => 'Éponge magique',
            'prix' => 15,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('nom', 'Éponge magique');
        $response->assertJsonPath('actif', true);
        $this->assertDatabaseHas('produits_menage_catalogue', [
            'nom' => 'Éponge magique',
            'prix' => 15,
            'actif' => true,
        ]);
    }

    public function test_it_stores_an_optional_reference_photo_with_the_product(): void
    {
        Storage::fake('public');

        $response = $this->post('/api/produits-catalogue', [
            'nom' => 'Éponge magique',
            'prix' => 15,
            'photo' => UploadedFile::fake()->image('exemple.jpg'),
        ]);

        $response->assertCreated();
        $this->assertNotNull($response->json('photo_url'));
        Storage::disk('public')->assertExists($response->json('photo_url'));
    }

    public function test_it_creates_a_catalogue_product_without_a_photo(): void
    {
        $response = $this->postJson('/api/produits-catalogue', [
            'nom' => 'Éponge magique',
            'prix' => 15,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('photo_url', null);
    }

    public function test_it_stores_an_optional_arabic_nom_with_the_product(): void
    {
        $response = $this->postJson('/api/produits-catalogue', [
            'nom' => 'Éponge magique',
            'nom_ar' => 'إسفنجة سحرية',
            'prix' => 15,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('nom_ar', 'إسفنجة سحرية');
        $this->assertDatabaseHas('produits_menage_catalogue', [
            'nom' => 'Éponge magique',
            'nom_ar' => 'إسفنجة سحرية',
        ]);
    }

    public function test_it_creates_a_catalogue_product_without_an_arabic_nom(): void
    {
        $response = $this->postJson('/api/produits-catalogue', [
            'nom' => 'Éponge magique',
            'prix' => 15,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('nom_ar', null);
    }

    public function test_nom_and_prix_are_required(): void
    {
        $response = $this->postJson('/api/produits-catalogue', []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['nom', 'prix']);
    }
}
