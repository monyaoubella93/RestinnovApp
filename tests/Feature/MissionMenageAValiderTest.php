<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MissionMenageAValiderTest extends TestCase
{
    use RefreshDatabase;

    private function appartement(array $overrides = []): Appartement
    {
        return Appartement::create(array_merge([
            'nom' => 'Loft Bastille',
            'adresse' => '12 rue de la Roquette',
            'statut' => 'disponible',
        ], $overrides));
    }

    private function missionEnAttente(Appartement $appartement, string $nomVoyageur, ?Utilisateur $agent = null): MissionMenage
    {
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => $nomVoyageur,
        ]);
        $this->patchJson("/api/sejours/{$sejour->id}/checkout")->assertOk();
        $mission = MissionMenage::where('sejour_id', $sejour->id)->firstOrFail();
        $mission->update([
            'statut' => MissionMenage::STATUT_EN_ATTENTE_VALIDATION,
            'agent_id' => $agent?->id,
        ]);

        return $mission;
    }

    public function test_it_lists_every_mission_en_attente_validation_across_every_agent(): void
    {
        $appartement1 = $this->appartement(['nom' => 'Loft Bastille']);
        $appartement2 = $this->appartement(['nom' => 'Zenith', 'adresse' => 'B']);
        $agent1 = Utilisateur::factory()->menage()->create(['nom' => 'Fatima Z.']);
        $agent2 = Utilisateur::factory()->menage()->create(['nom' => 'Karim B.']);

        $mission1 = $this->missionEnAttente($appartement1, 'Jean Dupont', $agent1);
        $mission2 = $this->missionEnAttente($appartement2, 'Marie Curie', $agent2);

        $response = $this->getJson('/api/mission-menages/a-valider');

        $response->assertOk();
        $response->assertJsonCount(2);
        $ids = collect($response->json())->pluck('id');
        $this->assertTrue($ids->contains($mission1->id));
        $this->assertTrue($ids->contains($mission2->id));
        $response->assertJsonPath('0.agent.nom', 'Karim B.');
    }

    public function test_it_excludes_missions_not_en_attente_validation(): void
    {
        $appartement = $this->appartement();
        $sejour = Sejour::create([
            'appartement_id' => $appartement->id,
            'date_arrivee' => '2026-01-01',
            'date_depart' => '2026-01-05',
            'nom_voyageur' => 'Jean Dupont',
        ]);
        // Left as a_faire -- never sent for validation.

        $response = $this->getJson('/api/mission-menages/a-valider');

        $response->assertOk();
        $response->assertJsonCount(0);
    }

    public function test_it_includes_checklist_produits_and_photos_preuve_detail(): void
    {
        $appartement = $this->appartement();
        $mission = $this->missionEnAttente($appartement, 'Jean Dupont');
        $mission->checklistItems()->create(['libelle' => "Passer l'aspirateur", 'coche' => true, 'ordre' => 0]);
        $mission->photosPreuve()->create(['photo_url' => 'missions/preuve.jpg']);

        $response = $this->getJson('/api/mission-menages/a-valider');

        $response->assertOk();
        $response->assertJsonPath('0.checklist_items.0.libelle', "Passer l'aspirateur");
        $response->assertJsonPath('0.photos_preuve.0.photo_url', 'missions/preuve.jpg');
    }

    public function test_it_is_forbidden_for_a_menage_account(): void
    {
        $this->actingAsMenage();

        $response = $this->getJson('/api/mission-menages/a-valider');

        $response->assertStatus(403);
    }

    public function test_it_is_forbidden_for_a_maintenance_account(): void
    {
        $this->actingAsMaintenance();

        $response = $this->getJson('/api/mission-menages/a-valider');

        $response->assertStatus(403);
    }
}
