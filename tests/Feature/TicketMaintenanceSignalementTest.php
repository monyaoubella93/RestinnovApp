<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TicketMaintenanceSignalementTest extends TestCase
{
    use RefreshDatabase;

    private function missionMenage(?Utilisateur $agent = null): MissionMenage
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => '12 rue de la Roquette', 'statut' => 'disponible']);
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-02',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        return MissionMenage::create([
            'sejour_id' => $sejour->id,
            'agent_id' => $agent?->id,
            'statut' => 'en_cours',
        ]);
    }

    public function test_it_creates_a_ticket_with_a_photo_only(): void
    {
        Storage::fake('public');
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);
        $photo = UploadedFile::fake()->image('degat.jpg');

        $response = $this->post("/api/mission-menages/{$mission->id}/signalements", [
            'photos' => [$photo],
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $response->assertJsonPath('statut', 'ouvert');
        $response->assertJsonPath('agent_id', null);
        $response->assertJsonPath('description', null);

        $photoUrl = $response->json('photo_url');
        $this->assertNotNull($photoUrl);
        Storage::disk('public')->assertExists($photoUrl);

        $this->assertDatabaseHas('tickets_maintenance', [
            'appartement_id' => $mission->sejour->appartement_id,
            'mission_origine_id' => $mission->id,
            'statut' => 'ouvert',
            'agent_id' => null,
        ]);
    }

    public function test_it_accepts_several_photos_first_becomes_photo_url_rest_go_to_photos_signalement(): void
    {
        Storage::fake('public');
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);

        $response = $this->post("/api/mission-menages/{$mission->id}/signalements", [
            'photos' => [
                UploadedFile::fake()->image('degat-1.jpg'),
                UploadedFile::fake()->image('degat-2.jpg'),
                UploadedFile::fake()->image('degat-3.jpg'),
            ],
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $this->assertNotNull($response->json('photo_url'));
        $response->assertJsonCount(2, 'photos_signalement');
        Storage::disk('public')->assertExists($response->json('photo_url'));
        foreach ($response->json('photos_signalement') as $photo) {
            Storage::disk('public')->assertExists($photo['photo_url']);
        }

        $ticket = TicketMaintenance::first();
        $this->assertSame(2, $ticket->photosSignalement()->count());
    }

    public function test_it_creates_a_ticket_with_an_audio_only(): void
    {
        Storage::fake('public');
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);
        $audio = UploadedFile::fake()->create('probleme.mp3', 500, 'audio/mpeg');

        $response = $this->post("/api/mission-menages/{$mission->id}/signalements", [
            'audio' => $audio,
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
        $audioUrl = $response->json('audio_url');
        $this->assertNotNull($audioUrl);
        Storage::disk('public')->assertExists($audioUrl);
        $this->assertNull($response->json('photo_url'));
    }

    public function test_it_creates_a_ticket_with_a_description_only(): void
    {
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);

        $response = $this->postJson("/api/mission-menages/{$mission->id}/signalements", [
            'description' => 'Le robinet de la salle de bain fuit.',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('description', 'Le robinet de la salle de bain fuit.');
        $this->assertNull($response->json('photo_url'));
        $this->assertNull($response->json('audio_url'));
    }

    public function test_it_rejects_a_report_with_none_of_photo_audio_or_description(): void
    {
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);

        $response = $this->postJson("/api/mission-menages/{$mission->id}/signalements", []);

        $response->assertStatus(422);
        $this->assertDatabaseCount('tickets_maintenance', 0);
    }

    public function test_it_rejects_a_report_with_only_blank_whitespace_description(): void
    {
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);

        $response = $this->postJson("/api/mission-menages/{$mission->id}/signalements", [
            'description' => '   ',
        ]);

        $response->assertStatus(422);
    }

    public function test_it_links_the_ticket_to_the_mission_appartement(): void
    {
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);

        $response = $this->postJson("/api/mission-menages/{$mission->id}/signalements", [
            'description' => 'Prise électrique cassée.',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('appartement_id', $mission->sejour->appartement_id);
        $response->assertJsonPath('mission_origine_id', $mission->id);
    }

    public function test_a_menage_account_cannot_report_on_another_agents_mission(): void
    {
        $autreAgent = Utilisateur::create(['nom' => 'Karim B.', 'role' => 'menage']);
        $mission = $this->missionMenage($autreAgent);

        $this->actingAsMenage();

        $response = $this->postJson("/api/mission-menages/{$mission->id}/signalements", [
            'description' => 'Problème quelconque.',
        ]);

        $response->assertStatus(403);
        $this->assertDatabaseCount('tickets_maintenance', 0);
    }

    public function test_a_manager_can_report_on_any_mission(): void
    {
        $agent = Utilisateur::create(['nom' => 'Fatima Z.', 'role' => 'menage']);
        $mission = $this->missionMenage($agent);

        $this->actingAsManager();

        $response = $this->postJson("/api/mission-menages/{$mission->id}/signalements", [
            'description' => 'Problème quelconque.',
        ]);

        $response->assertCreated();
    }

    public function test_it_accepts_a_photo_up_to_the_10mb_limit(): void
    {
        Storage::fake('public');
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);
        $photo = UploadedFile::fake()->image('degat.jpg')->size(10240);

        $response = $this->post("/api/mission-menages/{$mission->id}/signalements", [
            'photos' => [$photo],
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
    }

    public function test_it_rejects_a_photo_over_the_10mb_limit_with_a_clear_message(): void
    {
        Storage::fake('public');
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);
        $photo = UploadedFile::fake()->image('degat.jpg')->size(10241);

        $response = $this->post("/api/mission-menages/{$mission->id}/signalements", [
            'photos' => [$photo],
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
        $response->assertJsonFragment(['photos.0' => ['Photo trop lourde, réessayez avec une photo plus légère (10 Mo maximum).']]);
        $this->assertDatabaseCount('tickets_maintenance', 0);
    }

    public function test_it_accepts_an_audio_up_to_the_5mb_limit(): void
    {
        Storage::fake('public');
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);
        $audio = UploadedFile::fake()->create('probleme.mp3', 5120, 'audio/mpeg');

        $response = $this->post("/api/mission-menages/{$mission->id}/signalements", [
            'audio' => $audio,
        ], ['Accept' => 'application/json']);

        $response->assertCreated();
    }

    public function test_it_rejects_an_audio_over_the_5mb_limit_with_a_clear_message(): void
    {
        Storage::fake('public');
        $agent = $this->actingAsMenage();
        $mission = $this->missionMenage($agent);
        $audio = UploadedFile::fake()->create('probleme.mp3', 5121, 'audio/mpeg');

        $response = $this->post("/api/mission-menages/{$mission->id}/signalements", [
            'audio' => $audio,
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
        $response->assertJsonFragment([
            'audio' => ['Enregistrement audio trop lourd, recommencez un enregistrement plus court (5 Mo maximum, soit environ 2 minutes).'],
        ]);
        $this->assertDatabaseCount('tickets_maintenance', 0);
    }
}
