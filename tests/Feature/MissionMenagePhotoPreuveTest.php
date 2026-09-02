<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MissionMenagePhotoPreuveTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(): Appartement
    {
        return Appartement::create(['nom' => 'Loft Bastille', 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
    }

    private function agent(): Utilisateur
    {
        return Utilisateur::create(['nom' => 'Fatima Z.', 'role' => 'menage']);
    }

    private function sejour(Appartement $appartement): Sejour
    {
        return Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
            'statut' => 'termine',
        ]);
    }

    private function mission(array $overrides = []): MissionMenage
    {
        $appartement = $this->appartement();

        return MissionMenage::create(array_merge([
            'sejour_id' => $this->sejour($appartement)->id,
            'agent_id' => $this->agent()->id,
            'statut' => 'non_conforme',
        ], $overrides));
    }

    public function test_it_uploads_a_single_photo_de_preuve_with_note(): void
    {
        Storage::fake('public');
        $mission = $this->mission();

        $response = $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [UploadedFile::fake()->image('preuve.jpg')],
            'note' => 'Salle de bain refaite',
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.note', 'Salle de bain refaite');

        $photoUrl = $response->json('0.photo_url');
        $this->assertNotNull($photoUrl);
        Storage::disk('public')->assertExists($photoUrl);

        $this->assertDatabaseHas('mission_menage_photos_preuve', [
            'mission_menage_id' => $mission->id,
            'note' => 'Salle de bain refaite',
        ]);
    }

    public function test_it_tags_uploaded_photos_de_preuve_as_apres(): void
    {
        Storage::fake('public');
        $mission = $this->mission();

        $response = $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [UploadedFile::fake()->image('preuve.jpg')],
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonPath('0.type', 'apres');
        $this->assertDatabaseHas('mission_menage_photos_preuve', [
            'mission_menage_id' => $mission->id,
            'type' => 'apres',
        ]);
    }

    public function test_it_uploads_multiple_photos_de_preuve_in_one_request(): void
    {
        Storage::fake('public');
        $mission = $this->mission();

        $response = $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [
                UploadedFile::fake()->image('preuve1.jpg'),
                UploadedFile::fake()->image('preuve2.jpg'),
            ],
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonCount(2);
        $this->assertDatabaseCount('mission_menage_photos_preuve', 2);
    }

    public function test_at_least_one_photo_is_required(): void
    {
        $mission = $this->mission();

        $response = $this->postJson("/api/mission-menages/{$mission->id}/photos-preuve", [
            'note' => 'Sans photo',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('photos');
    }

    public function test_photos_preuve_appears_in_mission_detail(): void
    {
        Storage::fake('public');
        $mission = $this->mission();

        $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [UploadedFile::fake()->image('preuve.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated();

        $response = $this->getJson("/api/mission-menages/{$mission->id}");

        $response->assertOk();
        $response->assertJsonCount(1, 'photos_preuve');
    }

    public function test_a_menage_agent_can_add_a_photo_de_preuve_to_their_own_mission(): void
    {
        Storage::fake('public');
        $agent = $this->agent();
        $mission = $this->mission(['agent_id' => $agent->id]);
        Sanctum::actingAs($agent, ['*']);

        $response = $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [UploadedFile::fake()->image('preuve.jpg')],
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
    }

    public function test_a_menage_agent_cannot_add_a_photo_de_preuve_to_someone_elses_mission(): void
    {
        Storage::fake('public');
        $autreAgent = $this->agent();
        $mission = $this->mission(['agent_id' => $autreAgent->id]);
        $this->actingAsMenage();

        $response = $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [UploadedFile::fake()->image('preuve.jpg')],
        ], ['Accept' => 'application/json']);

        $response->assertStatus(403);
    }

    public function test_it_accepts_a_photo_de_preuve_up_to_the_10mb_limit(): void
    {
        Storage::fake('public');
        $mission = $this->mission();

        $response = $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [UploadedFile::fake()->image('preuve.jpg')->size(10240)],
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
    }

    public function test_it_rejects_a_photo_de_preuve_over_the_10mb_limit_with_a_clear_message(): void
    {
        Storage::fake('public');
        $mission = $this->mission();

        $response = $this->post("/api/mission-menages/{$mission->id}/photos-preuve", [
            'photos' => [UploadedFile::fake()->image('preuve.jpg')->size(10241)],
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
        $response->assertJsonFragment(['photos.0' => ['Photo trop lourde, réessayez avec une photo plus légère (10 Mo maximum).']]);
        $this->assertDatabaseCount('mission_menage_photos_preuve', 0);
    }
}
