<?php

namespace App\Http\Controllers;

use App\Models\Appartement;
use App\Models\FraisMaintenance;
use App\Models\MissionMenage;
use App\Models\Sejour;
use App\Models\TicketMaintenance;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    /**
     * Aggregate revenue, cleaning/maintenance costs, appartement statuses,
     * and sejour counts by statut, all computed from existing data.
     */
    public function index(): JsonResponse
    {
        $revenusTotaux = (float) Sejour::sum('montant_mad');

        $fraisForfaitTotal = (float) MissionMenage::sum('frais_forfait');
        $fraisProduitsTotal = (float) DB::table('mission_menage_produits')
            ->where('type_utilisation', MissionMenage::TYPE_UTILISATION_RACHETE)
            ->sum('prix_paye');
        $fraisMenageTotaux = $fraisForfaitTotal + $fraisProduitsTotal;

        $fraisMaintenanceTotaux = (float) FraisMaintenance::sum('prix');

        $resultatNet = $revenusTotaux - $fraisMenageTotaux - $fraisMaintenanceTotaux;

        $appartements = Appartement::query()
            ->select('id', 'nom', 'statut')
            ->withCount('sejours')
            ->withMax('sejours', 'date_depart')
            ->avecStatutCalcule()
            ->orderBy('nom')
            ->get()
            ->map(fn (Appartement $appartement) => [
                'id' => $appartement->id,
                'nom' => $appartement->nom,
                'statut' => $appartement->statutCalcule(),
                'sejours_count' => $appartement->sejours_count,
                'dernier_sejour' => $appartement->sejours_max_date_depart,
            ]);

        $sejoursParStatut = [
            Sejour::STATUT_A_VENIR => Sejour::where('statut', Sejour::STATUT_A_VENIR)->count(),
            Sejour::STATUT_EN_COURS => Sejour::where('statut', Sejour::STATUT_EN_COURS)->count(),
            Sejour::STATUT_TERMINE => Sejour::where('statut', Sejour::STATUT_TERMINE)->count(),
        ];

        $sejoursRecents = Sejour::query()
            ->select('id', 'appartement_id', 'nom_voyageur', 'date_arrivee', 'statut')
            ->with('appartement:id,nom')
            ->latest()
            ->latest('id')
            ->take(10)
            ->get();

        $departsAujourdhui = Sejour::query()
            ->select('id', 'reference', 'appartement_id', 'nom_voyageur', 'date_depart')
            ->where('statut', Sejour::STATUT_EN_COURS)
            ->whereDate('date_depart', now())
            ->with(['appartement:id,nom', 'voyageurs' => fn ($query) => $query->where('est_principal', true)])
            ->orderBy('date_depart')
            ->get()
            ->map(fn (Sejour $sejour) => [
                'id' => $sejour->id,
                'reference' => $sejour->reference,
                'voyageur_principal' => $sejour->nom_voyageur,
                'telephone_voyageur' => $sejour->voyageurs->first()?->telephone,
                'appartement' => $sejour->appartement ? [
                    'id' => $sejour->appartement->id,
                    'nom' => $sejour->appartement->nom,
                ] : null,
            ]);

        $problemesSignales = TicketMaintenance::query()
            ->select('id', 'appartement_id', 'photo_url', 'description', 'urgence', 'statut')
            ->whereIn('statut', [
                TicketMaintenance::STATUT_OUVERT,
                TicketMaintenance::STATUT_ASSIGNE,
                TicketMaintenance::STATUT_A_REFAIRE,
            ])
            ->with('appartement:id,nom,adresse')
            ->latest()
            ->latest('id')
            ->get();

        $menagesAValider = MissionMenage::query()
            ->select('id', 'sejour_id')
            ->where('statut', MissionMenage::STATUT_EN_ATTENTE_VALIDATION)
            ->with('sejour:id,appartement_id,nom_voyageur', 'sejour.appartement:id,nom,adresse')
            ->latest()
            ->latest('id')
            ->get()
            ->map(fn (MissionMenage $mission) => [
                'id' => $mission->id,
                'sejour_id' => $mission->sejour_id,
                'nom_voyageur' => $mission->sejour?->nom_voyageur,
                'appartement' => $mission->sejour?->appartement,
            ]);

        $resolutionsAValider = TicketMaintenance::query()
            ->select('id', 'appartement_id', 'photo_apres', 'cout_reparation', 'description_manager', 'statut')
            ->where('statut', TicketMaintenance::STATUT_RESOLU_EN_ATTENTE_VALIDATION)
            ->with('appartement:id,nom,adresse')
            ->latest()
            ->latest('id')
            ->get();

        return response()->json([
            'revenus_totaux' => $revenusTotaux,
            'frais_menage_totaux' => $fraisMenageTotaux,
            'frais_maintenance_totaux' => $fraisMaintenanceTotaux,
            'resultat_net' => $resultatNet,
            'appartements' => $appartements,
            'sejours_par_statut' => $sejoursParStatut,
            'sejours_recents' => $sejoursRecents,
            'departs_aujourdhui' => $departsAujourdhui,
            'problemes_signales' => $problemesSignales,
            'menages_a_valider' => $menagesAValider,
            'resolutions_a_valider' => $resolutionsAValider,
        ]);
    }
}
