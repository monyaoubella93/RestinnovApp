<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChecklistItem;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MissionMenageValidationTest extends TestCase
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
            'statut' => 'en_attente_validation',
        ], $overrides));
    }

    public function test_valider_moves_a_mission_from_en_attente_validation_to_conforme(): void
    {
        $mission = $this->mission();

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/valider");

        $response->assertOk();
        $response->assertJsonPath('statut', 'conforme');
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'conforme']);
    }

    public function test_valider_flips_the_appartement_back_to_disponible(): void
    {
        $mission = $this->mission();

        $this->assertSame('en_menage', $this->getJson('/api/appartements')->json('0.statut'));

        $this->patchJson("/api/mission-menages/{$mission->id}/valider")->assertOk();

        $this->assertSame('disponible', $this->getJson('/api/appartements')->json('0.statut'));
    }

    public function test_valider_is_rejected_when_the_mission_is_not_en_attente_validation(): void
    {
        foreach (['a_faire', 'en_cours', 'conforme', 'non_conforme'] as $statut) {
            $mission = $this->mission(['statut' => $statut]);

            $response = $this->patchJson("/api/mission-menages/{$mission->id}/valider");

            $response->assertStatus(422);
            $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => $statut]);
        }
    }

    public function test_valider_is_forbidden_for_a_menage_account(): void
    {
        $mission = $this->mission();
        $this->actingAsMenage();

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/valider");

        $response->assertStatus(403);
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'en_attente_validation']);
    }

    public function test_full_cycle_checkout_to_en_menage_to_validation_to_disponible(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');
        $appartement = $this->appartement();
        $agent = $this->agent();

        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-08-01',
            'date_depart' => '2026-08-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);

        $checkout = $this->patchJson("/api/sejours/{$sejour->id}/checkout");
        $checkout->assertOk();
        $missionId = $checkout->json('mission_menage.id');

        $this->assertSame('en_menage', $this->getJson('/api/appartements')->json('0.statut'));

        Sanctum::actingAs($agent, ['*']);

        $this->post("/api/mission-menages/{$missionId}/commencer", [
            'photo' => \Illuminate\Http\UploadedFile::fake()->image('avant.jpg'),
        ], ['Accept' => 'application/json'])->assertOk();

        $this->post("/api/mission-menages/{$missionId}/photos-preuve", [
            'photos' => [\Illuminate\Http\UploadedFile::fake()->image('apres.jpg')],
        ], ['Accept' => 'application/json'])->assertCreated();

        $terminer = $this->patchJson("/api/mission-menages/{$missionId}/terminer");
        $terminer->assertOk();
        $terminer->assertJsonPath('statut', 'en_attente_validation');

        // GET /api/appartements is manager-only -- switch back before checking it.
        $this->actingAsManager();

        $this->assertSame('en_menage', $this->getJson('/api/appartements')->json('0.statut'));

        $valider = $this->patchJson("/api/mission-menages/{$missionId}/valider");
        $valider->assertOk();
        $valider->assertJsonPath('statut', 'conforme');

        $this->assertSame('disponible', $this->getJson('/api/appartements')->json('0.statut'));
    }

    public function test_terminer_and_valider_leave_a_checklist_item_photo_untouched(): void
    {
        $mission = $this->mission(['statut' => 'en_cours']);
        ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 1', 'coche' => true, 'ordre' => 0]);
        \App\Models\MissionMenagePhotoPreuve::create([
            'mission_menage_id' => $mission->id,
            'photo_url' => 'missions-menage-photos-preuve/apres.jpg',
            'type' => 'apres',
        ]);

        $this->patchJson("/api/mission-menages/{$mission->id}/terminer")->assertOk();
        $this->patchJson("/api/mission-menages/{$mission->id}/valider")->assertOk();

        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'conforme']);
    }
}
