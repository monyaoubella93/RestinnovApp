<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChecklistItem;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MissionMenageAgentWorkspaceTest extends TestCase
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

    // --- index() "mes missions" ---

    public function test_index_lists_a_faire_en_cours_en_attente_validation_and_non_conforme_missions_for_the_given_agent(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $autreAgent = $this->agent();

        $missionAFaire = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);
        $missionEnCours = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        $missionEnAttente = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_attente_validation']);
        $missionNonConforme = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'non_conforme']);
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'conforme']);
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $autreAgent->id, 'statut' => 'a_faire']);

        $response = $this->getJson("/api/mission-menages?agent_id={$agent->id}");

        $response->assertOk();
        $response->assertJsonCount(4);
        $ids = collect($response->json())->pluck('id');
        $this->assertTrue($ids->contains($missionAFaire->id));
        $this->assertTrue($ids->contains($missionEnCours->id));
        $this->assertTrue($ids->contains($missionEnAttente->id));
        $this->assertTrue($ids->contains($missionNonConforme->id));
    }

    public function test_index_excludes_conforme_missions(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'conforme']);

        $response = $this->getJson("/api/mission-menages?agent_id={$agent->id}");

        $response->assertOk();
        $response->assertJsonCount(0);
    }

    public function test_index_includes_appartement_nom_and_adresse(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);

        $response = $this->getJson("/api/mission-menages?agent_id={$agent->id}");

        $response->assertOk();
        $response->assertJsonPath('0.sejour.appartement.nom', 'Loft Bastille');
        $response->assertJsonPath('0.sejour.appartement.adresse', '12 rue de la Roquette');
    }

    public function test_agent_id_is_required_for_index(): void
    {
        $response = $this->getJson('/api/mission-menages');

        $response->assertStatus(422);
    }

    // --- ouvrir() ---

    public function test_ouvrir_marks_vue_but_does_not_activate_an_a_faire_mission(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/ouvrir");

        $response->assertOk();
        $response->assertJsonPath('vue', true);
        $response->assertJsonPath('statut', 'a_faire');
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'vue' => true, 'statut' => 'a_faire']);
    }

    public function test_ouvrir_does_not_regress_an_already_en_cours_mission(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours', 'vue' => true]);

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/ouvrir");

        $response->assertOk();
        $response->assertJsonPath('statut', 'en_cours');
    }

    // --- commencer() ---

    public function test_commencer_requires_a_photo_avant(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);

        $response = $this->postJson("/api/mission-menages/{$mission->id}/commencer", []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('photo');
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'a_faire']);
    }

    public function test_commencer_moves_a_faire_to_en_cours_and_stores_the_photo_avant(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);

        $response = $this->post("/api/mission-menages/{$mission->id}/commencer", [
            'photo' => \Illuminate\Http\UploadedFile::fake()->image('avant.jpg'),
        ], ['Accept' => 'application/json']);

        $response->assertOk();
        $response->assertJsonPath('statut', 'en_cours');
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'en_cours']);
        $this->assertDatabaseHas('mission_menage_photos_preuve', ['mission_menage_id' => $mission->id, 'type' => 'avant']);
        $photoUrl = $mission->fresh()->photosPreuve()->where('type', 'avant')->first()->photo_url;
        \Illuminate\Support\Facades\Storage::disk('public')->assertExists($photoUrl);
    }

    public function test_commencer_is_rejected_once_the_mission_is_already_started(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);

        $response = $this->post("/api/mission-menages/{$mission->id}/commencer", [
            'photo' => \Illuminate\Http\UploadedFile::fake()->image('avant.jpg'),
        ], ['Accept' => 'application/json']);

        $response->assertStatus(422);
    }

    public function test_a_menage_account_cannot_commencer_another_agents_mission(): void
    {
        $appartement = $this->appartement();
        $autreAgent = $this->agent();
        $leurMission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $autreAgent->id, 'statut' => 'a_faire']);

        $this->actingAsMenage();

        $response = $this->post("/api/mission-menages/{$leurMission->id}/commencer", [
            'photo' => \Illuminate\Http\UploadedFile::fake()->image('avant.jpg'),
        ], ['Accept' => 'application/json']);

        $response->assertStatus(403);
        $this->assertDatabaseHas('mission_menages', ['id' => $leurMission->id, 'statut' => 'a_faire']);
    }

    // --- terminer() ---

    private function ajouterPhotoApres(MissionMenage $mission): void
    {
        \App\Models\MissionMenagePhotoPreuve::create([
            'mission_menage_id' => $mission->id,
            'photo_url' => 'missions-menage-photos-preuve/apres.jpg',
            'type' => 'apres',
        ]);
    }

    public function test_terminer_is_rejected_while_the_mission_is_still_a_faire(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/terminer");

        $response->assertStatus(422);
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'a_faire']);
    }

    public function test_terminer_is_rejected_while_items_remain_unchecked(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 1', 'coche' => true, 'ordre' => 0]);
        ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 2', 'coche' => false, 'ordre' => 1]);

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/terminer");

        $response->assertStatus(422);
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'en_cours']);
    }

    public function test_terminer_is_rejected_without_a_photo_apres_even_with_a_complete_checklist(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 1', 'coche' => true, 'ordre' => 0]);

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/terminer");

        $response->assertStatus(422);
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'en_cours']);
    }

    public function test_terminer_succeeds_once_all_items_are_checked_and_a_photo_apres_exists(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 1', 'coche' => true, 'ordre' => 0]);
        ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 2', 'coche' => true, 'ordre' => 1]);
        $this->ajouterPhotoApres($mission);

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/terminer");

        $response->assertOk();
        $response->assertJsonPath('statut', 'en_attente_validation');
        $this->assertDatabaseHas('mission_menages', ['id' => $mission->id, 'statut' => 'en_attente_validation']);
    }

    public function test_terminer_succeeds_when_there_are_no_checklist_items_at_all_but_a_photo_apres_exists(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        $this->ajouterPhotoApres($mission);

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/terminer");

        $response->assertOk();
        $response->assertJsonPath('statut', 'en_attente_validation');
    }

    // --- checklist item toggle ---

    public function test_it_toggles_a_checklist_item(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        $item = ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 1', 'coche' => false, 'ordre' => 0]);

        $response = $this->patchJson("/api/checklist-items/{$item->id}", ['coche' => true]);

        $response->assertOk();
        $response->assertJsonPath('coche', true);
        $this->assertDatabaseHas('checklist_items', ['id' => $item->id, 'coche' => true]);
    }

    public function test_it_uncocks_a_checklist_item(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        $item = ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 1', 'coche' => true, 'ordre' => 0]);

        $response = $this->patchJson("/api/checklist-items/{$item->id}", ['coche' => false]);

        $response->assertOk();
        $response->assertJsonPath('coche', false);
    }

    public function test_it_attaches_a_photo_to_a_checklist_item(): void
    {
        \Illuminate\Support\Facades\Storage::fake('public');

        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'en_cours']);
        $item = ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Item 1', 'coche' => false, 'ordre' => 0]);

        $photo = \Illuminate\Http\UploadedFile::fake()->image('preuve.jpg');

        $response = $this->post("/api/checklist-items/{$item->id}", [
            '_method' => 'PATCH',
            'coche' => 'true',
            'photo' => $photo,
        ]);

        $response->assertOk();
        $response->assertJsonPath('coche', true);
        $this->assertNotNull($response->json('photo_url'));
    }

    // --- ownership: a "menage" account may only act on its own missions ---

    public function test_a_menage_account_always_gets_its_own_missions_regardless_of_the_agent_id_query_param(): void
    {
        $appartement = $this->appartement();
        $moi = $this->actingAsMenage();
        $autreAgent = $this->agent();

        $maMission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $moi->id, 'statut' => 'a_faire']);
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $autreAgent->id, 'statut' => 'a_faire']);

        $response = $this->getJson("/api/mission-menages?agent_id={$autreAgent->id}");

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $maMission->id);
    }

    public function test_a_menage_account_cannot_view_another_agents_mission(): void
    {
        $appartement = $this->appartement();
        $autreAgent = $this->agent();
        $leurMission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $autreAgent->id, 'statut' => 'a_faire']);

        $this->actingAsMenage();

        $response = $this->getJson("/api/mission-menages/{$leurMission->id}");

        $response->assertStatus(403);
    }

    public function test_a_menage_account_cannot_open_another_agents_mission(): void
    {
        $appartement = $this->appartement();
        $autreAgent = $this->agent();
        $leurMission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $autreAgent->id, 'statut' => 'a_faire']);

        $this->actingAsMenage();

        $response = $this->patchJson("/api/mission-menages/{$leurMission->id}/ouvrir");

        $response->assertStatus(403);
        $this->assertDatabaseHas('mission_menages', ['id' => $leurMission->id, 'statut' => 'a_faire', 'vue' => false]);
    }

    public function test_a_menage_account_cannot_toggle_a_checklist_item_on_another_agents_mission(): void
    {
        $appartement = $this->appartement();
        $autreAgent = $this->agent();
        $leurMission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $autreAgent->id, 'statut' => 'en_cours']);
        $item = ChecklistItem::create(['mission_menage_id' => $leurMission->id, 'libelle' => 'Item 1', 'coche' => false, 'ordre' => 0]);

        $this->actingAsMenage();

        $response = $this->patchJson("/api/checklist-items/{$item->id}", ['coche' => true]);

        $response->assertStatus(403);
        $this->assertDatabaseHas('checklist_items', ['id' => $item->id, 'coche' => false]);
    }

    public function test_a_manager_account_can_view_and_act_on_any_agents_mission(): void
    {
        $appartement = $this->appartement();
        $agent = $this->agent();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $agent->id, 'statut' => 'a_faire']);

        $this->actingAsManager();

        $response = $this->patchJson("/api/mission-menages/{$mission->id}/ouvrir");

        $response->assertOk();
    }

    // --- historique() ---

    public function test_historique_lists_only_conforme_missions_with_appartement_and_sejour_date(): void
    {
        $appartement = $this->appartement();
        $moi = $this->actingAsMenage();

        $missionConforme = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $moi->id, 'statut' => 'conforme']);
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $moi->id, 'statut' => 'a_faire']);
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $moi->id, 'statut' => 'en_attente_validation']);

        $response = $this->getJson('/api/mes-missions/historique');

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $missionConforme->id);
        $response->assertJsonPath('0.appartement.nom', 'Loft Bastille');
        $response->assertJsonPath('0.appartement.adresse', '12 rue de la Roquette');
        $response->assertJsonPath('0.sejour.date_depart', '2026-08-05');
    }

    public function test_historique_orders_missions_most_recent_sejour_first(): void
    {
        $appartement = $this->appartement();
        $moi = $this->actingAsMenage();

        $ancienSejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Ancien Voyageur',
            'statut' => 'termine',
        ]);
        $missionAncienne = MissionMenage::create(['sejour_id' => $ancienSejour->id, 'agent_id' => $moi->id, 'statut' => 'conforme']);
        $missionRecente = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $moi->id, 'statut' => 'conforme']);

        $response = $this->getJson('/api/mes-missions/historique');

        $response->assertOk();
        $response->assertJsonPath('0.id', $missionRecente->id);
        $response->assertJsonPath('1.id', $missionAncienne->id);
    }

    public function test_a_menage_account_always_gets_its_own_historique_regardless_of_the_agent_id_query_param(): void
    {
        $appartement = $this->appartement();
        $moi = $this->actingAsMenage();
        $autreAgent = $this->agent();

        $maMission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $moi->id, 'statut' => 'conforme']);
        MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $autreAgent->id, 'statut' => 'conforme']);

        $response = $this->getJson("/api/mes-missions/historique?agent_id={$autreAgent->id}");

        $response->assertOk();
        $response->assertJsonCount(1);
        $response->assertJsonPath('0.id', $maMission->id);
    }

    public function test_historique_agent_id_is_required_for_a_manager_account(): void
    {
        $response = $this->getJson('/api/mes-missions/historique');

        $response->assertStatus(422);
    }

    public function test_historique_includes_checklist_and_produits_detail(): void
    {
        $appartement = $this->appartement();
        $moi = $this->actingAsMenage();
        $mission = MissionMenage::create(['sejour_id' => $this->sejour($appartement)->id, 'agent_id' => $moi->id, 'statut' => 'conforme']);
        ChecklistItem::create(['mission_menage_id' => $mission->id, 'libelle' => 'Nettoyer la cuisine', 'checklist_modele_nom' => 'Standard', 'coche' => true, 'ordre' => 0]);

        $response = $this->getJson('/api/mes-missions/historique');

        $response->assertOk();
        $response->assertJsonPath('0.checklist_items.0.libelle', 'Nettoyer la cuisine');
        $response->assertJsonPath('0.checklist_items.0.coche', true);
        $response->assertJsonPath('0.checklist_modeles_utilises.0', 'Standard');
    }
}
