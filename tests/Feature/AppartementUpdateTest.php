<?php

namespace Tests\Feature;

use App\Models\Appartement;
use App\Models\ChargeAppartement;
use App\Models\ChecklistModele;
use App\Models\Proprietaire;
use App\Models\Utilisateur;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AppartementUpdateTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_updates_nom_and_adresse(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille rénové',
            'adresse' => 'Nouvelle adresse',
        ]);

        $response->assertOk();
        $response->assertJsonPath('nom', 'Loft Bastille rénové');
        $response->assertJsonPath('adresse', 'Nouvelle adresse');
        $this->assertDatabaseHas('appartements', ['id' => $appartement->id, 'nom' => 'Loft Bastille rénové']);
    }

    public function test_it_updates_checklist_and_agent_habituel(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $checklist = ChecklistModele::create(['nom' => 'Checklist standard']);
        $agent = Utilisateur::create(['nom' => 'Fatima Z.', 'role' => 'menage']);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'checklist_modele_ids' => [$checklist->id],
            'agent_habituel_id' => $agent->id,
        ]);

        $response->assertOk();
        $response->assertJsonPath('checklist_modeles.0.nom', 'Checklist standard');
        $response->assertJsonPath('agent_habituel.nom', 'Fatima Z.');
    }

    public function test_it_replaces_the_checklist_modeles_set_when_changed(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        $fenetres = ChecklistModele::create(['nom' => 'Fenêtres']);
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement->checklistModeles()->sync([$standard->id]);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'checklist_modele_ids' => [$standard->id, $fenetres->id],
        ]);

        $response->assertOk();
        $response->assertJsonCount(2, 'checklist_modeles');
        $this->assertDatabaseCount('appartement_checklist_modele', 2);
    }

    public function test_it_clears_the_checklist_modeles_when_none_are_sent(): void
    {
        $standard = ChecklistModele::create(['nom' => 'Standard']);
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $appartement->checklistModeles()->sync([$standard->id]);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
        ]);

        $response->assertOk();
        $response->assertJsonPath('checklist_modeles', []);
        $this->assertDatabaseCount('appartement_checklist_modele', 0);
    }

    public function test_it_replaces_the_agent_habituel_when_changed(): void
    {
        $agent1 = Utilisateur::create(['nom' => 'Fatima Z.', 'role' => 'menage']);
        $agent2 = Utilisateur::create(['nom' => 'Karim B.', 'role' => 'menage']);
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'agent_habituel_id' => $agent1->id,
        ]);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'agent_habituel_id' => $agent2->id,
        ]);

        $response->assertOk();
        $response->assertJsonPath('agent_habituel_id', $agent2->id);
        $this->assertDatabaseHas('appartements', ['id' => $appartement->id, 'agent_habituel_id' => $agent2->id]);
    }

    public function test_statut_cannot_be_changed_via_update(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'occupe',
        ]);

        $response->assertOk();
        $response->assertJsonPath('statut', 'disponible');
        $this->assertDatabaseHas('appartements', ['id' => $appartement->id, 'statut' => 'disponible']);
    }

    public function test_agent_habituel_must_have_menage_role_on_update(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $manager = Utilisateur::create(['nom' => 'Nadia M.', 'role' => 'manager']);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'agent_habituel_id' => $manager->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('agent_habituel_id');
    }

    public function test_nom_and_adresse_are_required_on_update(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => '',
            'adresse' => '',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['nom', 'adresse']);
    }

    public function test_it_updates_proprietaire_mode_gestion_and_switches_from_commission_to_loyer_fixe(): void
    {
        $proprietaire = Proprietaire::create(['nom' => 'Karim Alaoui']);
        $appartement = Appartement::create([
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'statut' => 'disponible',
            'mode_gestion' => 'mandat',
            'taux_commission' => 15,
        ]);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'proprietaire_id' => $proprietaire->id,
            'mode_gestion' => 'sous_location',
            'loyer_fixe_mensuel' => 4000,
        ]);

        $response->assertOk();
        $response->assertJsonPath('proprietaire.nom', 'Karim Alaoui');
        $response->assertJsonPath('mode_gestion', 'sous_location');
        $response->assertJsonPath('loyer_fixe_mensuel', '4000.00');
        $this->assertDatabaseHas('appartements', [
            'id' => $appartement->id,
            'proprietaire_id' => $proprietaire->id,
            'mode_gestion' => 'sous_location',
        ]);
    }

    public function test_mode_gestion_must_be_mandat_or_sous_location_on_update(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'mode_gestion' => 'autre',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('mode_gestion');
    }

    public function test_it_adds_a_new_charge_via_update_without_an_id(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'sync_charges' => true,
            'charges' => [
                ['nom_service' => 'WiFi', 'montant' => 149, 'frequence' => 'mensuel', 'a_charge_de' => 'restinnov'],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonCount(1, 'charges_actives');
        $this->assertDatabaseHas('charges_appartement', [
            'appartement_id' => $appartement->id,
            'nom_service' => 'WiFi',
            'date_debut' => now()->toDateString(),
        ]);
    }

    public function test_it_updates_an_existing_charge_in_place_when_its_id_is_sent(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $charge = ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
            'date_debut' => '2026-01-01',
        ]);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'sync_charges' => true,
            'charges' => [
                ['id' => $charge->id, 'nom_service' => 'WiFi', 'montant' => 199, 'frequence' => 'mensuel', 'a_charge_de' => 'restinnov'],
            ],
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('charges_appartement', [
            'id' => $charge->id,
            'montant' => 199,
            'date_debut' => '2026-01-01', // untouched -- history preserved, not recreated
            'date_fin' => null,
        ]);
        $this->assertDatabaseCount('charges_appartement', 1);
    }

    public function test_it_closes_an_unchecked_charge_instead_of_deleting_it(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        $wifi = ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
            'date_debut' => '2026-01-01',
        ]);
        $netflix = ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'Netflix',
            'montant' => 80,
            'frequence' => 'mensuel',
            'a_charge_de' => 'proprietaire',
            'date_debut' => '2026-01-01',
        ]);

        // Only WiFi is resubmitted -- Netflix was unchecked in the form.
        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'sync_charges' => true,
            'charges' => [
                ['id' => $wifi->id, 'nom_service' => 'WiFi', 'montant' => 149, 'frequence' => 'mensuel', 'a_charge_de' => 'restinnov'],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonCount(1, 'charges_actives');
        $this->assertDatabaseHas('charges_appartement', ['id' => $wifi->id, 'date_fin' => null]);
        $this->assertDatabaseHas('charges_appartement', ['id' => $netflix->id, 'date_fin' => now()->toDateString()]);
        // Still there, just closed -- not deleted.
        $this->assertDatabaseCount('charges_appartement', 2);
    }

    public function test_it_closes_every_active_charge_when_all_are_unchecked(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
            'date_debut' => '2026-01-01',
        ]);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille',
            'adresse' => 'A',
            'sync_charges' => true,
            'charges' => [],
        ]);

        $response->assertOk();
        $response->assertJsonCount(0, 'charges_actives');
        $this->assertDatabaseHas('charges_appartement', ['appartement_id' => $appartement->id, 'date_fin' => now()->toDateString()]);
    }

    public function test_charges_are_left_untouched_when_the_field_is_omitted(): void
    {
        $appartement = Appartement::create(['nom' => 'Loft Bastille', 'adresse' => 'A', 'statut' => 'disponible']);
        ChargeAppartement::create([
            'appartement_id' => $appartement->id,
            'nom_service' => 'WiFi',
            'montant' => 149,
            'frequence' => 'mensuel',
            'a_charge_de' => 'restinnov',
            'date_debut' => '2026-01-01',
        ]);

        $response = $this->patchJson("/api/appartements/{$appartement->id}", [
            'nom' => 'Loft Bastille rénové',
            'adresse' => 'A',
        ]);

        $response->assertOk();
        $response->assertJsonCount(1, 'charges_actives');
        $this->assertDatabaseHas('charges_appartement', ['appartement_id' => $appartement->id, 'date_fin' => null]);
    }
}
