<?php

namespace App\Services;

use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\Utilisateur;
use Illuminate\Support\Facades\DB;

class SejourCheckoutService
{
    /**
     * Mark a sejour as checked out and create its cleaning mission, assigned
     * to the currently least busy "menage" agent. Shared by the manual
     * checkout endpoint and the automatic checkout scheduled command so both
     * apply exactly the same logic.
     */
    public function checkout(Sejour $sejour): MissionMenage
    {
        return DB::transaction(function () use ($sejour) {
            $sejour->update(['statut' => Sejour::STATUT_TERMINE]);

            $agent = Utilisateur::where('role', Utilisateur::ROLE_MENAGE)
                ->where('actif', true)
                ->withCount(['missionMenages' => function ($query) {
                    $query->whereIn('statut', [
                        MissionMenage::STATUT_A_FAIRE,
                        MissionMenage::STATUT_EN_COURS,
                    ]);
                }])
                ->orderBy('mission_menages_count')
                ->orderBy('id')
                ->lockForUpdate()
                ->first();

            $mission = MissionMenage::create([
                'sejour_id' => $sejour->id,
                'agent_id' => $agent?->id,
                'statut' => MissionMenage::STATUT_A_FAIRE,
            ]);

            $this->genererChecklist($mission, $sejour);

            return $mission;
        });
    }

    /**
     * Copy the items of every checklist_modele assigned to the appartement
     * onto the mission, each as its own unchecked ChecklistItem row. This is
     * a one-time snapshot, not a live reference: editing a modele later
     * never changes an already-generated mission's checklist. If the
     * appartement has no checklist_modele assigned, the mission simply gets
     * no items -- not an error.
     *
     * Items from several modeles are combined into a single flat, ordered
     * list -- grouped by modele in assignment order, each item tagged with
     * checklist_modele_nom so the agent screen can still display them under
     * a subtitle per origin modele.
     */
    private function genererChecklist(MissionMenage $mission, Sejour $sejour): void
    {
        $checklistModeles = $sejour->appartement?->checklistModeles()->with('items')->get() ?? collect();

        $ordre = 0;
        foreach ($checklistModeles as $checklistModele) {
            foreach ($checklistModele->items as $item) {
                $mission->checklistItems()->create([
                    'libelle' => $item->libelle,
                    'libelle_ar' => $item->libelle_ar,
                    'checklist_modele_nom' => $checklistModele->nom,
                    'photo_reference_url' => $item->photo_url,
                    'ordre' => $ordre++,
                ]);
            }
        }
    }
}
